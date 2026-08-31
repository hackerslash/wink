import { uid } from "../db"
import type { ProviderConfig, ProviderKind } from "../types"
import { vault } from "../vault"
import { anthropicProvider } from "./anthropic"
import { googleProvider } from "./google"
import { openaiProvider } from "./openai"
import type { ChatDelta, ChatRequest, ModelProvider } from "./types"

export * from "./types"
export { inferCapabilities, prettyModelName } from "./capabilities"

const REGISTRY: Record<ProviderKind, ModelProvider> = {
  openai: openaiProvider,
  "openai-compatible": { ...openaiProvider, kind: "openai-compatible" },
  ollama: { ...openaiProvider, kind: "ollama" },
  anthropic: anthropicProvider,
  google: googleProvider,
}

export const providerFor = (cfg: ProviderConfig) => REGISTRY[cfg.kind] ?? openaiProvider

export const keyId = (providerId: string) => `provider:${providerId}`

export async function providerKey(cfg: ProviderConfig) {
  if (!cfg.hasKey) return null
  return vault.getSecret(keyId(cfg.id))
}

export interface ProviderTemplate {
  label: string
  kind: ProviderKind
  baseUrl: string
  local: boolean
  needsKey: boolean
  hint: string
  docs?: string
  suggested?: string[]
}

export const TEMPLATES: ProviderTemplate[] = [
  {
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    local: false,
    needsKey: true,
    hint: "GPT models, vision, tools, embeddings.",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    local: false,
    needsKey: true,
    hint: "Claude models. Browser calls are sent with the direct-access header.",
    docs: "https://console.anthropic.com/settings/keys",
  },
  {
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    local: false,
    needsKey: true,
    hint: "Gemini models, 1M context, native PDF and audio.",
    docs: "https://aistudio.google.com/apikey",
  },
  {
    label: "Ollama",
    kind: "ollama",
    baseUrl: "http://localhost:11434/v1",
    local: true,
    needsKey: false,
    hint: "Local inference. Start it with OLLAMA_ORIGINS=* so the browser may call it.",
  },
  {
    label: "LM Studio",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    local: true,
    needsKey: false,
    hint: "Local server. Enable CORS in LM Studio's server settings.",
  },
  {
    label: "llama.cpp",
    kind: "openai-compatible",
    baseUrl: "http://localhost:8080/v1",
    local: true,
    needsKey: false,
    hint: "llama-server with --api-key optional.",
  },
  {
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    local: false,
    needsKey: true,
    hint: "One key, hundreds of models.",
    docs: "https://openrouter.ai/keys",
  },
  {
    label: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    local: false,
    needsKey: true,
    hint: "Very fast open-weight inference.",
    docs: "https://console.groq.com/keys",
  },
  {
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    local: false,
    needsKey: true,
    hint: "Chat and reasoning models.",
    docs: "https://platform.deepseek.com/api_keys",
  },
  {
    label: "Mistral",
    kind: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    local: false,
    needsKey: true,
    hint: "Mistral and Codestral.",
    docs: "https://console.mistral.ai/api-keys/",
  },
  {
    label: "xAI",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    local: false,
    needsKey: true,
    hint: "Grok models.",
    docs: "https://console.x.ai/",
  },
  {
    label: "Custom endpoint",
    kind: "openai-compatible",
    baseUrl: "",
    local: false,
    needsKey: false,
    hint: "Any OpenAI-compatible /chat/completions server, including your own gateway.",
  },
]

/** Where to get a key for an already-connected provider. */
export function keyPageFor(cfg: { baseUrl: string; label: string }) {
  return TEMPLATES.find(
    (t) => t.docs && ((t.baseUrl && cfg.baseUrl.startsWith(t.baseUrl)) || t.label === cfg.label)
  )?.docs
}

export function providerFromTemplate(t: ProviderTemplate): ProviderConfig {
  return {
    id: uid(),
    kind: t.kind,
    label: t.label,
    baseUrl: t.baseUrl,
    hasKey: false,
    local: t.local,
    enabled: true,
    models: [],
    allow: { attachments: true, knowledge: true, memories: true },
    createdAt: Date.now(),
  }
}

const RETRYABLE = /\b(429|5\d\d|network|fetch failed|load failed|timed out)\b/i

/**
 * Streams a chat completion, retrying transient failures with backoff. Retries
 * only happen while nothing has been emitted, so the UI never sees a partial
 * answer restart mid-sentence.
 */
export async function* streamChat(
  cfg: ProviderConfig,
  req: ChatRequest,
  opts: { retries?: number; onRetry?: (attempt: number, err: Error) => void } = {}
): AsyncGenerator<ChatDelta> {
  const provider = providerFor(cfg)
  const key = await providerKey(cfg)
  const retries = opts.retries ?? 2
  for (let attempt = 0; ; attempt++) {
    let emitted = false
    try {
      for await (const delta of provider.stream(cfg, key, req)) {
        emitted = true
        yield delta
      }
      return
    } catch (err) {
      const error = err as Error
      if (error.name === "AbortError") throw error
      if (emitted || attempt >= retries || !RETRYABLE.test(error.message)) throw error
      opts.onRetry?.(attempt + 1, error)
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 250))
    }
  }
}

export async function listModels(cfg: ProviderConfig) {
  return providerFor(cfg).listModels(cfg, await providerKey(cfg))
}

export async function embedWithProvider(
  cfg: ProviderConfig,
  model: string,
  texts: string[]
): Promise<number[][]> {
  const provider = providerFor(cfg)
  if (!provider.embed) throw new Error(`${cfg.label} cannot produce embeddings`)
  return provider.embed(cfg, await providerKey(cfg), model, texts)
}
