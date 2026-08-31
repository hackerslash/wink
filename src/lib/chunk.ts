export interface RawChunk {
  text: string
  index: number
  page?: number
}

const TARGET = 1100
const OVERLAP = 180

/** Rough token estimate: good enough for budgeting, no tokenizer download. */
export const estimateTokens = (text: string) =>
  Math.max(1, Math.round(text.length / 3.8))

/**
 * Splits on structure first (headings, fences, paragraphs) and only falls back
 * to hard slicing for runaway blocks, so chunks stay semantically whole.
 */
export function chunkText(input: string): RawChunk[] {
  const text = input.replace(/\r\n/g, "\n").trim()
  if (!text) return []

  const blocks: string[] = []
  let buf = ""
  let inFence = false
  for (const line of text.split("\n")) {
    const fence = /^\s*```/.test(line)
    if (fence) inFence = !inFence
    const isBreak = !inFence && (/^#{1,6}\s/.test(line) || line.trim() === "")
    if (isBreak && buf.length > TARGET * 0.55) {
      blocks.push(buf.trim())
      buf = ""
    }
    buf += line + "\n"
    if (buf.length > TARGET * 2.2 && !inFence) {
      blocks.push(buf.trim())
      buf = ""
    }
  }
  if (buf.trim()) blocks.push(buf.trim())

  const out: RawChunk[] = []
  for (const block of blocks) {
    if (block.length <= TARGET * 1.6) {
      out.push({ text: block, index: out.length })
      continue
    }
    for (let i = 0; i < block.length; i += TARGET - OVERLAP) {
      const slice = block.slice(i, i + TARGET).trim()
      if (slice) out.push({ text: slice, index: out.length })
    }
  }
  return out.filter((c) => c.text.length > 20)
}

const STOP = new Set(
  "a an the and or but if then of to in on for with as is are was were be been by at from this that these those it its i you we they he she them our your not no do does did can could should would will just about into over under more most other some such only own same so than too very".split(
    " "
  )
)

export function terms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s._-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && t.length < 30 && !STOP.has(t))
    ),
  ]
}
