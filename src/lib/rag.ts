import type { EmbedCfg, RagRequest, RagResponse, SearchHit } from "@/workers/rag.worker"
import RagWorker from "@/workers/rag.worker?worker"

import { chunks as chunkStore, collections, docs, providers, uid } from "./db"
import { LOCAL_DIMS } from "./embeddings"
import { providerKey } from "./providers"
import type { Citation, Collection, ID, KnowledgeDoc, Settings } from "./types"

let worker: Worker | null = null
const waiters = new Map<
  string,
  { resolve: (r: RagResponse) => void; reject: (e: Error) => void; progress?: (done: number, total: number, phase: string) => void }
>()

function getWorker() {
  if (worker) return worker
  worker = new RagWorker()
  worker.onmessage = (e: MessageEvent<RagResponse>) => {
    const w = waiters.get(e.data.id)
    if (!w) return
    if (e.data.op === "progress") return w.progress?.(e.data.done, e.data.total, e.data.phase)
    waiters.delete(e.data.id)
    if (e.data.op === "error") w.reject(new Error(e.data.message))
    else w.resolve(e.data)
  }
  return worker
}

type RagCall = RagRequest extends infer T ? (T extends { id: string } ? Omit<T, "id"> : never) : never

function call(
  req: RagCall,
  progress?: (done: number, total: number, phase: string) => void
) {
  const id = uid()
  return new Promise<RagResponse>((resolve, reject) => {
    waiters.set(id, { resolve, reject, progress })
    getWorker().postMessage({ ...req, id } as RagRequest)
  })
}

export async function embedConfig(settings: Settings): Promise<EmbedCfg> {
  if (settings.embedding.providerId === "local") return { kind: "local", dims: LOCAL_DIMS }
  const cfg = await providers.get(settings.embedding.providerId)
  if (!cfg) return { kind: "local", dims: LOCAL_DIMS }
  return {
    kind: "remote",
    cfg,
    key: await providerKey(cfg),
    model: settings.embedding.model,
    dims: settings.embedding.dims,
  }
}

// ---------------------------------------------------------------- extraction

async function pdfToText(file: File, onPage?: (page: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist")
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
    parts.push(`\n\n[page ${i}]\n${text}`)
    onPage?.(i, doc.numPages)
  }
  await doc.cleanup()
  return parts.join("")
}

const TEXTY =
  /\.(md|markdown|txt|text|csv|tsv|json|jsonl|ya?ml|toml|ini|log|html?|xml|svg|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|sql|graphql|vue|svelte|astro|css|scss)$/i

export function isSupportedDoc(file: File) {
  return file.type === "application/pdf" || TEXTY.test(file.name) || file.type.startsWith("text/")
}

export async function extractText(
  file: File,
  onPage?: (page: number, total: number) => void
): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return pdfToText(file, onPage)
  return file.text()
}

// ---------------------------------------------------------------- ingestion

export async function createCollection(
  name: string,
  settings: Settings,
  emoji = "📚"
): Promise<Collection> {
  const col: Collection = {
    id: uid(),
    name,
    emoji,
    description: "",
    createdAt: Date.now(),
    embeddingModel:
      settings.embedding.providerId === "local" ? "local-hash" : settings.embedding.model,
    embeddingProviderId: settings.embedding.providerId,
    dims: settings.embedding.providerId === "local" ? LOCAL_DIMS : settings.embedding.dims,
    docCount: 0,
    chunkCount: 0,
  }
  await collections.put(col)
  return col
}

export async function ingestFile(
  collectionId: ID,
  file: File,
  settings: Settings,
  onProgress?: (doc: KnowledgeDoc) => void
): Promise<KnowledgeDoc> {
  let doc: KnowledgeDoc = {
    id: uid(),
    collectionId,
    name: file.name,
    mime: file.type || "text/plain",
    size: file.size,
    createdAt: Date.now(),
    status: "parsing",
    chunkCount: 0,
    progress: 0,
  }
  await docs.put(doc)
  onProgress?.(doc)

  try {
    const text = await extractText(file, (page, total) => {
      doc = { ...doc, progress: (page / total) * 0.3 }
      onProgress?.(doc)
    })
    if (!text.trim()) throw new Error("No extractable text found")
    await call({ op: "index", doc, text, embed: await embedConfig(settings) }, (done, total) => {
      doc = { ...doc, status: "embedding", chunkCount: total, progress: done / total }
      onProgress?.(doc)
    })
    const fresh = (await docs.get(doc.id)) ?? doc
    await refreshCollectionCounts(collectionId)
    onProgress?.(fresh)
    return fresh
  } catch (err) {
    doc = { ...doc, status: "error", error: (err as Error).message }
    await docs.put(doc)
    onProgress?.(doc)
    return doc
  }
}

