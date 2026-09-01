import { toolAudit, uid } from "./db"
import { callMcpTool, listMcpTools, type McpServer } from "./mcp"
import { hitsToCitations, retrieve } from "./rag"
import type { Citation, ID, Settings } from "./types"
import { vault } from "./vault"

export interface ToolContext {
  settings: Settings
  conversationId: ID
  messageId: ID
  signal?: AbortSignal
  /** Resolves once the user allows (or denies) this call. */
  requestPermission: (tool: ToolDef, args: unknown) => Promise<boolean>
  collections: ID[]
  /** Highest citation number already used this turn; number new ones above it. */
  citationOffset: number
}

export interface ToolResult {
  output: string
  citations?: Citation[]
  data?: unknown
}

export interface ToolDef {
  name: string
  title: string
  description: string
  icon: string
  parameters: Record<string, unknown>
  /** Side-effect free tools can skip the permission prompt. */
  sensitive: boolean
  network: boolean
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback)
const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback)

// ------------------------------------------------------------------ search

export interface WebResult {
  title: string
  url: string
  snippet: string
}

export async function webSearch(
  query: string,
  settings: Settings,
  count = 6,
  signal?: AbortSignal
): Promise<WebResult[]> {
  const { kind, endpoint } = settings.search
  const key = settings.search.hasKey ? await vault.getSecret("search") : null
  if (kind === "none") throw new Error("No web search provider configured (Settings → Tools)")

  if (kind === "tavily") {
    const res = await fetch(endpoint || "https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key ?? ""}` },
      body: JSON.stringify({ query, max_results: count, search_depth: "advanced" }),
      signal,
    })
    if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { results: { title: string; url: string; content: string }[] }
    return json.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content }))
  }

  if (kind === "brave") {
    const url = new URL(endpoint || "https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", query)
    url.searchParams.set("count", String(count))
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key ?? "" },
      signal,
    })
    if (!res.ok) throw new Error(`Brave ${res.status}`)
    const json = (await res.json()) as {
      web?: { results: { title: string; url: string; description: string }[] }
    }
    return (json.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }))
  }

  if (kind === "firecrawl") {
    const res = await fetch(endpoint || "https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key ?? ""}` },
      body: JSON.stringify({ query, limit: count }),
      signal,
    })
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as {
      data?: { url: string; title?: string; description?: string; markdown?: string }[]
    }
    return (json.data ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      snippet: r.description ?? r.markdown?.slice(0, 400) ?? "",
    }))
  }

  if (kind === "searxng") {
    const url = new URL(`${(endpoint || "http://localhost:8888").replace(/\/$/, "")}/search`)
    url.searchParams.set("q", query)
    url.searchParams.set("format", "json")
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`SearXNG ${res.status}`)
    const json = (await res.json()) as {
      results: { title: string; url: string; content: string }[]
    }
    return json.results.slice(0, count).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }))
  }

  // Jina reader search returns markdown blocks; parse the numbered entries.
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
    headers: {
      Accept: "text/plain",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "X-Respond-With": "no-content",
    },
    signal,
  })
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? "Jina search needs an API key. Add one under Web search in Settings."
        : `Jina search ${res.status}`,
    )
  const text = await res.text()
  const out: WebResult[] = []
  for (const block of text.split(/\n(?=\[\d+\]|\d+\.\s)/)) {
    const title = block.match(/Title:\s*(.+)/)?.[1]
    const url = block.match(/URL Source:\s*(\S+)/)?.[1] ?? block.match(/https?:\/\/\S+/)?.[0]
    if (!url) continue
    out.push({
      title: title ?? url,
      url,
      snippet: block.match(/Description:\s*(.+)/)?.[1] ?? block.slice(0, 300),
    })
    if (out.length >= count) break
  }
  return out
}

