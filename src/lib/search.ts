import { conversations, db } from "./db"
import { hitsToCitations, retrieve } from "./rag"
import type { Citation, Conversation, ID, Message, Settings } from "./types"

export interface MessageHit {
  message: Message
  conversation: Conversation | undefined
  excerpt: string
}

const excerptAround = (text: string, needle: string, radius = 90) => {
  const at = text.toLowerCase().indexOf(needle)
  if (at < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  return `${start ? "…" : ""}${text.slice(start, at + needle.length + radius)}${
    at + needle.length + radius < text.length ? "…" : ""
  }`
}

/** IndexedDB has no text index, so cursor every message and stop early. */
export async function searchMessages(query: string, limit = 30): Promise<MessageHit[]> {
  const needle = query.toLowerCase().trim()
  if (needle.length < 2) return []
  const d = await db()
  const convs = new Map<ID, Conversation>()
  for (const c of await conversations.all()) convs.set(c.id, c)

  const hits: MessageHit[] = []
  let cursor = await d.transaction("messages").store.index("createdAt").openCursor(null, "prev")
  let scanned = 0
  while (cursor && hits.length < limit && scanned < 40_000) {
    scanned++
    const msg = cursor.value
    if (msg.content.toLowerCase().includes(needle) && !convs.get(msg.conversationId)?.trashedAt)
      hits.push({
        message: msg,
        conversation: convs.get(msg.conversationId),
        excerpt: excerptAround(msg.content, needle),
      })
    cursor = await cursor.continue()
  }
  return hits
}

export async function searchKnowledge(
  query: string,
  settings: Settings,
  collectionIds: ID[],
  k = 8
): Promise<Citation[]> {
  if (!collectionIds.length) return []
  return hitsToCitations(await retrieve(query, collectionIds, settings, k))
}
