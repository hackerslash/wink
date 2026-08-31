import { uid } from "./db"
import { streamChat } from "./providers"
import { hitsToCitations, retrieve } from "./rag"
import { fetchPage, webSearch } from "./tools"
import type {
  Citation,
  ID,
  ProviderConfig,
  ResearchRun,
  ResearchStep,
  Settings,
} from "./types"

export interface ResearchOptions {
  question: string
  cfg: ProviderConfig
  model: string
  settings: Settings
  collections: ID[]
  depth: "quick" | "standard" | "deep"
  signal: AbortSignal
  onUpdate: (run: ResearchRun) => void
  onReportDelta: (text: string) => void
}

const DEPTH = {
  quick: { queries: 2, sources: 3, rounds: 1 },
  standard: { queries: 4, sources: 6, rounds: 2 },
  deep: { queries: 6, sources: 10, rounds: 3 },
}

async function complete(
  cfg: ProviderConfig,
  model: string,
  system: string,
  user: string,
  signal: AbortSignal,
  opts: { json?: boolean; maxTokens?: number; onDelta?: (t: string) => void } = {}
) {
  let out = ""
  for await (const delta of streamChat(
    cfg,
    {
      model,
      system,
      messages: [{ role: "user", content: user }],
      temperature: opts.json ? 0 : 0.4,
      maxTokens: opts.maxTokens ?? 1200,
      json: opts.json,
      signal,
    },
    { retries: 1 }
  )) {
    if (delta.text) {
      out += delta.text
      opts.onDelta?.(delta.text)
    }
  }
  return out
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    return fallback
  }
}

/**
 * Plan → search → read → reflect → synthesize. Every phase pushes a step so the
 * UI can show exactly what the agent is doing, and all evidence keeps its
 * citation number from first sighting to final report.
 */
