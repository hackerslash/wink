import {
  assistants,
  attachments,
  chunks,
  collections,
  conversations,
  docs,
  folders,
  kv,
  memories,
  messages,
  presets,
  providers,
  uid,
} from "./db"
import type { Conversation, ID, Message } from "./types"

export function download(name: string, content: string | Blob, mime = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "conversation"

export function conversationToMarkdown(conv: Conversation, msgs: Message[]) {
  const lines = [
    `# ${conv.title}`,
    "",
    `> ${new Date(conv.createdAt).toLocaleString()} · ${conv.model}`,
    "",
  ]
  for (const m of msgs) {
    if (m.role === "system") continue
    lines.push(`## ${m.role === "user" ? "You" : (m.model ?? "Assistant")}`, "")
    if (m.reasoning) lines.push(`<details><summary>Reasoning</summary>\n\n${m.reasoning}\n\n</details>`, "")
    lines.push(m.content, "")
    for (const t of m.toolCalls ?? [])
      lines.push(
        `<details><summary>🔧 ${t.name}</summary>\n\n\`\`\`json\n${JSON.stringify(
          { args: t.args, result: t.result },
          null,
          2
        ).slice(0, 4000)}\n\`\`\`\n\n</details>`,
        ""
      )
    if (m.citations?.length) {
      lines.push("**Sources**", "")
      for (const c of m.citations) lines.push(`${c.n}. ${c.title}${c.url ? ` — ${c.url}` : ""}`)
      lines.push("")
    }
  }
  return lines.join("\n")
}

export async function exportConversation(id: ID, format: "json" | "md") {
  const conv = await conversations.get(id)
  if (!conv) return
  const msgs = await messages.byConversation(id)
  if (format === "md")
    download(`${slug(conv.title)}.md`, conversationToMarkdown(conv, msgs), "text/markdown")
  else download(`${slug(conv.title)}.json`, JSON.stringify({ conversation: conv, messages: msgs }, null, 2))
}

export interface Backup {
  app: "wink"
  version: 1
  exportedAt: number
  conversations: unknown[]
  messages: unknown[]
  folders: unknown[]
  assistants: unknown[]
  presets: unknown[]
  providers: unknown[]
  memories: unknown[]
  collections: unknown[]
  docs: unknown[]
  chunks: unknown[]
  settings: unknown
  /** Secrets are deliberately excluded. */
  secretsIncluded: false
}

export async function exportBackup(opts = { knowledge: true }): Promise<Backup> {
  const chunkRows = opts.knowledge ? await chunks.all() : []
  return {
    app: "wink",
    version: 1,
    exportedAt: Date.now(),
    conversations: await conversations.all(),
    messages: await messages.all(),
    folders: await folders.all(),
    assistants: await assistants.all(),
    presets: await presets.all(),
    providers: (await providers.all()).map((p) => ({ ...p, hasKey: false })),
    memories: await memories.all(),
    collections: opts.knowledge ? await collections.all() : [],
    docs: opts.knowledge ? await docs.all() : [],
    // Float32Array does not survive JSON; store plain arrays.
    chunks: chunkRows.map((c) => ({ ...c, vector: c.vector ? Array.from(c.vector) : undefined })),
    settings: await kv.get("settings"),
    secretsIncluded: false,
  }
}

export async function importBackup(data: Backup, mode: "merge" | "replace") {
  if (data.app !== "wink") throw new Error("Not a wink backup file")
  if (mode === "replace") {
    for (const t of [conversations, messages, folders, assistants, presets, memories, collections, docs, chunks])
      await t.clear()
  }
  const remap = new Map<string, string>()
  const idFor = (old: string) => {
    if (mode === "replace") return old
    if (!remap.has(old)) remap.set(old, uid())
    return remap.get(old)!
  }

  await folders.putMany((data.folders as never[]).map((f) => ({ ...(f as object) }) as never))
  await assistants.putMany((data.assistants as never[]).map((a) => ({ ...(a as object) }) as never))
  await presets.putMany((data.presets as never[]).map((p) => ({ ...(p as object) }) as never))
  await memories.putMany((data.memories as never[]).map((m) => ({ ...(m as object) }) as never))
  await providers.putMany((data.providers as never[]).map((p) => ({ ...(p as object) }) as never))
  await collections.putMany((data.collections as never[]).map((c) => ({ ...(c as object) }) as never))
  await docs.putMany((data.docs as never[]).map((d) => ({ ...(d as object) }) as never))
  await chunks.putMany(
    (data.chunks as { vector?: number[] }[]).map((c) => ({
      ...(c as object),
      vector: c.vector ? new Float32Array(c.vector) : undefined,
    })) as never[]
  )

  const convs = data.conversations as Conversation[]
  const msgs = data.messages as Message[]
  for (const conv of convs) await conversations.put({ ...conv, id: idFor(conv.id) })
  await messages.putMany(
    msgs.map((m) => ({
      ...m,
      id: idFor(m.id),
      conversationId: idFor(m.conversationId),
      parentId: m.parentId ? idFor(m.parentId) : null,
    }))
  )
  for (const conv of convs) {
    const mapped = await conversations.get(idFor(conv.id))
    if (mapped?.headId) await conversations.put({ ...mapped, headId: idFor(mapped.headId) })
  }
  return { conversations: convs.length, messages: msgs.length }
}

export async function importChatGptExport(json: unknown) {
  // ChatGPT exports an array of conversations with a mapping tree.
  const list = json as {
    title?: string
    create_time?: number
    mapping: Record<
      string,
      { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number }; parent?: string | null }
    >
  }[]
  if (!Array.isArray(list)) throw new Error("Unrecognised export format")
  let count = 0
  for (const item of list) {
    const convId = uid()
    const rows: Message[] = []
    const idMap = new Map<string, string>()
    for (const key of Object.keys(item.mapping ?? {})) idMap.set(key, uid())
    for (const [key, node] of Object.entries(item.mapping ?? {})) {
      const role = node.message?.author?.role
      if (role !== "user" && role !== "assistant") continue
      const text = (node.message?.content?.parts ?? [])
        .map((p) => (typeof p === "string" ? p : ""))
        .join("\n")
        .trim()
      if (!text) continue
      rows.push({
        id: idMap.get(key)!,
        conversationId: convId,
        parentId: node.parent ? (idMap.get(node.parent) ?? null) : null,
        role,
        content: text,
        createdAt: (node.message?.create_time ?? item.create_time ?? Date.now() / 1000) * 1000,
      })
    }
    if (!rows.length) continue
    rows.sort((a, b) => a.createdAt - b.createdAt)
    // Parents may point at system nodes that were skipped; relink linearly.
    const present = new Set(rows.map((r) => r.id))
    for (const [i, r] of rows.entries())
      if (!r.parentId || !present.has(r.parentId)) r.parentId = i ? rows[i - 1].id : null
    await messages.putMany(rows)
    await conversations.put({
      id: convId,
      title: item.title ?? "Imported chat",
      createdAt: rows[0].createdAt,
      updatedAt: rows[rows.length - 1].createdAt,
      folderId: null,
      assistantId: null,
      pinned: false,
      archived: false,
      trashedAt: null,
      tags: ["imported"],
      headId: rows[rows.length - 1].id,
      model: "imported",
      providerId: "",
      params: (await kv.get<{ defaultParams: never }>("settings"))?.defaultParams ?? ({} as never),
    })
    count++
  }
  return count
}

export async function attachmentUsage() {
  const rows = await attachments.all()
  return rows.reduce((n, r) => n + r.blob.size, 0)
}
