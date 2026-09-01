import { attachments as attachmentStore } from "./db"
import type { ChatMsg, ContentPart } from "./providers"
import type {
  Attachment,
  Citation,
  MemoryItem,
  Message,
  ModelCapabilities,
  ProviderConfig,
} from "./types"

const IDENTITY = `You are Wink, a local-first AI workspace running entirely in the user's browser. Their conversations, memories and documents never leave their machine except as requests to the model provider they chose.
Be direct and specific. Lead with the answer. Skip flattery and filler. Use markdown for structure and fenced code blocks with a language tag for code.`

export interface SystemPromptParts {
  custom?: string
  memories?: MemoryItem[]
  knowledge?: Citation[]
  toolNames?: string[]
  research?: boolean
}

export function buildSystemPrompt(parts: SystemPromptParts) {
  const out = [parts.custom?.trim() || IDENTITY]
  if (parts.memories?.length)
    out.push(
      `## Memory\nDurable notes about the user. They may be stale — what the user says now wins.\n${parts.memories
        .map((m) => `- ${m.text}`)
        .join("\n")}`
    )
  if (parts.knowledge?.length)
    out.push(
      `## Retrieved from the user's knowledge base\nCite these as [n]. If they do not answer the question, say so instead of guessing.\n\n${parts.knowledge
        .map((c) => `[${c.n}] ${c.title}${c.collection ? ` · ${c.collection}` : ""}\n${c.snippet}`)
        .join("\n\n")}`
    )
  if (parts.toolNames?.length)
    out.push(
      `## Tools\nYou may call: ${parts.toolNames.join(", ")}. Prefer a tool over guessing for anything time-sensitive, factual or about the user's own documents. After a tool returns sources, cite them as [n].`
    )
  return out.join("\n\n")
}

const b64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function attachmentParts(
  list: Attachment[],
  caps: ModelCapabilities,
  allowUpload: boolean
): Promise<ContentPart[]> {
  const parts: ContentPart[] = []
  for (const att of list) {
    const canSendBinary = allowUpload && (att.kind === "image" ? caps.vision : caps.input.includes("pdf"))
    if (canSendBinary) {
      const blob = await attachmentStore.get(att.blobKey)
      if (blob) {
        parts.push({
          type: att.kind === "image" ? "image" : "file",
          mime: att.mime,
          data: b64(await blob.arrayBuffer()),
          name: att.name,
        })
        continue
      }
    }
    if (att.text)
      parts.push({
        type: "text",
        text: `<file name="${att.name}" type="${att.mime}">\n${att.text.slice(0, 120_000)}\n</file>`,
      })
    else
      parts.push({
        type: "text",
        text: `[attachment ${att.name} (${att.mime}) could not be sent to this model]`,
      })
  }
  return parts
}

/** Turns a branch path into provider-shaped messages, honouring model limits. */
export async function pathToRequestMessages(
  path: Message[],
  caps: ModelCapabilities,
  provider: ProviderConfig,
  limit = 0
): Promise<ChatMsg[]> {
  const usable = path.filter((m) => m.role !== "system" && (m.content.trim() || m.attachments?.length || m.toolCalls?.length))
  const recent = limit > 0 ? usable.slice(-limit) : usable
  const out: ChatMsg[] = []
  for (const m of recent) {
    if (m.role === "assistant") {
      const calls = (m.toolCalls ?? []).filter((t) => t.status === "done" || t.status === "error")
      out.push({
        role: "assistant",
        content: m.content,
        ...(caps.tools && calls.length
          ? { toolCalls: calls.map((t) => ({ id: t.id, name: t.name, args: t.args })) }
          : {}),
      })
      if (caps.tools)
        for (const t of calls)
          out.push({
            role: "tool",
            toolCallId: t.id,
            name: t.name,
            content:
              t.error ??
              (typeof t.result === "string" ? t.result : JSON.stringify(t.result ?? "")).slice(0, 60_000),
          })
      continue
    }
    if (m.attachments?.length) {
      const parts = await attachmentParts(m.attachments, caps, provider.allow.attachments)
      out.push({ role: "user", content: [...parts, { type: "text", text: m.content }] })
    } else out.push({ role: "user", content: m.content })
  }
  return out
}

/** Walks parent links from the head leaf back to the root. */
export function pathToHead(all: Message[], headId: string | null): Message[] {
  if (!headId) return []
  const byId = new Map(all.map((m) => [m.id, m]))
  const path: Message[] = []
  let cursor = byId.get(headId)
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id)
    path.push(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return path.reverse()
}

/** Siblings that share a parent — i.e. alternative branches at that point. */
export function siblingsOf(all: Message[], msg: Message): Message[] {
  return all
    .filter((m) => m.parentId === msg.parentId && m.role === msg.role)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function deepestLeaf(all: Message[], from: Message): Message {
  const children = all.filter((m) => m.parentId === from.id)
  if (!children.length) return from
  const newest = children.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
  return deepestLeaf(all, newest)
}

export const TITLE_PROMPT =
  "Give this conversation a title: 2-5 words, no quotes, no trailing punctuation, sentence case. Reply with the title only."
