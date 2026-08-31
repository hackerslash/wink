/// <reference lib="webworker" />
import { chunkText, estimateTokens, terms } from "@/lib/chunk"
import { chunks as chunkStore, docs as docStore, uid } from "@/lib/db"
import { bm25, cosine, localEmbed } from "@/lib/embeddings"
import { providerFor } from "@/lib/providers"
import type { Chunk, ID, KnowledgeDoc, ProviderConfig } from "@/lib/types"

export type EmbedCfg =
  | { kind: "local"; dims: number }
  | { kind: "remote"; cfg: ProviderConfig; key: string | null; model: string; dims: number }

export type RagRequest =
  | { id: string; op: "index"; doc: KnowledgeDoc; text: string; embed: EmbedCfg }
  | {
      id: string
      op: "search"
      query: string
      collectionIds: ID[]
      k: number
      embed: EmbedCfg
      alpha?: number
    }
  | { id: string; op: "embed"; texts: string[]; embed: EmbedCfg }

export interface SearchHit {
  chunk: Omit<Chunk, "vector">
  score: number
  semantic: number
  lexical: number
}

export type RagResponse =
  | { id: string; op: "progress"; done: number; total: number; phase: string }
  | { id: string; op: "indexed"; chunkCount: number }
  | { id: string; op: "hits"; hits: SearchHit[] }
  | { id: string; op: "vectors"; vectors: number[][] }
  | { id: string; op: "error"; message: string }

const post = (msg: RagResponse) => (self as unknown as Worker).postMessage(msg)

async function embed(texts: string[], cfg: EmbedCfg): Promise<number[][]> {
  if (cfg.kind === "local") return texts.map((t) => localEmbed(t, cfg.dims))
  const provider = providerFor(cfg.cfg)
  if (!provider.embed) throw new Error("Provider cannot embed")
  const out: number[][] = []
  const batch = 48
  for (let i = 0; i < texts.length; i += batch)
    out.push(...(await provider.embed(cfg.cfg, cfg.key, cfg.model, texts.slice(i, i + batch))))
  return out
}

async function index(req: Extract<RagRequest, { op: "index" }>) {
  const { doc, text, embed: cfg } = req
  post({ id: req.id, op: "progress", done: 0, total: 1, phase: "chunking" })
  const raw = chunkText(text)
  if (!raw.length) {
    await docStore.put({ ...doc, status: "ready", chunkCount: 0, progress: 1 })
    post({ id: req.id, op: "indexed", chunkCount: 0 })
    return
  }
  await docStore.put({ ...doc, status: "embedding", chunkCount: raw.length, progress: 0 })

  const batch = cfg.kind === "local" ? 256 : 32
  let done = 0
  for (let i = 0; i < raw.length; i += batch) {
    const slice = raw.slice(i, i + batch)
    const vectors = await embed(
      slice.map((c) => c.text),
      cfg
    )
    const rows: Chunk[] = slice.map((c, j) => ({
      id: uid(),
      docId: doc.id,
      collectionId: doc.collectionId,
      index: c.index,
      text: c.text,
      tokens: estimateTokens(c.text),
      vector: new Float32Array(vectors[j]),
      terms: terms(c.text),
      page: c.page,
    }))
    await chunkStore.putMany(rows)
    done += slice.length
    post({ id: req.id, op: "progress", done, total: raw.length, phase: "embedding" })
    await docStore.put({
      ...doc,
      status: "embedding",
      chunkCount: raw.length,
      progress: done / raw.length,
    })
  }
  await docStore.put({ ...doc, status: "ready", chunkCount: raw.length, progress: 1 })
  post({ id: req.id, op: "indexed", chunkCount: raw.length })
}

async function search(req: Extract<RagRequest, { op: "search" }>) {
  const [qvec] = await embed([req.query], req.embed)
  const qterms = terms(req.query)
  const pool: Chunk[] = []
  for (const id of req.collectionIds) pool.push(...(await chunkStore.byCollection(id)))
  if (!pool.length) return post({ id: req.id, op: "hits", hits: [] })

  const df = new Map<string, number>()
  let totalLen = 0
  for (const c of pool) {
    totalLen += c.terms?.length ?? 0
    for (const t of c.terms ?? []) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const avgLen = totalLen / pool.length
  const alpha = req.alpha ?? 0.65

  let maxLex = 0
  const scored = pool.map((c) => {
    const semantic = c.vector ? cosine(qvec, c.vector) : 0
    const lexical = bm25(qterms, c.terms ?? [], df, pool.length, avgLen)
    maxLex = Math.max(maxLex, lexical)
    return { c, semantic, lexical }
  })

  const hits: SearchHit[] = scored
    .map(({ c, semantic, lexical }) => {
      const norm = maxLex ? lexical / maxLex : 0
      const { vector: _vector, ...rest } = c
      void _vector
      return {
        chunk: rest,
        semantic,
        lexical: norm,
        score: alpha * semantic + (1 - alpha) * norm,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, req.k)

  post({ id: req.id, op: "hits", hits })
}

self.onmessage = async (e: MessageEvent<RagRequest>) => {
  const req = e.data
  try {
    if (req.op === "index") await index(req)
    else if (req.op === "search") await search(req)
    else if (req.op === "embed")
      post({ id: req.id, op: "vectors", vectors: await embed(req.texts, req.embed) })
  } catch (err) {
    post({ id: req.id, op: "error", message: (err as Error).message })
  }
}