export async function fetchPage(url: string, settings: Settings, signal?: AbortSignal) {
  const key = settings.search.hasKey ? await vault.getSecret("search") : null

  if (settings.reader.kind === "firecrawl") {
    // Derive the scrape URL from the search endpoint so self-hosted Firecrawl
    // works with one setting.
    const base =
      settings.search.kind === "firecrawl" && settings.search.endpoint
        ? settings.search.endpoint.replace(/\/search\/?$/, "")
        : "https://api.firecrawl.dev/v1"
    const res = await fetch(`${base}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key ?? ""}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal,
    })
    if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string } }
    }
    const title = json.data?.metadata?.title
    const body = json.data?.markdown ?? ""
    if (!body) throw new Error("Firecrawl returned no content")
    return `${title ? `Title: ${title}\nURL Source: ${url}\n\n` : ""}${body}`.slice(0, 60_000)
  }

  const reader = settings.reader.endpoint || "https://r.jina.ai/"
  const target = reader ? `${reader.replace(/\/$/, "")}/${url}` : url
  const res = await fetch(target, {
    headers: {
      Accept: "text/plain",
      ...(key && reader.includes("jina") ? { Authorization: `Bearer ${key}` } : {}),
    },
    signal,
  })
  if (!res.ok) throw new Error(`Fetch failed (${res.status}). Reader endpoint: ${reader}`)
  return (await res.text()).slice(0, 60_000)
}

// ------------------------------------------------------------- js sandbox

function runSandboxed(code: string, timeoutMs = 4000): Promise<string> {
  const src = `self.onmessage=async(e)=>{const logs=[];const console={log:(...a)=>logs.push(a.map(String).join(' ')),error:(...a)=>logs.push('ERR '+a.map(String).join(' '))};try{const fn=new Function('console','return (async()=>{'+e.data+'\\n})()');const r=await fn(console);self.postMessage({ok:true,logs,result:r===undefined?undefined:JSON.stringify(r,null,2)})}catch(err){self.postMessage({ok:false,logs,error:String(err)})}}`
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }))
  const worker = new Worker(url)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate()
      URL.revokeObjectURL(url)
      reject(new Error(`Timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    worker.onmessage = (e: MessageEvent<{ ok: boolean; logs: string[]; result?: string; error?: string }>) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      const { ok, logs, result, error } = e.data
      const parts = [logs.length ? logs.join("\n") : "", result ? `→ ${result}` : ""].filter(Boolean)
      if (!ok) reject(new Error(error ?? "error"))
      else resolve(parts.join("\n") || "(no output)")
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      worker.terminate()
      reject(new Error(e.message))
    }
    worker.postMessage(code)
  })
}

// ---------------------------------------------------------------- builtins

