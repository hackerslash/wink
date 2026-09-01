import type { Assistant, GenerationParams, ModelInfo, Settings } from "./types"

export const DEFAULT_PARAMS: GenerationParams = {
  temperature: 0.7,
  topP: 1,
  maxTokens: null,
  systemPrompt: "",
  contextWindowMessages: 0,
  toolsEnabled: true,
  memoryEnabled: true,
  knowledgeEnabled: true,
  knowledgeCollections: [],
  jsonMode: false,
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  accent: "vermilion",
  density: "comfy",
  effects: "full",
  defaultProviderId: null,
  defaultModel: null,
  defaultParams: DEFAULT_PARAMS,
  embedding: { providerId: "local", model: "local-hash", dims: 384 },
  search: { kind: "none", endpoint: "", hasKey: false },
  reader: { kind: "proxy", endpoint: "https://r.jina.ai/" },
  toolPermissions: {},
  vault: { enabled: false },
  memory: { enabled: true, autoExtract: true, maxInjected: 8 },
  sendKey: "enter",
  showTokenCounts: true,
  showTokenRate: false,
  onboarded: false,
}

/**
 * One solid accent, no gradients. Light and dark values are separate so the
 * hue stays put while lightness and chroma adapt (see design.md).
 */
export const ACCENTS: Record<string, { label: string; light: string; dark: string }> = {
  vermilion: { label: "Vermilion", light: "oklch(55% 0.17 30)", dark: "oklch(68% 0.15 32)" },
  graphite: { label: "Graphite", light: "oklch(32% 0.012 60)", dark: "oklch(82% 0.008 75)" },
  moss: { label: "Moss", light: "oklch(48% 0.11 145)", dark: "oklch(70% 0.11 145)" },
  ochre: { label: "Ochre", light: "oklch(58% 0.13 70)", dark: "oklch(74% 0.12 75)" },
  plum: { label: "Plum", light: "oklch(45% 0.15 330)", dark: "oklch(68% 0.13 330)" },
  slate: { label: "Slate", light: "oklch(48% 0.09 240)", dark: "oklch(70% 0.09 240)" },
}

export function builtinAssistants(): Assistant[] {
  const make = (
    name: string,
    emoji: string,
    description: string,
    systemPrompt: string,
    params: Partial<GenerationParams> = {}
  ): Assistant => ({
    id: `builtin-${name.toLowerCase()}`,
    name,
    emoji,
    description,
    systemPrompt,
    params,
    knowledgeCollections: [],
    createdAt: Date.now(),
    builtin: true,
  })
  return [
    make(
      "Generalist",
      "✨",
      "Balanced, direct, no filler.",
      "You are a sharp, direct assistant. Answer the question asked, lead with the answer, and skip preamble and flattery. Use markdown when it helps; keep prose tight."
    ),
    make(
      "Engineer",
      "⌘",
      "Code-first, minimal diffs.",
      "You are a senior engineer. Prefer the smallest correct change, standard library over dependencies, and working code over explanation. Show code first, then at most three lines of notes. State assumptions you had to make.",
      { temperature: 0.2 }
    ),
    make(
      "Researcher",
      "🔍",
      "Cites everything, flags uncertainty.",
      "You are a meticulous researcher. Cite sources as [n] whenever tools provide them, separate established facts from inference, and say plainly when the evidence is thin or conflicting.",
      { temperature: 0.3 }
    ),
    make(
      "Editor",
      "✎",
      "Cuts words, keeps voice.",
      "You are a ruthless editor. Cut filler, fix rhythm, keep the author's voice. Return the edited text first, then a short list of the substantive changes.",
      { temperature: 0.6 }
    ),
    make(
      "Brainstormer",
      "◈",
      "Divergent, playful, concrete.",
      "You generate ideas: many, varied, specific. No hedging, no 'it depends'. Group them, then mark the two you would bet on and why.",
      { temperature: 1 }
    ),
  ]
}

export function costOf(model: ModelInfo | undefined, usage: { in: number; out: number }) {
  if (!model?.price) return undefined
  return (usage.in * model.price.in + usage.out * model.price.out) / 1_000_000
}

export const fmtCost = (n: number | undefined) =>
  n === undefined ? "" : n === 0 ? "free" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export const fmtBytes = (n: number) => {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}
