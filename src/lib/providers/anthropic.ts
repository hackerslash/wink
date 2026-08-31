import type { ModelInfo } from "../types"
import { inferCapabilities, inferPrice, prettyModelName } from "./capabilities"
import { assertOk, joinUrl, sse, type ChatMsg, type ModelProvider } from "./types"

function headers(key: string | null, extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    // Required for direct browser calls; the app has no server of its own.
    "anthropic-dangerous-direct-browser-access": "true",
    ...(key ? { "x-api-key": key } : {}),
    ...extra,
  }
}

function toBlocks(content: ChatMsg["content"]) {
  if (typeof content === "string") return [{ type: "text", text: content }]
  return content.map((p) => {
    if (p.type === "image")
      return {
        type: "image",
        source: { type: "base64", media_type: p.mime, data: p.data },
      }
    if (p.type === "file")
      return {
        type: "document",
        source: { type: "base64", media_type: p.mime, data: p.data },
      }
    return { type: "text", text: p.text ?? "" }
  })
}

function toMessages(messages: ChatMsg[]) {
  const out: { role: "user" | "assistant"; content: unknown[] }[] = []
  const push = (role: "user" | "assistant", blocks: unknown[]) => {
    const last = out[out.length - 1]
    if (last?.role === role) last.content.push(...blocks)
    else out.push({ role, content: blocks })
  }
  for (const m of messages) {
    if (m.role === "tool") {
      push("user", [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: String(m.content).slice(0, 100_000),
        },
      ])
      continue
    }
    const blocks: unknown[] = []
    const text = typeof m.content === "string" ? m.content : ""
    if (typeof m.content === "string") {
      if (text.trim()) blocks.push({ type: "text", text })
    } else blocks.push(...toBlocks(m.content))
    for (const t of m.toolCalls ?? [])
      blocks.push({ type: "tool_use", id: t.id, name: t.name, input: t.args ?? {} })
    if (blocks.length) push(m.role, blocks)
  }
  return out
}

interface Event {
  type: string
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string }
  content_block?: { type: string; id?: string; name?: string }
  message?: { usage?: { input_tokens?: number; output_tokens?: number } }
  usage?: { input_tokens?: number; output_tokens?: number }
  index?: number
  error?: { message?: string }
}

export const anthropicProvider: ModelProvider = {
  kind: "anthropic",

  async listModels(cfg, key) {
    const res = await fetch(joinUrl(cfg.baseUrl, "models?limit=200"), {
      headers: headers(key, cfg.headers),
    })
    await assertOk(res)
    const json = (await res.json()) as { data: { id: string; display_name?: string }[] }
    return json.data.map<ModelInfo>((m) => ({
      id: m.id,
      providerId: cfg.id,
      label: m.display_name ?? prettyModelName(m.id),
      capabilities: inferCapabilities(m.id, "anthropic"),
      price: inferPrice(m.id),
    }))
  },

  async *stream(cfg, key, req) {
    const caps = inferCapabilities(req.model, "anthropic")
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toMessages(req.messages),
      max_tokens: req.maxTokens || Math.min(caps.maxOutput || 8192, 16_384),
      stream: true,
    }
    if (req.system) body.system = req.system
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.topP !== undefined && req.temperature === undefined) body.top_p = req.topP
    if (req.tools?.length)
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    if (req.reasoningEffort && caps.reasoning) {
      const budget = { low: 2048, medium: 8192, high: 20_000 }[req.reasoningEffort]
      body.thinking = { type: "enabled", budget_tokens: budget }
      body.max_tokens = Math.max(Number(body.max_tokens), budget + 4096)
      delete body.temperature
      delete body.top_p
    }

    const res = await fetch(joinUrl(cfg.baseUrl, "messages"), {
      method: "POST",
      headers: headers(key, cfg.headers),
      body: JSON.stringify(body),
      signal: req.signal,
    })
    await assertOk(res)

    const blocks = new Map<number, { id: string; name: string; json: string }>()
    let usage = { in: 0, out: 0 }
    for await (const data of sse(res)) {
      if (!data) continue
      let ev: Event
      try {
        ev = JSON.parse(data) as Event
      } catch {
        continue
      }
      switch (ev.type) {
        case "message_start":
          usage = { in: ev.message?.usage?.input_tokens ?? 0, out: 0 }
          break
        case "content_block_start":
          if (ev.content_block?.type === "tool_use")
            blocks.set(ev.index ?? 0, {
              id: ev.content_block.id ?? crypto.randomUUID(),
              name: ev.content_block.name ?? "",
              json: "",
            })
          break
        case "content_block_delta": {
          const d = ev.delta
          if (d?.text) yield { text: d.text }
          if (d?.thinking) yield { reasoning: d.thinking }
          if (d?.partial_json !== undefined) {
            const slot = blocks.get(ev.index ?? 0)
            if (slot) slot.json += d.partial_json
          }
          break
        }
        case "content_block_stop": {
          const slot = blocks.get(ev.index ?? 0)
          if (slot) {
            let args: unknown
            try {
              args = slot.json ? JSON.parse(slot.json) : {}
            } catch {
              args = { _raw: slot.json }
            }
            yield { toolCall: { id: slot.id, name: slot.name, args } }
            blocks.delete(ev.index ?? 0)
          }
          break
        }
        case "message_delta":
          usage.out = ev.usage?.output_tokens ?? usage.out
          break
        case "message_stop":
          yield { usage }
          break
        case "error":
          throw new Error(ev.error?.message ?? "stream error")
      }
    }
  },
}
