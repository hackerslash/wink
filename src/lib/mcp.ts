import { uid } from "./db"

export interface McpServer {
  id: string
  slug: string
  name: string
  url: string
  headers?: Record<string, string>
  enabled: boolean
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

let nextId = 1

/**
 * Minimal MCP client over Streamable HTTP: initialize → tools/list → tools/call.
 * Servers must send permissive CORS headers; browsers cannot reach stdio servers.
 */
async function rpc<T>(server: McpServer, method: string, params?: unknown): Promise<T> {
  const res = await fetch(server.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...server.headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  })
  if (!res.ok) throw new Error(`${server.name}: ${res.status} ${res.statusText}`)
  const raw = await res.text()
  // Streamable HTTP may answer with SSE framing even for a single response.
  const payload = raw.startsWith("event:") || raw.startsWith("data:")
    ? raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("")
    : raw
  const json = JSON.parse(payload) as { result?: T; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result as T
}

export async function listMcpTools(server: McpServer): Promise<McpTool[]> {
  await rpc(server, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "wink", version: "1.0.0" },
  })
  const res = await rpc<{ tools: McpTool[] }>(server, "tools/list")
  return res.tools ?? []
}

export async function callMcpTool(
  server: McpServer,
  name: string,
  args: unknown
): Promise<string> {
  const res = await rpc<{ content?: { type: string; text?: string }[]; isError?: boolean }>(
    server,
    "tools/call",
    { name, arguments: args }
  )
  const text = (res.content ?? [])
    .map((c) => c.text ?? `[${c.type}]`)
    .join("\n")
    .trim()
  if (res.isError) throw new Error(text || "tool error")
  return text || "(no content)"
}

export const newMcpServer = (): McpServer => ({
  id: uid(),
  slug: "mcp",
  name: "",
  url: "",
  enabled: true,
})