export const BUILTIN_TOOLS: ToolDef[] = [
  {
    name: "web_search",
    title: "Web search",
    description:
      "Search the web for current information. Returns titles, URLs and snippets you must cite as [n].",
    icon: "search",
    sensitive: false,
    network: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (1-10)" },
      },
      required: ["query"],
    },
    async run(args, ctx) {
      const results = await webSearch(
        str(args.query),
        ctx.settings,
        Math.min(10, num(args.count, 6)),
        ctx.signal
      )
      const citations: Citation[] = results.map((r, i) => ({
        n: ctx.citationOffset + i + 1,
        title: r.title,
        url: r.url,
        snippet: r.snippet.slice(0, 300),
      }))
      return {
        output: results
          .map((r, i) => `[${citations[i].n}] ${r.title}\n${r.url}\n${r.snippet.slice(0, 500)}`)
          .join("\n\n"),
        citations,
        data: results,
      }
    },
  },
  {
    name: "fetch_url",
    title: "Read page",
    description: "Fetch a URL and return its readable text content as markdown.",
    icon: "link",
    sensitive: false,
    network: true,
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Absolute http(s) URL" } },
      required: ["url"],
    },
    async run(args, ctx) {
      const url = str(args.url)
      if (!/^https?:\/\//.test(url)) throw new Error("Only http(s) URLs are allowed")
      const text = await fetchPage(url, ctx.settings, ctx.signal)
      return {
        output: text.slice(0, 30_000),
        citations: [
          { n: ctx.citationOffset + 1, title: text.match(/Title:\s*(.+)/)?.[1] ?? url, url },
        ],
      }
    },
  },
  {
    name: "search_knowledge",
    title: "Search knowledge",
    description:
      "Semantic search across the user's local knowledge collections. Use for anything about their own documents.",
    icon: "book",
    sensitive: false,
    network: false,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        k: { type: "number", description: "How many passages (1-12)" },
      },
      required: ["query"],
    },
    async run(args, ctx) {
      const hits = await retrieve(
        str(args.query),
        ctx.collections,
        ctx.settings,
        Math.min(12, num(args.k, 6))
      )
      if (!hits.length) return { output: "No matching passages in the local collections." }
      const citations = await hitsToCitations(hits, ctx.citationOffset + 1)
      return {
        output: citations
          .map((c) => `[${c.n}] ${c.title}\n${c.snippet}`)
          .join("\n\n"),
        citations,
      }
    },
  },
  {
    name: "calculator",
    title: "Calculator",
    description: "Evaluate an arithmetic expression exactly. Supports + - * / % ** and Math.*",
    icon: "calc",
    sensitive: false,
    network: false,
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    async run(args) {
      const expr = str(args.expression)
      if (!/^[-+*/%().,\d\s^eE]*(Math\.[a-zA-Z]+|PI|E|[-+*/%().,\d\s])*$/.test(expr))
        throw new Error("Expression contains unsupported characters")
      const value = await runSandboxed(`return (${expr.replace(/\^/g, "**")})`, 1500)
      return { output: `${expr} = ${value.replace(/^→\s*/, "")}` }
    },
  },
  {
    name: "run_javascript",
    title: "Run JavaScript",
    description:
      "Execute JavaScript in a sandboxed worker with no DOM or storage access. Use console.log or return a value.",
    icon: "code",
    sensitive: true,
    network: false,
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "Body of an async function" } },
      required: ["code"],
    },
    async run(args) {
      return { output: await runSandboxed(str(args.code)) }
    },
  },
  {
    name: "current_time",
    title: "Current time",
    description: "The user's local date, time and timezone.",
    icon: "clock",
    sensitive: false,
    network: false,
    parameters: { type: "object", properties: {} },
    async run() {
      const now = new Date()
      return {
        output: `${now.toString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone}, ISO ${now.toISOString()})`,
      }
    },
  },
]

// -------------------------------------------------------------- the registry

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()

  constructor(defs: ToolDef[] = BUILTIN_TOOLS) {
    for (const def of defs) this.tools.set(def.name, def)
  }

  register(def: ToolDef) {
    this.tools.set(def.name, def)
  }

  unregister(name: string) {
    this.tools.delete(name)
  }

  get(name: string) {
    return this.tools.get(name)
  }

  list() {
    return [...this.tools.values()]
  }

  /** Tool specs for the model, filtered by what the user has not disabled. */
  specs(settings: Settings) {
    return this.list()
      .filter((t) => settings.toolPermissions[t.name] !== "never")
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))
  }

  /** Re-registers from scratch so removed, disabled and renamed servers drop out. */
  async loadMcp(servers: McpServer[]) {
    for (const def of this.list()) if (def.icon === "plug") this.unregister(def.name)
    for (const server of servers.filter((s) => s.enabled)) {
      try {
        for (const tool of await listMcpTools(server)) {
          const name = `${server.slug}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_")
          this.register({
            name,
            title: tool.name,
            description: `${tool.description ?? ""} (via ${server.name})`.trim(),
            icon: "plug",
            sensitive: true,
            network: true,
            parameters: tool.inputSchema ?? { type: "object", properties: {} },
            run: async (args) => ({
              output: await callMcpTool(server, tool.name, args),
            }),
          })
        }
      } catch (err) {
        console.warn(`MCP server ${server.name} unavailable:`, err)
      }
    }
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    const mode = ctx.settings.toolPermissions[name] ?? (tool.sensitive ? "ask" : "always")
    if (mode === "never") throw new Error(`${tool.title} is disabled`)
    if (mode === "ask" && !(await ctx.requestPermission(tool, args)))
      throw new Error("Denied by user")
    return tool.run(args, ctx)
  }

  async audit(entry: Omit<import("./db").ToolAuditEntry, "id" | "at">) {
    await toolAudit.put({ ...entry, id: uid(), at: Date.now() })
  }
}

export const tools = new ToolRegistry()
