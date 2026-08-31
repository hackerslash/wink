import { terms } from "./chunk"

export const LOCAL_DIMS = 384

/**
 * Zero-dependency local embedder: hashes word and character trigrams into a
 * fixed vector. Lexical, not semantic — good enough for hybrid retrieval when
 * no embedding endpoint is configured, and it never leaves the machine.
 */
export function localEmbed(text: string, dims = LOCAL_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0)
  const add = (token: string, weight: number) => {
    let h = 2166136261
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const idx = Math.abs(h) % dims
    vec[idx] += weight * (h < 0 ? -1 : 1)
  }
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? []
  for (const w of words) add(w, 1)
  for (let i = 0; i < words.length - 1; i++) add(`${words[i]}_${words[i + 1]}`, 0.6)
  const flat = text.toLowerCase().replace(/\s+/g, " ")
  for (let i = 0; i < flat.length - 2; i++) add(flat.slice(i, i + 3), 0.25)
  const norm = Math.hypot(...vec) || 1
  return vec.map((v) => v / norm)
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/** Okapi-BM25 scoring over the pre-extracted term sets of a chunk corpus. */
export function bm25(
  queryTerms: string[],
  docTerms: string[],
  df: Map<string, number>,
  docCount: number,
  avgLen: number
) {
  const k1 = 1.4
  const b = 0.72
  const set = new Set(docTerms)
  let score = 0
  for (const q of queryTerms) {
    if (!set.has(q)) continue
    const n = df.get(q) ?? 1
    const idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5))
    const tf = 1
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docTerms.length) / (avgLen || 1))))
  }
  return score
}

export { terms }
