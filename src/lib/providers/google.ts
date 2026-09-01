import type { ModelInfo } from "../types"
import { NON_CHAT, inferCapabilities, inferPrice, prettyModelName } from "./capabilities"
import { assertOk, joinUrl, sse, type ChatMsg, type ModelProvider } from "./types"

const bare = (m: string) => m.replace(/^models\//, "")

function toParts(content: ChatMsg["content"]) {
  if (typeof content === "string") return [{ text: content }]
  return content.map((p) =>
    p.type === "text"
      ? { text: p.text ?? "" }
      : { inlineData: { mimeType: p.mime, data: p.data } }
  )
}

function toContents(messages: ChatMsg[]) {
  const out: { role: "user" | "model"; parts: unknown[] }[] = []
  const push = (role: "user" | "model", parts: unknown[]) => {
    const last = out[out.length - 1]
    if (last?.role === role) last.parts.push(...parts)
    else out.push({ role, parts })
  }
  for (const m of messages) {
    if (m.role === "tool") {
      push("user", [
        {
          functionResponse: {
            name: m.name ?? "tool",
            response: { result: String(m.content).slice(0, 100_000) },
          },
        },
      ])
      continue
    }
    const role = m.role === "assistant" ? "model" : "user"
    const parts: unknown[] = []
    if (typeof m.content === "string") {
      if (m.content.trim()) parts.push({ text: m.content })
    } else parts.push(...toParts(m.content))
    for (const t of m.toolCalls ?? [])
      parts.push({ functionCall: { name: t.name, args: t.args ?? {} } })
    if (parts.length) push(role, parts)
  }
  return out
}

interface GChunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name: string; args: unknown } }[] }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/** Gemini rejects unsupported JSON Schema keywords; keep only what it knows. */
function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema)
  if (!schema || typeof schema !== "object") return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (["additionalProperties", "$schema", "default", "examples", "title"].includes(k)) continue
    out[k] = cleanSchema(v)
  }
  return out
}

export const googleProvider: ModelProvider = {
  kind: "google",

  async listModels(cfg, key) {
    const res = await fetch(joinUrl(cfg.baseUrl, `models?key=${key ?? ""}&pageSize=200`), {
      headers: cfg.headers,
    })
    await assertOk(res)
    const json = (await res.json()) as {
      models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
    }
    return json.models
      .map((m) => ({ ...m, id: bare(m.name), methods: m.supportedGenerationMethods ?? [] }))
      .filter(
        (m) =>
          !NON_CHAT.test(m.id) &&
          (!m.methods.length ||
            m.methods.some((s) => /generateContent|embedContent/.test(s)))
      )
      .map<ModelInfo>((m) => {
        const embedding = m.methods.some((s) => /embedContent/i.test(s))
        const caps = inferCapabilities(m.id, "google")
        return {
          id: m.id,
          providerId: cfg.id,
          label: m.displayName ?? prettyModelName(m.name),
          capabilities: embedding
            ? { ...caps, embedding: true, streaming: false, tools: false, maxOutput: 0 }
            : caps,
          price: inferPrice(m.id),
        }
      })
  },

  async *stream(cfg, key, req) {
    const body: Record<string, unknown> = {
      contents: toContents(req.messages),
      generationConfig: {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.topP !== undefined ? { topP: req.topP } : {}),
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    }
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] }
    if (req.tools?.length)
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: cleanSchema(t.parameters),
          })),
        },
      ]

    const url = joinUrl(
      cfg.baseUrl,
      `models/${bare(req.model)}:streamGenerateContent?alt=sse&key=${key ?? ""}`
    )
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cfg.headers },
      body: JSON.stringify(body),
      signal: req.signal,
    })
    await assertOk(res)

    let usage = { in: 0, out: 0 }
    for await (const data of sse(res)) {
      if (!data) continue
      let chunk: GChunk
      try {
        chunk = JSON.parse(data) as GChunk
      } catch {
        continue
      }
      if (chunk.usageMetadata)
        usage = {
          in: chunk.usageMetadata.promptTokenCount ?? usage.in,
          out: chunk.usageMetadata.candidatesTokenCount ?? usage.out,
        }
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall)
          yield {
            toolCall: {
              id: crypto.randomUUID(),
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            },
          }
        else if (part.text) yield part.thought ? { reasoning: part.text } : { text: part.text }
      }
    }
    yield { usage }
  },

  async embed(cfg, key, model, texts) {
    const url = joinUrl(cfg.baseUrl, `models/${bare(model)}:batchEmbedContents?key=${key ?? ""}`)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cfg.headers },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${bare(model)}`,
          content: { parts: [{ text: t }] },
        })),
      }),
    })
    await assertOk(res)
    const json = (await res.json()) as { embeddings: { values: number[] }[] }
    return json.embeddings.map((e) => e.values)
  },
}
