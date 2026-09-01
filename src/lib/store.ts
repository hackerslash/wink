import { create } from "zustand"

import {
  assistants as assistantStore,
  attachments as attachmentStore,
  collections as collectionStore,
  conversations as conversationStore,
  folders as folderStore,
  kv,
  memories as memoryStore,
  messages as messageStore,
  presets as presetStore,
  providers as providerStore,
  uid,
} from "./db"
import { builtinAssistants, costOf, DEFAULT_PARAMS, DEFAULT_SETTINGS } from "./defaults"
import { extractMemories, retrieveMemories } from "./memory"
import { newMcpServer, type McpServer } from "./mcp"
import {
  buildSystemPrompt,
  deepestLeaf,
  pathToHead,
  pathToRequestMessages,
  TITLE_PROMPT,
} from "./prompt"
import { keyId, listModels, streamChat, type ChatMsg } from "./providers"
import { hitsToCitations, isSupportedDoc, extractText, retrieve } from "./rag"
import { runResearch } from "./research"
import { tools, type ToolDef } from "./tools"
import type {
  Assistant,
  Attachment,
  Citation,
  Collection,
  Conversation,
  Folder,
  GenerationParams,
  ID,
  MemoryItem,
  Message,
  ModelInfo,
  Preset,
  ProviderConfig,
  ResearchRun,
  Settings,
  ToolCall,
} from "./types"
import { vault } from "./vault"

export type InspectorTab = "model" | "context" | "memory" | "sources" | "tools" | "info"

export type SettingsTab =
  | "providers"
  | "models"
  | "tools"
  | "knowledge"
  | "memory"
  | "assistants"
  | "appearance"
  | "data"
  | "privacy"

export interface Toast {
  id: string
  kind: "info" | "error" | "success"
  text: string
}

export interface PermissionRequest {
  tool: ToolDef
  args: unknown
  resolve: (allow: boolean, remember: boolean) => void
}

interface State {
  ready: boolean
  settings: Settings
  providers: ProviderConfig[]
  conversations: Conversation[]
  folders: Folder[]
  assistants: Assistant[]
  presets: Preset[]
  collections: Collection[]
  memories: MemoryItem[]
  mcpServers: McpServer[]

  activeId: ID | null
  messages: Message[]
  streamingIds: string[]

  // UI
  sidebarOpen: boolean
  inspectorOpen: boolean
  paletteOpen: boolean
  settingsTab: SettingsTab | null
  inspectorTab: InspectorTab
  modelPickerOpen: boolean
  search: string
  toasts: Toast[]
  permission: PermissionRequest | null
  vaultPrompt: boolean
  composerDraft: string
  attachmentQueue: Attachment[]
  researchDepth: "quick" | "standard" | "deep"
  mode: "chat" | "research"
}

interface Actions {
  init(): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<void>
  toast(kind: Toast["kind"], text: string): void
  dismissToast(id: string): void

  // conversations
  newConversation(opts?: Partial<Conversation>): Promise<Conversation>
  select(id: ID | null): Promise<void>
  patchConversation(id: ID, patch: Partial<Conversation>): Promise<void>
  trash(id: ID): Promise<void>
  restore(id: ID): Promise<void>
  purge(id: ID): Promise<void>
  emptyTrash(): Promise<void>
  duplicate(id: ID): Promise<void>

  // folders
  newFolder(name: string): Promise<Folder>
  patchFolder(id: ID, patch: Partial<Folder>): Promise<void>
  deleteFolder(id: ID): Promise<void>

  // messaging
  send(text: string, opts?: { attachments?: Attachment[] }): Promise<void>
  stop(): void
  regenerate(messageId: ID, override?: { providerId: ID; model: string }): Promise<void>
  editMessage(messageId: ID, text: string): Promise<void>
  patchMessage(id: ID, patch: Partial<Message>): Promise<void>
  deleteMessage(id: ID): Promise<void>
  switchBranch(messageId: ID): Promise<void>
  setModel(providerId: ID, model: string): Promise<void>
  setParams(patch: Partial<GenerationParams>): Promise<void>
  setCompare(models: { providerId: ID; model: string }[] | undefined): Promise<void>

  // attachments
  attachFiles(files: File[]): Promise<void>
  removeQueued(id: ID): void

  // providers
  addProvider(cfg: ProviderConfig, key?: string): Promise<void>
  patchProvider(id: ID, patch: Partial<ProviderConfig>): Promise<void>
  setProviderKey(id: ID, key: string): Promise<void>
  removeProvider(id: ID): Promise<void>
  refreshModels(id: ID): Promise<void>
  patchModel(providerId: ID, modelId: string, patch: Partial<ModelInfo>): Promise<void>

