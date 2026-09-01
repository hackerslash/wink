import type { ModelCapabilities, ModelInfo, ProviderKind } from "../types"

const base: ModelCapabilities = {
  streaming: true,
  tools: false,
  vision: false,
  json: false,
  reasoning: false,
  contextWindow: 8192,
  maxOutput: 4096,
  input: ["text"],
}

/** Ids that are neither chat nor embedding models: never offered anywhere. */
export const NON_CHAT = /whisper|tts|dall-e|moderation|image|audio|realtime|veo|rerank/i

type Rule = {
  test: RegExp
  caps: Partial<ModelCapabilities>
  /** USD per 1M tokens; best-effort defaults, editable per model in settings. */
  price?: { in: number; out: number }
}

/** Matched top-down against the model id. First match wins, later rules merge. */
const RULES: Rule[] = [
  // ---- embeddings -------------------------------------------------------
  {
    test: /embed|bge|gte|nomic|minilm|e5-/i,
    caps: { embedding: true, streaming: false, contextWindow: 8192, maxOutput: 0 },
  },
  // ---- OpenAI -----------------------------------------------------------
  {
    test: /^(gpt-5|o[34])/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      reasoning: true,
      contextWindow: 400_000,
      maxOutput: 128_000,
      input: ["text", "image", "pdf"],
    },
    price: { in: 1.25, out: 10 },
  },
  {
    test: /^gpt-4\.1/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      contextWindow: 1_047_576,
      maxOutput: 32_768,
      input: ["text", "image", "pdf"],
    },
    price: { in: 2, out: 8 },
  },
  {
    test: /^gpt-4o/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      contextWindow: 128_000,
      maxOutput: 16_384,
      input: ["text", "image"],
    },
    price: { in: 2.5, out: 10 },
  },
  {
    test: /^o1/i,
    caps: { tools: true, json: true, reasoning: true, contextWindow: 200_000, maxOutput: 100_000 },
  },
  // ---- Anthropic --------------------------------------------------------
  {
    test: /^claude.*opus/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      reasoning: true,
      contextWindow: 200_000,
      maxOutput: 64_000,
      input: ["text", "image", "pdf"],
    },
    price: { in: 15, out: 75 },
  },
  {
    test: /^claude.*(sonnet|fable)/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      reasoning: true,
      contextWindow: 200_000,
      maxOutput: 64_000,
      input: ["text", "image", "pdf"],
    },
    price: { in: 3, out: 15 },
  },
  {
    test: /^claude.*haiku/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      contextWindow: 200_000,
      maxOutput: 32_000,
      input: ["text", "image", "pdf"],
    },
    price: { in: 1, out: 5 },
  },
  {
    test: /^claude/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      contextWindow: 200_000,
      maxOutput: 8192,
      input: ["text", "image"],
    },
  },
  // ---- Google -----------------------------------------------------------
  {
    test: /^gemini.*(pro|ultra)/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      reasoning: true,
      contextWindow: 1_048_576,
      maxOutput: 65_536,
      input: ["text", "image", "pdf", "audio"],
    },
    price: { in: 1.25, out: 10 },
  },
  {
    test: /^gemini/i,
    caps: {
      tools: true,
      vision: true,
      json: true,
      contextWindow: 1_048_576,
      maxOutput: 65_536,
      input: ["text", "image", "pdf", "audio"],
    },
    price: { in: 0.3, out: 2.5 },
  },
  // ---- open weights -----------------------------------------------------
  {
    test: /(llama|qwen|mistral|mixtral|gemma|phi|deepseek|glm|kimi|command-r|granite)/i,
    caps: { tools: true, json: true, contextWindow: 128_000, maxOutput: 8192 },
  },
  { test: /(vision|-vl|llava|moondream)/i, caps: { vision: true, input: ["text", "image"] } },
  { test: /(reason|think|r1|-r\d)/i, caps: { reasoning: true } },
]

export function inferCapabilities(modelId: string, kind: ProviderKind): ModelInfo["capabilities"] {
  let caps: ModelCapabilities = { ...base }
  let matched = false
  for (const rule of RULES) {
    if (!rule.test.test(modelId)) continue
    caps = { ...caps, ...rule.caps }
    matched = true
  }
  if (!matched) {
    // Unknown model on a modern API: assume the common denominator works.
    caps = { ...caps, tools: kind !== "ollama", json: true, contextWindow: 32_768 }
  }
  if (kind === "ollama") caps.contextWindow = Math.min(caps.contextWindow, 131_072)
  return caps
}

export function inferPrice(modelId: string) {
  for (const rule of RULES) if (rule.price && rule.test.test(modelId)) return rule.price
  return undefined
}

export function prettyModelName(id: string) {
  const cleaned = id.replace(/^models\//, "").replace(/[:/]/g, " · ")
  return cleaned
    .split(/[-_\s]+/)
    .map((w) => (/^\d/.test(w) || w.length <= 3 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bLlm\b/g, "LLM")
}
