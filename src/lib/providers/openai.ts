import type { ModelInfo, ProviderConfig } from "../types"
import { inferCapabilities, inferPrice, prettyModelName } from "./capabilities"
import { assertOk, joinUrl, sse, type ChatDelta, type ChatMsg, type ModelProvider } from "./types"

function headers(cfg: ProviderConfig, key: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...cfg.headers }
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

function toContent(content: ChatMsg["content"]) {
  if (typeof content === "string") return content
  return content.map((p) => {
    if (p.type === "image")
      return { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}` } }
    if (p.type === "file")
      return {
        type: "file",
        file: { filename: p.name, file_data: `data:${p.mime};base64,${p.data}` },
      }
    return { type: "text", text: p.text ?? "" }
  })
}

function toMessages(req: { system?: string; messages: ChatMsg[] }) {
  const out: Record<string, unknown>[] = []
  if (req.system) out.push({ role: "system", content: req.system })
  for (const m of req.messages) {
    if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: String(m.content) })
      continue
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: typeof m.content === "string" ? m.content || null : toContent(m.content),
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) },
        })),
      })
      continue
    }
    out.push({ role: m.role, content: toContent(m.content) })
  }
  return out
}

interface StreamChunk {
  choices?: {
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

export const openaiProvider: ModelProvider = {
  kind: "openai",

  async listModels(cfg, key) {
    const res = await fetch(joinUrl(cfg.baseUrl, "models"), { headers: headers(cfg, key) })
    await assertOk(res)
    const json = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] }
    const ids = json.data?.map((m) => m.id) ?? json.models?.map((m) => m.name) ?? []
    return ids
      .filter((id) => !/whisper|tts|dall-e|moderation|image|audio|realtime/i.test(id))
      .sort()
      .map<ModelInfo>((id) => ({
        id,
        providerId: cfg.id,
        label: prettyModelName(id),
        capabilities: inferCapabilities(id, cfg.kind),
        price: inferPrice(id),
      }))
  },

  async *stream(cfg, key, req) {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toMessages(req),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.topP !== undefined) body.top_p = req.topP
    if (req.maxTokens) body.max_tokens = req.maxTokens
    if (req.json) body.response_format = { type: "json_object" }
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort
    if (req.tools?.length)
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))

    const res = await fetch(joinUrl(cfg.baseUrl, "chat/completions"), {
      method: "POST",
      headers: headers(cfg, key),
      body: JSON.stringify(body),
      signal: req.signal,
    })
    await assertOk(res)

    const pending = new Map<number, { id: string; name: string; args: string }>()
    for await (const data of sse(res)) {
      if (!data || data === "[DONE]") continue
      let chunk: StreamChunk
      try {
        chunk = JSON.parse(data) as StreamChunk
      } catch {
        continue
      }
      if (chunk.usage)
        yield {
          usage: { in: chunk.usage.prompt_tokens ?? 0, out: chunk.usage.completion_tokens ?? 0 },
        }
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      const reasoning = delta.reasoning_content ?? delta.reasoning
      if (reasoning) yield { reasoning }
      if (delta.content) yield { text: delta.content }
      for (const tc of delta.tool_calls ?? []) {
        const slot = pending.get(tc.index) ?? { id: "", name: "", args: "" }
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.name = tc.function.name
        if (tc.function?.arguments) slot.args += tc.function.arguments
        pending.set(tc.index, slot)
      }
    }
    for (const slot of pending.values()) {
      if (!slot.name) continue
      let args: unknown
      try {
        args = slot.args ? JSON.parse(slot.args) : {}
      } catch {
        args = { _raw: slot.args }
      }
      yield { toolCall: { id: slot.id || crypto.randomUUID(), name: slot.name, args } } as ChatDelta
    }
  },

  async embed(cfg, key, model, texts) {
    const res = await fetch(joinUrl(cfg.baseUrl, "embeddings"), {
      method: "POST",
      headers: headers(cfg, key),
      body: JSON.stringify({ model, input: texts }),
    })
    await assertOk(res)
    const json = (await res.json()) as { data: { embedding: number[] }[] }
    return json.data.map((d) => d.embedding)
  },
}
