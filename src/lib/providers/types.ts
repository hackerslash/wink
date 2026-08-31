import type { ModelInfo, ProviderConfig, Usage } from "../types"

export interface ContentPart {
  type: "text" | "image" | "file"
  text?: string
  mime?: string
  /** Base64 without the data: prefix. */
  data?: string
  name?: string
}

export interface ChatMsg {
  role: "user" | "assistant" | "tool"
  content: string | ContentPart[]
  /** Assistant tool requests. */
  toolCalls?: { id: string; name: string; args: unknown }[]
  /** Tool result plumbing. */
  toolCallId?: string
  name?: string
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatRequest {
  model: string
  system?: string
  messages: ChatMsg[]
  temperature?: number
  topP?: number
  maxTokens?: number | null
  tools?: ToolSpec[]
  json?: boolean
  reasoningEffort?: "low" | "medium" | "high"
  signal?: AbortSignal
}

export interface ChatDelta {
  text?: string
  reasoning?: string
  /** Emitted once per tool call when its arguments are complete. */
  toolCall?: { id: string; name: string; args: unknown }
  usage?: Usage
}

export interface ModelProvider {
  kind: ProviderConfig["kind"]
  listModels(cfg: ProviderConfig, key: string | null): Promise<ModelInfo[]>
  stream(
    cfg: ProviderConfig,
    key: string | null,
    req: ChatRequest
  ): AsyncGenerator<ChatDelta>
  embed?(
    cfg: ProviderConfig,
    key: string | null,
    model: string,
    texts: string[]
  ): Promise<number[][]>
}

/** Line-oriented SSE reader that tolerates chunk boundaries mid-event. */
export async function* sse(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")
  const decoder = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "")
      buf = buf.slice(nl + 1)
      if (line.startsWith("data:")) yield line.slice(5).trim()
      else if (line.startsWith("{")) yield line
    }
  }
  if (buf.startsWith("data:")) yield buf.slice(5).trim()
}

export async function assertOk(res: Response) {
  if (res.ok) return
  let detail = ""
  try {
    const body = await res.text()
    try {
      const j = JSON.parse(body) as { error?: { message?: string } | string }
      detail =
        typeof j.error === "string" ? j.error : (j.error?.message ?? body.slice(0, 400))
    } catch {
      detail = body.slice(0, 400)
    }
  } catch {
    /* body already consumed */
  }
  throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`)
}

export const joinUrl = (base: string, path: string) =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