  // assistants / presets
  saveAssistant(a: Assistant): Promise<void>
  deleteAssistant(id: ID): Promise<void>
  savePreset(p: Preset): Promise<void>
  deletePreset(id: ID): Promise<void>
  applyAssistant(id: ID | null): Promise<void>

  // memory
  reloadMemories(): Promise<void>
  patchMemory(id: ID, patch: Partial<MemoryItem>): Promise<void>
  deleteMemory(id: ID): Promise<void>

  // knowledge
  reloadCollections(): Promise<void>

  // mcp
  saveMcpServer(server: McpServer): Promise<void>
  deleteMcpServer(id: string): Promise<void>

  // ui
  set<K extends keyof State>(key: K, value: State[K]): void
  openSettings(tab: SettingsTab | null): void
  resolvePermission(allow: boolean, remember: boolean): void
}

export type Store = State & Actions

const controllers = new Map<ID, AbortController>()
const flushTimers = new Map<ID, number>()

function queueFlush(msg: Message) {
  const existing = flushTimers.get(msg.id)
  if (existing) clearTimeout(existing)
  flushTimers.set(
    msg.id,
    window.setTimeout(() => {
      flushTimers.delete(msg.id)
      void messageStore.put(msg)
    }, 700)
  )
}

export const useStore = create<Store>((set, get) => {
  /** Applies a patch to one in-memory message and schedules a write. */
  const touch = (id: ID, patch: Partial<Message>, flush = false) => {
    let updated: Message | null = null
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id) return m
        updated = { ...m, ...patch }
        return updated
      }),
    }))
    if (!updated) return
    if (flush) {
      const timer = flushTimers.get(id)
      if (timer) clearTimeout(timer)
      flushTimers.delete(id)
      void messageStore.put(updated)
    } else queueFlush(updated)
  }

  const activeConversation = () => get().conversations.find((c) => c.id === get().activeId)

  const modelInfo = (providerId: ID, model: string) =>
    get()
      .providers.find((p) => p.id === providerId)
      ?.models.find((m) => m.id === model)

  /** A single pick is the active model, not a race. */
  const laneModels = (conv: Conversation) =>
    (conv.compareModels?.length ?? 0) > 1
      ? conv.compareModels!
      : [{ providerId: conv.providerId, model: conv.model }]

  const bumpConversation = async (patch: Partial<Conversation>) => {
    const conv = activeConversation()
    if (!conv) return
    const next = { ...conv, ...patch, updatedAt: Date.now() }
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === next.id ? next : c)) }))
    await conversationStore.put(next)
  }

  /** One assistant turn: streams, runs tools, loops until the model stops. */
  async function runTurn(args: {
    conv: Conversation
    assistantMsg: Message
    path: Message[]
    cfg: ProviderConfig
    model: string
    signal: AbortSignal
    laneId?: string
  }) {
    const { conv, assistantMsg, path, cfg, model, signal } = args
    const state = get()
    const info = modelInfo(cfg.id, model)
    const caps = info?.capabilities ?? {
      streaming: true,
      tools: false,
      vision: false,
      json: false,
      reasoning: false,
      contextWindow: 32_000,
      maxOutput: 4096,
      input: ["text" as const],
    }
    const params = conv.params
    const lastUser = [...path].reverse().find((m) => m.role === "user")
    const question = lastUser?.content ?? ""

    // ---- context assembly ------------------------------------------------
    let memories: MemoryItem[] = []
    if (params.memoryEnabled && state.settings.memory.enabled && cfg.allow.memories)
      memories = await retrieveMemories(question, state.settings)

    let knowledge: Citation[] = []
    const collections = params.knowledgeCollections
    if (params.knowledgeEnabled && collections.length && cfg.allow.knowledge) {
      const hits = await retrieve(question, collections, state.settings, 6)
      knowledge = await hitsToCitations(hits)
    }

    const useTools = params.toolsEnabled && caps.tools
    const specs = useTools ? tools.specs(state.settings) : undefined
    const system = buildSystemPrompt({
      custom: params.systemPrompt,
      memories,
      knowledge,
      toolNames: specs?.map((s) => s.name),
    })

    const requestMessages = await pathToRequestMessages(
      path,
      caps,
      cfg,
      params.contextWindowMessages
    )

    touch(assistantMsg.id, {
      citations: knowledge.length ? knowledge : undefined,
      memoryIds: memories.map((m) => m.id),
    })

    // ---- stream + tool loop ----------------------------------------------
    // `visible` is everything the user should see; `iterText` is only what this
    // round produced, which is what the provider needs echoed back.
    let visible = ""
    let iterText = ""
    let reasoning = ""
    let usage: { in: number; out: number; cost?: number } = { in: 0, out: 0 }
    const toolCalls: ToolCall[] = []
    const citations: Citation[] = [...knowledge]
    const started = Date.now()
    const convo: ChatMsg[] = [...requestMessages]

    let lastSignature = ""
    for (let iteration = 0; iteration < 8; iteration++) {
      const pending: { id: string; name: string; args: unknown }[] = []
      for await (const delta of streamChat(
        cfg,
        {
          model,
          system,
          messages: convo,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          tools: specs,
          json: params.jsonMode && caps.json,
          reasoningEffort: caps.reasoning ? params.reasoningEffort : undefined,
          signal,
        },
        {
          onRetry: (attempt, err) =>
            touch(assistantMsg.id, { error: `retrying (${attempt}): ${err.message}` }),
        }
      )) {
        if (delta.text) {
          iterText += delta.text
          visible += delta.text
          touch(assistantMsg.id, { content: visible, error: undefined })
        }
        if (delta.reasoning) {
          reasoning += delta.reasoning
          touch(assistantMsg.id, { reasoning })
        }
        if (delta.usage)
          usage = {
            in: delta.usage.in || usage.in,
            out: delta.usage.out || usage.out,
            cost: delta.usage.cost ?? usage.cost,
          }
        if (delta.toolCall) pending.push(delta.toolCall)
      }

      if (!pending.length || !useTools) break

      // A model that asks for the identical call twice in a row is stuck; stop
      // rather than burning the whole iteration budget on it.
      const signature = JSON.stringify(pending.map((p) => [p.name, p.args]))
      if (signature === lastSignature) {
        visible += (visible ? "\n\n" : "") + "_Stopped: the model repeated the same tool call._"
        break
      }
      lastSignature = signature

      const calls: ToolCall[] = pending.map((p) => ({
        id: p.id,
        name: p.name,
        args: p.args,
        status: "pending",
        startedAt: Date.now(),
      }))
      toolCalls.push(...calls)
      touch(assistantMsg.id, { toolCalls: [...toolCalls] }, true)

      convo.push({
        role: "assistant",
        content: iterText,
        toolCalls: pending.map((p) => ({ id: p.id, name: p.name, args: p.args })),
      })
      iterText = ""
      if (visible && !visible.endsWith("\n\n")) visible += "\n\n"

      for (const call of calls) {
        const def = tools.get(call.name)
        call.status = def && (get().settings.toolPermissions[call.name] ?? (def.sensitive ? "ask" : "always")) === "ask" ? "awaiting-permission" : "running"
        touch(assistantMsg.id, { toolCalls: [...toolCalls] })
        try {
          const result = await tools.execute(call.name, (call.args ?? {}) as Record<string, unknown>, {
            settings: get().settings,
            conversationId: conv.id,
            messageId: assistantMsg.id,
            signal,
            citationOffset: citations.reduce((n, c) => Math.max(n, c.n), 0),
            collections: collections.length
              ? collections
              : get().collections.map((c) => c.id),
            requestPermission: (tool, toolArgs) =>
              new Promise<boolean>((resolve) => {
                call.status = "awaiting-permission"
                touch(assistantMsg.id, { toolCalls: [...toolCalls] })
                set({
                  permission: {
                    tool,
                    args: toolArgs,
                    resolve: (allow, remember) => {
                      if (remember)
                        void get().saveSettings({
                          toolPermissions: {
                            ...get().settings.toolPermissions,
                            [tool.name]: allow ? "always" : "never",
                          },
                        })
                      set({ permission: null })
                      resolve(allow)
                    },
                  },
                })
              }),
          })
          call.status = "done"
          call.result = result.output
          call.endedAt = Date.now()
          // Tools number their own citations from citationOffset, and the text
          // handed to the model uses those numbers — do not renumber here.
          for (const cite of result.citations ?? []) {
            const dupe = citations.find((c) => (c.url ?? c.chunkId) === (cite.url ?? cite.chunkId))
            if (!dupe) citations.push(cite)
          }
          convo.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: result.output,
          })
        } catch (err) {
          const error = err as Error
          if (error.name === "AbortError") throw error
          call.status = /Denied by user/.test(error.message) ? "denied" : "error"
          call.error = error.message
          call.endedAt = Date.now()
          convo.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: `Error: ${error.message}`,
          })
        }
        void tools.audit({ conversationId: conv.id, messageId: assistantMsg.id, call })
        touch(assistantMsg.id, { toolCalls: [...toolCalls], citations: [...citations] }, true)
      }
    }

    const cost = usage.cost ?? costOf(info, usage)
    touch(
      assistantMsg.id,
      {
        content: visible.trimEnd(),
        reasoning: reasoning || undefined,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        citations: citations.length ? citations : undefined,
        usage: { ...usage, cost, ms: Date.now() - started },
        error: undefined,
        updatedAt: Date.now(),
      },
      true
    )

    await bumpConversation({
      tokenTotal: (activeConversation()?.tokenTotal ?? 0) + usage.in + usage.out,
      costTotal: (activeConversation()?.costTotal ?? 0) + (cost ?? 0),
    })

    return { content: visible, usage }
  }

  async function maybeTitle(conv: Conversation, path: Message[]) {
    if (conv.title !== "New chat") return
    const firstUser = path.find((m) => m.role === "user")?.content.trim()
    const cfg = get().providers.find((p) => p.id === conv.providerId)
    // Always land a usable title, even if the naming call fails outright.
    const fallback = firstUser
      ? firstUser.replace(/\s+/g, " ").split(" ").slice(0, 7).join(" ").slice(0, 60)
      : null
    if (!cfg) {
      if (fallback) await get().patchConversation(conv.id, { title: fallback })
      return
    }
    const exchange = path
      .slice(-2)
      .map((m) => `${m.role}: ${m.content.slice(0, 800)}`)
      .join("\n")
    try {
      let title = ""
      for await (const delta of streamChat(
        cfg,
        {
          model: conv.model,
          system: TITLE_PROMPT,
          messages: [{ role: "user", content: exchange }],
          temperature: 0.3,
          maxTokens: 24,
        },
        { retries: 0 }
      ))
        title += delta.text ?? ""
      title = title.trim().replace(/^["'#\s]+|["'.\s]+$/g, "").slice(0, 60)
      await get().patchConversation(conv.id, { title: title || fallback || "New chat" })
    } catch {
      if (fallback) await get().patchConversation(conv.id, { title: fallback })
    }
  }

  async function afterTurn(conv: Conversation) {
    const state = get()
    if (!state.settings.memory.enabled || !state.settings.memory.autoExtract) return
    const cfg = state.providers.find((p) => p.id === conv.providerId)
    if (!cfg?.allow.memories) return
    const path = pathToHead(state.messages, conv.headId)
    try {
      const created = await extractMemories(path, cfg, conv.model, state.settings)
      if (created.length) {
        await get().reloadMemories()
        get().toast("info", `Remembered ${created.length} new ${created.length === 1 ? "thing" : "things"}`)
      }
    } catch {
      /* memory extraction is best-effort */
    }
  }

  /** Creates the assistant placeholder(s) and drives the turn(s). */
  async function generate(opts: {
    conv: Conversation
    parentId: ID
    lanes: { providerId: ID; model: string }[]
    mode: "chat" | "research"
  }) {
    const controller = new AbortController()
    controllers.set(opts.conv.id, controller)

    const placeholders = opts.lanes.map((lane, i) => {
      const msg: Message = {
        id: uid(),
        conversationId: opts.conv.id,
        parentId: opts.parentId,
        role: "assistant",
        content: "",
        createdAt: Date.now() + i,
        model: lane.model,
        providerId: lane.providerId,
        laneId: opts.lanes.length > 1 ? `${lane.providerId}:${lane.model}` : undefined,
      }
      return msg
    })

    set((s) => ({
      messages: [...s.messages, ...placeholders],
      streamingIds: [...s.streamingIds, ...placeholders.map((p) => p.id)],
    }))
    await messageStore.putMany(placeholders)
    await bumpConversation({ headId: placeholders[0].id })

    const path = pathToHead(get().messages, opts.parentId)

    await Promise.all(
      placeholders.map(async (msg, i) => {
        const lane = opts.lanes[i]
        const cfg = get().providers.find((p) => p.id === lane.providerId)
        if (!cfg) {
          touch(msg.id, { error: "Provider not found" }, true)
          return
        }
        try {
          if (opts.mode === "research") {
            let report = ""
            const run = await runResearch({
              question: [...path].reverse().find((m) => m.role === "user")?.content ?? "",
              cfg,
              model: lane.model,
              settings: get().settings,
              collections: opts.conv.params.knowledgeCollections,
              depth: get().researchDepth,
              signal: controller.signal,
              onUpdate: (r: ResearchRun) => touch(msg.id, { research: r }),
              onReportDelta: (t) => {
                report += t
                touch(msg.id, { content: report })
              },
            })
            touch(
              msg.id,
              {
                content: run.report ?? report,
                research: run,
                citations: run.sources,
                updatedAt: Date.now(),
              },
              true
            )
          } else {
            await runTurn({
              conv: opts.conv,
              assistantMsg: msg,
              path,
              cfg,
              model: lane.model,
              signal: controller.signal,
              laneId: msg.laneId,
            })
          }
        } catch (err) {
          const error = err as Error
          touch(
            msg.id,
            {
              error: error.name === "AbortError" ? "Stopped" : error.message,
              updatedAt: Date.now(),
            },
            true
          )
        }
      })
    )

    controllers.delete(opts.conv.id)
    set((s) => ({
      streamingIds: s.streamingIds.filter((id) => !placeholders.some((p) => p.id === id)),
    }))

    const conv = get().conversations.find((c) => c.id === opts.conv.id)
    if (conv) {
      const fresh = pathToHead(get().messages, conv.headId)
      void maybeTitle(conv, fresh)
      void afterTurn(conv)
    }
  }

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    providers: [],
    conversations: [],
    folders: [],
    assistants: [],
    presets: [],
    collections: [],
    memories: [],
    mcpServers: [],
    activeId: null,
    messages: [],
    streamingIds: [],
    sidebarOpen: window.innerWidth >= 768,
    inspectorOpen: false,
    paletteOpen: false,
    settingsTab: null,
    inspectorTab: "model",
    modelPickerOpen: false,
    search: "",
    toasts: [],
    permission: null,
    vaultPrompt: false,
    composerDraft: "",
    attachmentQueue: [],
    researchDepth: "standard",
    mode: "chat",

    set: (key, value) => set({ [key]: value } as Partial<State>),
    openSettings: (tab) => set({ settingsTab: tab, paletteOpen: false }),

    toast(kind, text) {
      const id = uid()
      set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
      setTimeout(() => get().dismissToast(id), kind === "error" ? 8000 : 3500)
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },

    async init() {
      const stored = await kv.get<Partial<Settings>>("settings")
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        ...stored,
        defaultParams: { ...DEFAULT_PARAMS, ...stored?.defaultParams },
      }
      vault.markRequired(settings.vault.enabled)

      let assistants = await assistantStore.all()
      if (!assistants.length) {
        assistants = builtinAssistants()
        await assistantStore.putMany(assistants)
      } else {
        // Builtins once had random ids, so a double init() left duplicates.
        const seen = new Set<string>()
        const dupes = assistants.filter((a) => {
          if (!a.builtin) return false
          if (seen.has(a.name)) return true
          seen.add(a.name)
          return false
        })
        if (dupes.length) {
          await Promise.all(dupes.map((a) => assistantStore.del(a.id)))
          assistants = assistants.filter((a) => !dupes.includes(a))
        }
      }
      const mcpServers = (await kv.get<McpServer[]>("mcpServers")) ?? []

      set({
        settings,
        providers: await providerStore.all(),
        conversations: await conversationStore.recent(),
        folders: await folderStore.all(),
        assistants,
        presets: await presetStore.all(),
        collections: await collectionStore.all(),
        memories: await memoryStore.all(),
        mcpServers,
        vaultPrompt: settings.vault.enabled,
        ready: true,
      })
      if (mcpServers.length) void tools.loadMcp(mcpServers)
    },

    async saveSettings(patch) {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      await kv.set("settings", settings)
    },

    // ------------------------------------------------------ conversations
    async newConversation(opts) {
      const s = get()
      // An untouched "New chat" is reusable — clicking + twice should not leave
      // two empty rows in the sidebar.
      const isBlank = (c: Conversation) =>
        !c.headId && !c.archived && c.title === "New chat"
      if (!opts) {
        const blanks = s.conversations.filter((c) => isBlank(c) && !c.trashedAt)
        // Reuse the first untouched chat and clear the rest, so repeated clicks
        // never leave a stack of empty rows behind.
        for (const extra of blanks.slice(1)) await get().purge(extra.id)
        const reuse = blanks[0]
        if (reuse) {
          await get().select(reuse.id)
          set({ mode: "chat" })
          return reuse
        }
      }
      const provider =
        s.providers.find((p) => p.id === s.settings.defaultProviderId && p.enabled) ??
        s.providers.find((p) => p.enabled && p.models.length)
      const model =
        (provider?.id === s.settings.defaultProviderId ? s.settings.defaultModel : null) ??
        provider?.models.find((m) => !m.hidden && !m.capabilities.embedding)?.id ??
        ""
      const conv: Conversation = {
        id: uid(),
        title: "New chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        folderId: null,
        assistantId: s.assistants[0]?.id ?? null,
        pinned: false,
        archived: false,
        trashedAt: null,
        tags: [],
        headId: null,
        model,
        providerId: provider?.id ?? "",
        params: {
          ...s.settings.defaultParams,
          systemPrompt: s.assistants[0]?.systemPrompt ?? "",
          knowledgeCollections: [],
        },
        ...opts,
      }
      await conversationStore.put(conv)
      set((state) => ({
        conversations: [conv, ...state.conversations],
        activeId: conv.id,
        messages: [],
        mode: "chat",
      }))
      return conv
    },

    async select(id) {
      if (!id) return set({ activeId: null, messages: [] })
      set({ activeId: id, messages: [] })
      const msgs = await messageStore.byConversation(id)
      if (get().activeId === id) set({ messages: msgs })
    },

    async patchConversation(id, patch) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const next = { ...conv, ...patch, updatedAt: patch.updatedAt ?? Date.now() }
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? next : c)) }))
      await conversationStore.put(next)
    },

    async trash(id) {
      // An empty conversation has nothing to recover — delete it outright rather
      // than filling the trash with placeholder rows.
      const conv = get().conversations.find((c) => c.id === id)
      if (conv && !conv.headId) {
        await get().purge(id)
        return
      }
      await get().patchConversation(id, { trashedAt: Date.now(), pinned: false })
      if (get().activeId === id) set({ activeId: null, messages: [] })
      get().toast("info", "Moved to trash")
    },
    async restore(id) {
      await get().patchConversation(id, { trashedAt: null })
    },
    async purge(id) {
      await messageStore.delByConversation(id)
      await conversationStore.del(id)
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }))
    },
    async emptyTrash() {
      for (const conv of get().conversations.filter((c) => c.trashedAt)) await get().purge(conv.id)
      get().toast("success", "Trash emptied")
    },
    async duplicate(id) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const msgs = await messageStore.byConversation(id)
      const map = new Map(msgs.map((m) => [m.id, uid()]))
      const copy: Conversation = {
        ...conv,
        id: uid(),
        title: `${conv.title} copy`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        headId: conv.headId ? (map.get(conv.headId) ?? null) : null,
      }
      await conversationStore.put(copy)
      await messageStore.putMany(
        msgs.map((m) => ({
          ...m,
          id: map.get(m.id)!,
          conversationId: copy.id,
          parentId: m.parentId ? (map.get(m.parentId) ?? null) : null,
        }))
      )
      set((s) => ({ conversations: [copy, ...s.conversations] }))
      await get().select(copy.id)
    },

    // ------------------------------------------------------------ folders
    async newFolder(name) {
      const palette = ["#7c5cff", "#12d8a0", "#ff7a5c", "#48b0ff", "#ff4ecd", "#ffb020"]
      const folder: Folder = {
        id: uid(),
        name,
        color: palette[get().folders.length % palette.length],
        parentId: null,
        createdAt: Date.now(),
      }
      await folderStore.put(folder)
      set((s) => ({ folders: [...s.folders, folder] }))
      return folder
    },
    async patchFolder(id, patch) {
      const folder = get().folders.find((f) => f.id === id)
      if (!folder) return
      const next = { ...folder, ...patch }
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? next : f)) }))
      await folderStore.put(next)
    },
    async deleteFolder(id) {
      for (const conv of get().conversations.filter((c) => c.folderId === id))
        await get().patchConversation(conv.id, { folderId: null })
      await folderStore.del(id)
      set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }))
    },

    // ----------------------------------------------------------- messaging
    async send(text, opts) {
      let conv = activeConversation()
      if (!conv) conv = await get().newConversation()
      if (!conv.providerId || !conv.model) {
        get().openSettings("providers")
        get().toast("error", "Add a provider and pick a model first")
        return
      }
      const attachments = opts?.attachments ?? get().attachmentQueue
      const trimmed = text.trim()
      if (!trimmed && !attachments.length) return

      const user: Message = {
        id: uid(),
        conversationId: conv.id,
        parentId: conv.headId,
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        attachments: attachments.length ? attachments : undefined,
      }
      set((s) => ({ messages: [...s.messages, user], attachmentQueue: [], composerDraft: "" }))
      await messageStore.put(user)
      await bumpConversation({ headId: user.id })

      const lanes = laneModels(conv)
      await generate({
        conv: { ...conv, headId: user.id },
        parentId: user.id,
        lanes,
        mode: get().mode,
      })
    },

    stop() {
      const id = get().activeId
      if (id) controllers.get(id)?.abort()
    },

    async regenerate(messageId, override) {
      const conv = activeConversation()
      if (!conv) return
      const msg = get().messages.find((m) => m.id === messageId)
      if (!msg?.parentId) return
      const lane = override ?? {
        providerId: msg.providerId ?? conv.providerId,
        model: msg.model ?? conv.model,
      }
      await generate({ conv, parentId: msg.parentId, lanes: [lane], mode: get().mode })
    },

    async editMessage(messageId, text) {
      const conv = activeConversation()
      const msg = get().messages.find((m) => m.id === messageId)
      if (!conv || !msg) return
      if (msg.role !== "user") {
        await get().patchMessage(messageId, { content: text, updatedAt: Date.now() })
        return
      }
      const edited: Message = {
        ...msg,
        id: uid(),
        content: text,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => ({ messages: [...s.messages, edited] }))
      await messageStore.put(edited)
      await bumpConversation({ headId: edited.id })
      await generate({
        conv: { ...conv, headId: edited.id },
        parentId: edited.id,
        lanes: laneModels(conv),
        mode: get().mode,
      })
    },

    async patchMessage(id, patch) {
      touch(id, patch, true)
    },

    async deleteMessage(id) {
      const all = get().messages
      const doomed = new Set<ID>()
      const walk = (target: ID) => {
        doomed.add(target)
        for (const child of all.filter((m) => m.parentId === target)) walk(child.id)
      }
      walk(id)
      const msg = all.find((m) => m.id === id)
      set((s) => ({ messages: s.messages.filter((m) => !doomed.has(m.id)) }))
      for (const gone of doomed) await messageStore.del(gone)
      const conv = activeConversation()
      if (conv?.headId && doomed.has(conv.headId))
        await bumpConversation({ headId: msg?.parentId ?? null })
    },

    async switchBranch(messageId) {
      const msg = get().messages.find((m) => m.id === messageId)
      if (!msg) return
      await bumpConversation({ headId: deepestLeaf(get().messages, msg).id })
    },

    async setModel(providerId, model) {
      await bumpConversation({ providerId, model })
      await get().saveSettings({ defaultProviderId: providerId, defaultModel: model })
    },

    async setParams(patch) {
      const conv = activeConversation()
      if (!conv) {
        await get().saveSettings({ defaultParams: { ...get().settings.defaultParams, ...patch } })
        return
      }
      await bumpConversation({ params: { ...conv.params, ...patch } })
    },

    async setCompare(models) {
      // Without this the pick vanishes before the first chat exists.
      if (!activeConversation()) await get().newConversation()
      await bumpConversation({ compareModels: models })
    },

    // --------------------------------------------------------- attachments
    async attachFiles(files) {
      const made: Attachment[] = []
      for (const file of files) {
        const kind: Attachment["kind"] = file.type.startsWith("image/")
          ? "image"
          : file.type === "application/pdf"
            ? "pdf"
            : isSupportedDoc(file)
              ? "text"
              : "other"
        const att: Attachment = {
          id: uid(),
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          blobKey: uid(),
          kind,
        }
        if (kind === "text" || kind === "pdf") {
          try {
            att.text = await extractText(file)
          } catch (err) {
            get().toast("error", `${file.name}: ${(err as Error).message}`)
          }
        }
        if (kind === "image") {
          const bitmap = await createImageBitmap(file).catch(() => null)
          if (bitmap) {
            att.width = bitmap.width
            att.height = bitmap.height
            bitmap.close()
          }
        }
        await attachmentStore.put(att, file)
        made.push(att)
      }
      set((s) => ({ attachmentQueue: [...s.attachmentQueue, ...made] }))
    },
    removeQueued(id) {
      const att = get().attachmentQueue.find((a) => a.id === id)
      if (att) void attachmentStore.del(att.blobKey)
      set((s) => ({ attachmentQueue: s.attachmentQueue.filter((a) => a.id !== id) }))
    },

    // ----------------------------------------------------------- providers
    async addProvider(cfg, key) {
      if (key) {
        await vault.setSecret(keyId(cfg.id), key)
        cfg = { ...cfg, hasKey: true }
      }
      await providerStore.put(cfg)
      set((s) => ({ providers: [...s.providers, cfg] }))
      await get().refreshModels(cfg.id)
      const fresh = get().providers.find((p) => p.id === cfg.id)
      if (!get().settings.defaultProviderId && fresh?.models.length)
        await get().saveSettings({
          defaultProviderId: fresh.id,
          defaultModel: fresh.models.find((m) => !m.capabilities.embedding)?.id ?? null,
        })
    },

    async patchProvider(id, patch) {
      const cfg = get().providers.find((p) => p.id === id)
      if (!cfg) return
      const next = { ...cfg, ...patch }
      set((s) => ({ providers: s.providers.map((p) => (p.id === id ? next : p)) }))
      await providerStore.put(next)
    },

    async setProviderKey(id, key) {
      await vault.setSecret(keyId(id), key)
      await get().patchProvider(id, { hasKey: Boolean(key) })
      // Listing models is authenticated, so it doubles as key validation.
      if (key) await get().refreshModels(id)
    },

    async removeProvider(id) {
      await vault.delSecret(keyId(id))
      await providerStore.del(id)
      set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }))
    },

    async refreshModels(id) {
      const cfg = get().providers.find((p) => p.id === id)
      if (!cfg) return
      try {
        const fetched = await listModels(cfg)
        const previous = new Map(cfg.models.map((m) => [m.id, m]))
        const merged = fetched.map((m) => ({ ...m, ...(previous.get(m.id) ? { hidden: previous.get(m.id)!.hidden, price: previous.get(m.id)!.price ?? m.price } : {}) }))
        await get().patchProvider(id, { models: merged })
        get().toast("success", `${cfg.label}: ${merged.length} models`)
      } catch (err) {
        get().toast("error", `${cfg.label}: ${(err as Error).message}`)
        throw err
      }
    },

    async patchModel(providerId, modelId, patch) {
      const cfg = get().providers.find((p) => p.id === providerId)
      if (!cfg) return
      await get().patchProvider(providerId, {
        models: cfg.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)),
      })
    },

    // ------------------------------------------------- assistants & presets
    async saveAssistant(a) {
      await assistantStore.put(a)
      set((s) => ({
        assistants: s.assistants.some((x) => x.id === a.id)
          ? s.assistants.map((x) => (x.id === a.id ? a : x))
          : [...s.assistants, a],
      }))
    },
    async deleteAssistant(id) {
      await assistantStore.del(id)
      set((s) => ({ assistants: s.assistants.filter((a) => a.id !== id) }))
    },
    async savePreset(p) {
      await presetStore.put(p)
      set((s) => ({
        presets: s.presets.some((x) => x.id === p.id)
          ? s.presets.map((x) => (x.id === p.id ? p : x))
          : [...s.presets, p],
      }))
    },
    async deletePreset(id) {
      await presetStore.del(id)
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
    },
    async applyAssistant(id) {
      const conv = activeConversation()
      const assistant = get().assistants.find((a) => a.id === id)
      if (!conv) return
      await bumpConversation({
        assistantId: id,
        params: {
          ...conv.params,
          ...assistant?.params,
          systemPrompt: assistant?.systemPrompt ?? "",
          knowledgeCollections: assistant?.knowledgeCollections?.length
            ? assistant.knowledgeCollections
            : conv.params.knowledgeCollections,
        },
        ...(assistant?.providerId && assistant.model
          ? { providerId: assistant.providerId, model: assistant.model }
          : {}),
      })
    },

    // -------------------------------------------------------------- memory
    async reloadMemories() {
      set({ memories: await memoryStore.all() })
    },
    async patchMemory(id, patch) {
      const item = get().memories.find((m) => m.id === id)
      if (!item) return
      const next = { ...item, ...patch, updatedAt: Date.now() }
      set((s) => ({ memories: s.memories.map((m) => (m.id === id ? next : m)) }))
      await memoryStore.put(next)
    },
    async deleteMemory(id) {
      await memoryStore.del(id)
      set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
    },

    // ----------------------------------------------------------- knowledge
    async reloadCollections() {
      set({ collections: await collectionStore.all() })
    },

    // ----------------------------------------------------------------- mcp
    async saveMcpServer(server) {
      const list = get().mcpServers.some((s) => s.id === server.id)
        ? get().mcpServers.map((s) => (s.id === server.id ? server : s))
        : [...get().mcpServers, server]
      set({ mcpServers: list })
      await kv.set("mcpServers", list)
      await tools.loadMcp(list)
    },
    async deleteMcpServer(id) {
      const list = get().mcpServers.filter((s) => s.id !== id)
      set({ mcpServers: list })
      await kv.set("mcpServers", list)
      await tools.loadMcp(list)
    },

    resolvePermission(allow, remember) {
      get().permission?.resolve(allow, remember)
    },
  }
})

/** The conversation's model, else the global default. Primitives only, to stay referentially stable. */
export const activeSelection = (s: State) => {
  const conv = s.conversations.find((c) => c.id === s.activeId)
  return {
    providerId: conv?.providerId || s.settings.defaultProviderId || "",
    model: conv?.model || s.settings.defaultModel || "",
  }
}

export function useActiveModel() {
  const providerId = useStore((s) => activeSelection(s).providerId)
  const model = useStore((s) => activeSelection(s).model)
  return { providerId, model }
}

export const newMcp = newMcpServer
export { pathToHead }
