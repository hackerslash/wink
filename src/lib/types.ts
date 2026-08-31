export type ID = string

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible"
  | "ollama"

export type Modality = "text" | "image" | "audio" | "pdf"

export interface ModelCapabilities {
  streaming: boolean
  tools: boolean
  vision: boolean
  json: boolean
  reasoning: boolean
  contextWindow: number
  maxOutput: number
  input: Modality[]
  embedding?: boolean
}

export interface ModelInfo {
  id: string
  providerId: ID
  label: string
  capabilities: ModelCapabilities
  /** USD per 1M tokens. */
  price?: { in: number; out: number }
  hidden?: boolean
}

export interface ProviderConfig {
  id: ID
  kind: ProviderKind
  label: string
  baseUrl: string
  /** Kept in the encrypted vault, never in this record. */
  hasKey: boolean
  /** Extra headers, e.g. org ids or gateway auth. */
  headers?: Record<string, string>
  local: boolean
  enabled: boolean
  models: ModelInfo[]
  /** Data classes this provider is allowed to receive. */
  allow: { attachments: boolean; knowledge: boolean; memories: boolean }
  createdAt: number
}

export type Role = "user" | "assistant" | "system" | "tool"

export interface Attachment {
  id: ID
  name: string
  mime: string
  size: number
  /** Blob lives in the attachments store; this is the key. */
  blobKey: string
  kind: "image" | "pdf" | "text" | "other"
  /** Extracted text for non-image files. */
  text?: string
  width?: number
  height?: number
}

export interface ToolCall {
  id: string
  name: string
  args: unknown
  status: "pending" | "awaiting-permission" | "running" | "done" | "error" | "denied"
  result?: unknown
  error?: string
  startedAt?: number
  endedAt?: number
  attempts?: number
}

export interface Citation {
  n: number
  title: string
  url?: string
  snippet?: string
  /** Set when the citation points at a local knowledge chunk. */
  chunkId?: ID
  collection?: string
}

export interface Usage {
  in: number
  out: number
  cost?: number
  ms?: number
}

export interface Message {
  id: ID
  conversationId: ID
  parentId: ID | null
  role: Role
  content: string
  reasoning?: string
  createdAt: number
  updatedAt?: number
  model?: string
  providerId?: ID
  attachments?: Attachment[]
  toolCalls?: ToolCall[]
  citations?: Citation[]
  usage?: Usage
  error?: string
  /** Set on messages produced by a compare run. */
  laneId?: string
  research?: ResearchRun
  memoryIds?: ID[]
  favorite?: boolean
}

export interface GenerationParams {
  temperature: number
  topP: number
  maxTokens: number | null
  systemPrompt: string
  /** How many previous messages to send. 0 = all. */
  contextWindowMessages: number
  toolsEnabled: boolean
  memoryEnabled: boolean
  knowledgeEnabled: boolean
  knowledgeCollections: ID[]
  jsonMode: boolean
  reasoningEffort?: "low" | "medium" | "high"
}

export interface Conversation {
  id: ID
  title: string
  createdAt: number
  updatedAt: number
  folderId: ID | null
  assistantId: ID | null
  pinned: boolean
  archived: boolean
  trashedAt: number | null
  tags: string[]
  /** Leaf of the currently visible branch. */
  headId: ID | null
  model: string
  providerId: ID
  params: GenerationParams
  compareModels?: { providerId: ID; model: string }[]
  tokenTotal?: number
  costTotal?: number
}

export interface Folder {
  id: ID
  name: string
  color: string
  parentId: ID | null
  createdAt: number
  collapsed?: boolean
}

export interface Assistant {
  id: ID
  name: string
  emoji: string
  description: string
  systemPrompt: string
  params: Partial<GenerationParams>
  providerId?: ID
  model?: string
  knowledgeCollections: ID[]
  createdAt: number
  builtin?: boolean
}

export interface MemoryItem {
  id: ID
  text: string
  kind: "fact" | "preference" | "project" | "person" | "instruction"
  scope: "global" | "conversation"
  conversationId?: ID
  sourceMessageId?: ID
  createdAt: number
  updatedAt: number
  pinned: boolean
  disabled: boolean
  useCount: number
  lastUsedAt?: number
  embedding?: number[]
}

export interface Collection {
  id: ID
  name: string
  emoji: string
  description: string
  createdAt: number
  embeddingModel: string
  embeddingProviderId: ID | "local"
  dims: number
  docCount: number
  chunkCount: number
}

export interface KnowledgeDoc {
  id: ID
  collectionId: ID
  name: string
  mime: string
  size: number
  createdAt: number
  status: "queued" | "parsing" | "embedding" | "ready" | "error"
  error?: string
  chunkCount: number
  progress?: number
}

export interface Chunk {
  id: ID
  docId: ID
  collectionId: ID
  index: number
  text: string
  tokens: number
  vector?: Float32Array | number[]
  /** Lowercased term set for lexical scoring. */
  terms?: string[]
  page?: number
}

export interface ResearchStep {
  id: string
  kind: "plan" | "search" | "read" | "reflect" | "synthesize"
  label: string
  status: "running" | "done" | "error"
  detail?: string
  output?: string
  sources?: Citation[]
  startedAt: number
  endedAt?: number
}

export interface ResearchRun {
  id: ID
  question: string
  status: "running" | "done" | "error" | "cancelled"
  steps: ResearchStep[]
  sources: Citation[]
  report?: string
  startedAt: number
  endedAt?: number
}

export interface Preset {
  id: ID
  name: string
  params: Partial<GenerationParams>
  providerId?: ID
  model?: string
  createdAt: number
}

export interface Settings {
  theme: "light" | "dark" | "system"
  accent: string
  density: "comfy" | "compact"
  effects: "full" | "reduced" | "off"
  defaultProviderId: ID | null
  defaultModel: string | null
  defaultParams: GenerationParams
  embedding: {
    providerId: ID | "local"
    model: string
    dims: number
  }
  search: {
    kind: "tavily" | "brave" | "searxng" | "jina" | "firecrawl" | "none"
    endpoint: string
    hasKey: boolean
  }
  /** How a URL is turned into text: a text-extraction proxy, or Firecrawl. */
  reader: { kind: "proxy" | "firecrawl"; endpoint: string }
  toolPermissions: Record<string, "ask" | "always" | "never">
  vault: { enabled: boolean; salt?: string; check?: string }
  memory: { enabled: boolean; autoExtract: boolean; maxInjected: number }
  sendKey: "enter" | "mod-enter"
  showTokenCounts: boolean
  /** Streaming throughput readout on assistant turns. */
  showTokenRate: boolean
  onboarded: boolean
}