export async function runResearch(opts: ResearchOptions): Promise<ResearchRun> {
  const { question, cfg, model, settings, signal, onUpdate } = opts
  const limits = DEPTH[opts.depth]
  const run: ResearchRun = {
    id: uid(),
    question,
    status: "running",
    steps: [],
    sources: [],
    startedAt: Date.now(),
  }
  const emit = () => onUpdate({ ...run, steps: [...run.steps], sources: [...run.sources] })

  const step = (kind: ResearchStep["kind"], label: string): ResearchStep => {
    const s: ResearchStep = { id: uid(), kind, label, status: "running", startedAt: Date.now() }
    run.steps.push(s)
    emit()
    return s
  }
  const finish = (s: ResearchStep, patch: Partial<ResearchStep> = {}) => {
    Object.assign(s, { status: "done", endedAt: Date.now() }, patch)
    emit()
  }

  const evidence: string[] = []
  const seen = new Set<string>()
  const addSource = (c: Omit<Citation, "n">) => {
    const dupeKey = c.url ?? c.chunkId ?? c.title
    if (seen.has(dupeKey)) return run.sources.find((s) => (s.url ?? s.chunkId ?? s.title) === dupeKey)!
    seen.add(dupeKey)
    const cite: Citation = { ...c, n: run.sources.length + 1 }
    run.sources.push(cite)
    return cite
  }

  try {
    // ---- plan -----------------------------------------------------------
    const planStep = step("plan", "Planning the investigation")
    const plan = parseJson<{ queries: string[]; angles?: string[] }>(
      await complete(
        cfg,
        model,
        `You plan research. Reply with JSON only: {"queries":[".."],"angles":[".."]}. Give ${limits.queries} diverse, specific search queries and the key angles to cover. Today is ${new Date().toISOString().slice(0, 10)}.`,
        question,
        signal,
        { json: true, maxTokens: 500 }
      ),
      { queries: [question] }
    )
    const queries = (plan.queries?.length ? plan.queries : [question]).slice(0, limits.queries)
    finish(planStep, {
      detail: `${queries.length} queries`,
      output: [...queries.map((q) => `• ${q}`), ...(plan.angles ?? []).map((a) => `— ${a}`)].join("\n"),
    })

    // ---- local knowledge ------------------------------------------------
    if (opts.collections.length) {
      const localStep = step("search", "Searching local knowledge")
      const hits = await retrieve(question, opts.collections, settings, 6)
      const cites = await hitsToCitations(hits)
      for (const c of cites) {
        const cite = addSource({ title: c.title, snippet: c.snippet, chunkId: c.chunkId, collection: c.collection })
        evidence.push(`[${cite.n}] ${c.title} (local)\n${c.snippet}`)
      }
      finish(localStep, { detail: `${cites.length} passages`, sources: cites })
    }

    // ---- search + read rounds -------------------------------------------
    let round = 0
    let pending = queries
    while (round < limits.rounds && pending.length) {
      round++
      const searchStep = step(
        "search",
        round === 1 ? "Searching the web" : `Follow-up search (round ${round})`
      )
      const batches = await Promise.allSettled(
        pending.map((q) => webSearch(q, settings, 5, signal))
      )
      const candidates: { title: string; url: string; snippet: string }[] = []
      for (const b of batches)
        if (b.status === "fulfilled") for (const r of b.value) candidates.push(r)
      if (!candidates.length && !evidence.length) {
        finish(searchStep, {
          status: "error",
          detail:
            batches.find((b) => b.status === "rejected")?.status === "rejected"
              ? String((batches.find((b) => b.status === "rejected") as PromiseRejectedResult).reason)
              : "no results",
        })
        break
      }
      finish(searchStep, {
        detail: `${candidates.length} results`,
        output: candidates.map((c) => `• ${c.title} — ${c.url}`).join("\n"),
      })

      const fresh = candidates.filter((c) => !seen.has(c.url)).slice(0, limits.sources)
      for (const c of fresh) {
        if (signal.aborted) throw new DOMException("aborted", "AbortError")
        const readStep = step("read", new URL(c.url).hostname)
        const cite = addSource({ title: c.title, url: c.url, snippet: c.snippet })
        try {
          const page = await fetchPage(c.url, settings, signal)
          const notes = await complete(
            cfg,
            model,
            "Extract only facts, figures and quotes from the page that help answer the question. Bullet points, max 8, each self-contained. Reply 'NOTHING RELEVANT' if the page does not help.",
            `Question: ${question}\n\nPage: ${c.title}\n${page.slice(0, 12_000)}`,
            signal,
            { maxTokens: 600 }
          )
          if (!/NOTHING RELEVANT/i.test(notes)) {
            evidence.push(`[${cite.n}] ${c.title} — ${c.url}\n${notes}`)
            cite.snippet = notes.slice(0, 400)
          }
          finish(readStep, { detail: c.title.slice(0, 80), output: notes })
        } catch (err) {
          finish(readStep, { status: "error", detail: (err as Error).message.slice(0, 140) })
          evidence.push(`[${cite.n}] ${c.title} — ${c.url}\n${c.snippet}`)
        }
      }

      if (round >= limits.rounds) break
      const reflectStep = step("reflect", "Checking for gaps")
      const gaps = parseJson<{ done: boolean; queries: string[] }>(
        await complete(
          cfg,
          model,
          `Reply with JSON only: {"done":true|false,"queries":[".."]}. Decide whether the evidence answers the question. If not, give up to 2 new search queries for the gaps.`,
          `Question: ${question}\n\nEvidence:\n${evidence.join("\n\n").slice(0, 20_000)}`,
          signal,
          { json: true, maxTokens: 300 }
        ),
        { done: true, queries: [] }
      )
      pending = gaps.done ? [] : gaps.queries.slice(0, 2)
      finish(reflectStep, {
        detail: gaps.done ? "evidence sufficient" : `${pending.length} gaps`,
        output: pending.map((q) => `• ${q}`).join("\n"),
      })
    }

    // ---- synthesize ------------------------------------------------------
    const synthStep = step("synthesize", "Writing the report")
    const report = await complete(
      cfg,
      model,
      `You write research reports. Structure: a one-paragraph answer, then "## Findings" with substantive sections, then "## Open questions" and "## Sources".
Cite every claim with [n] matching the evidence numbers. Never invent a citation number. Note disagreements between sources. Markdown, no preamble.`,
      `Question: ${question}\n\nEvidence:\n${evidence.join("\n\n").slice(0, 60_000)}\n\nSources:\n${run.sources
        .map((s) => `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : " (local knowledge)"}`)
        .join("\n")}`,
      signal,
      { maxTokens: 4000, onDelta: opts.onReportDelta }
    )
    run.report = report
    finish(synthStep, { detail: `${report.split(/\s+/).length} words` })

    run.status = "done"
    run.endedAt = Date.now()
    emit()
    return run
  } catch (err) {
    const error = err as Error
    run.status = error.name === "AbortError" ? "cancelled" : "error"
    run.endedAt = Date.now()
    const last = run.steps[run.steps.length - 1]
    if (last && last.status === "running")
      Object.assign(last, { status: "error", detail: error.message, endedAt: Date.now() })
    emit()
    if (run.status === "error") throw error
    return run
  }
}
