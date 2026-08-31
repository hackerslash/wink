import { memories, uid } from "./db"
import { cosine } from "./embeddings"
import { streamChat } from "./providers"
import { embedTexts } from "./rag"
import type { MemoryItem, Message, ProviderConfig, Settings } from "./types"

const EXTRACT_PROMPT = `You maintain a long-term memory for a user of a personal AI workspace.
From the exchange below, extract only durable facts worth remembering for months: stable preferences, identity, ongoing projects, constraints, people, and explicit standing instructions.

Rules:
- Never store one-off task details, questions, or anything already obvious from context.
- Each memory is one self-contained sentence written in the third person about the user.
- Prefer 0 memories over a weak one. Return at most 3.

Reply with JSON only: {"memories":[{"text":"...","kind":"fact|preference|project|person|instruction"}]}`

function transcript(msgs: Message[]) {
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`)
    .join("\n\n")
}

/** Runs the extractor and merges the result into the memory store. */
export async function extractMemories(
  msgs: Message[],
  cfg: ProviderConfig,
  model: string,
  settings: Settings
): Promise<MemoryItem[]> {
  const text = transcript(msgs)
  if (text.length < 80) return []

  let raw = ""
  for await (const delta of streamChat(
    cfg,
    {
      model,
      system: EXTRACT_PROMPT,
      messages: [{ role: "user", content: text }],
      temperature: 0,
      maxTokens: 500,
      json: true,
    },
    { retries: 0 }
  ))
    raw += delta.text ?? ""

  let parsed: { memories?: { text?: string; kind?: MemoryItem["kind"] }[] }
  try {
    parsed = JSON.parse(raw.replace(/^[^{]*/, "").replace(/[^}]*$/, "")) as typeof parsed
  } catch {
    return []
  }
  const candidates = (parsed.memories ?? [])
    .map((m) => ({ text: (m.text ?? "").trim(), kind: m.kind ?? "fact" }))
    .filter((m) => m.text.length > 8 && m.text.length < 400)
  if (!candidates.length) return []

  const existing = await memories.all()
  const vectors = await embedTexts(
    candidates.map((c) => c.text),
    settings
  )
  const created: MemoryItem[] = []
  for (const [i, cand] of candidates.entries()) {
    const vec = vectors[i]
    const dupe = existing.find(
      (m) =>
        m.text.toLowerCase() === cand.text.toLowerCase() ||
        (m.embedding && vec && cosine(m.embedding, vec) > 0.94)
    )
    if (dupe) {
      await memories.put({ ...dupe, updatedAt: Date.now() })
      continue
    }
    const item: MemoryItem = {
      id: uid(),
      text: cand.text,
      kind: cand.kind,
      scope: "global",
      sourceMessageId: msgs[msgs.length - 1]?.id,
      conversationId: msgs[msgs.length - 1]?.conversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      disabled: false,
      useCount: 0,
      embedding: vec,
    }
    await memories.put(item)
    existing.push(item)
    created.push(item)
  }
  return created
}

/** Pinned memories always apply; the rest compete on similarity to the query. */
export async function retrieveMemories(
  query: string,
  settings: Settings,
  max = settings.memory.maxInjected
): Promise<MemoryItem[]> {
  const all = (await memories.all()).filter((m) => !m.disabled)
  if (!all.length) return []
  const pinned = all.filter((m) => m.pinned)
  const rest = all.filter((m) => !m.pinned)
  if (!query.trim() || !rest.length) return pinned.slice(0, max)

  const [qvec] = await embedTexts([query], settings)
  const scored = rest
    .map((m) => ({ m, score: m.embedding && qvec ? cosine(m.embedding, qvec) : 0 }))
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 0.28)
    .slice(0, Math.max(0, max - pinned.length))
    .map((s) => s.m)

  const picked = [...pinned, ...scored]
  const now = Date.now()
  await memories.putMany(
    picked.map((m) => ({ ...m, useCount: m.useCount + 1, lastUsedAt: now }))
  )
  return picked
}

export function memoriesToPrompt(items: MemoryItem[]) {
  if (!items.length) return ""
  return `What you remember about the user (may be outdated; prefer what they say now):\n${items
    .map((m) => `- ${m.text}`)
    .join("\n")}`
}

export async function addManualMemory(text: string, settings: Settings): Promise<MemoryItem> {
  const [vec] = await embedTexts([text], settings)
  const item: MemoryItem = {
    id: uid(),
    text,
    kind: "fact",
    scope: "global",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    disabled: false,
    useCount: 0,
    embedding: vec,
  }
  await memories.put(item)
  return item
}