export async function refreshCollectionCounts(collectionId: ID) {
  const col = await collections.get(collectionId)
  if (!col) return
  const list = await docs.byCollection(collectionId)
  await collections.put({
    ...col,
    docCount: list.length,
    chunkCount: list.reduce((n, d) => n + d.chunkCount, 0),
  })
}

export async function deleteDoc(docId: ID) {
  const doc = await docs.get(docId)
  await chunkStore.delByDoc(docId)
  await docs.del(docId)
  if (doc) await refreshCollectionCounts(doc.collectionId)
}

export async function deleteCollection(id: ID) {
  for (const doc of await docs.byCollection(id)) {
    await chunkStore.delByDoc(doc.id)
    await docs.del(doc.id)
  }
  await collections.del(id)
}

// ---------------------------------------------------------------- retrieval

export async function retrieve(
  query: string,
  collectionIds: ID[],
  settings: Settings,
  k = 6
): Promise<SearchHit[]> {
  if (!collectionIds.length || !query.trim()) return []
  const res = await call({
    op: "search",
    query,
    collectionIds,
    k,
    embed: await embedConfig(settings),
  })
  return res.op === "hits" ? res.hits : []
}

export async function hitsToCitations(hits: SearchHit[], startAt = 1): Promise<Citation[]> {
  const names = new Map<ID, string>()
  const out: Citation[] = []
  for (const [i, hit] of hits.entries()) {
    let name = names.get(hit.chunk.docId)
    if (!name) {
      name = (await docs.get(hit.chunk.docId))?.name ?? "document"
      names.set(hit.chunk.docId, name)
    }
    const col = await collections.get(hit.chunk.collectionId)
    out.push({
      n: startAt + i,
      title: name,
      snippet: hit.chunk.text.slice(0, 400),
      chunkId: hit.chunk.id,
      collection: col?.name,
    })
  }
  return out
}

export function citationsToPrompt(cites: Citation[]) {
  return cites
    .map((c) => `[${c.n}] ${c.title}${c.collection ? ` (${c.collection})` : ""}\n${c.snippet}`)
    .join("\n\n")
}

/**
 * Embeds one probe string with the current settings and reports the real vector
 * width. Model ids don't tell you their dimensionality, and a wrong guess makes
 * retrieval silently useless — so ask the endpoint.
 */
export async function probeEmbedding(settings: Settings): Promise<number> {
  const res = await call({ op: "embed", texts: ["dimension probe"], embed: await embedConfig(settings) })
  const dims = res.op === "vectors" ? res.vectors[0]?.length : 0
  if (!dims) throw new Error("The endpoint returned no vector")
  return dims
}

/**
 * Re-embeds a collection's stored chunk text with the current embedding model.
 * Vectors from different models are not comparable, so switching models leaves
 * old collections stranded until they are rebuilt — the text is already local,
 * so no re-upload is needed.
 */
export async function reindexCollection(
  collectionId: ID,
  settings: Settings,
  onProgress?: (done: number, total: number) => void
) {
  const rows = await chunkStore.byCollection(collectionId)
  if (!rows.length) return 0
  const cfg = await embedConfig(settings)
  const batch = cfg.kind === "local" ? 256 : 32
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch)
    const res = await call({ op: "embed", texts: slice.map((c) => c.text), embed: cfg })
    if (res.op !== "vectors") throw new Error("Embedding failed")
    await chunkStore.putMany(
      slice.map((c, j) => ({ ...c, vector: new Float32Array(res.vectors[j]) }))
    )
    onProgress?.(Math.min(i + batch, rows.length), rows.length)
  }
  const col = await collections.get(collectionId)
  if (col)
    await collections.put({
      ...col,
      embeddingProviderId: settings.embedding.providerId,
      embeddingModel:
        settings.embedding.providerId === "local" ? "local-hash" : settings.embedding.model,
      dims: settings.embedding.providerId === "local" ? LOCAL_DIMS : settings.embedding.dims,
    })
  return rows.length
}

export async function embedTexts(texts: string[], settings: Settings): Promise<number[][]> {
  const res = await call({ op: "embed", texts, embed: await embedConfig(settings) })
  return res.op === "vectors" ? res.vectors : []
}

export type { SearchHit }
