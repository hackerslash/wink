import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AccentDot } from "@/components/fx"
import {
  AddIcon,
  BrainIcon,
  CheckIcon,
  KeyIcon,
  CloseIcon,
  DeleteIcon,
  DownloadIcon,
  LockIcon,
  PinIcon,
  PlugIcon,
  RefreshIcon,
  ShieldIcon,
  UploadIcon,
} from "@/components/icons"
import { useTheme } from "@/components/theme-provider"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { attachments, kv, storageEstimate, uid, wipeAll } from "@/lib/db"
import { ACCENTS, fmtBytes } from "@/lib/defaults"
import {
  download,
  exportBackup,
  importBackup,
  importChatGptExport,
  type Backup,
} from "@/lib/exporting"
import { listMcpTools, newMcpServer, type McpServer, type McpTool } from "@/lib/mcp"
import { canEmbed } from "@/lib/providers"
import { probeEmbedding, reindexCollection } from "@/lib/rag"
import { addManualMemory } from "@/lib/memory"
import { useStore } from "@/lib/store"
import { tools, webSearch } from "@/lib/tools"
import type { Assistant, Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { vault } from "@/lib/vault"

export function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <h3 className="mb-1 text-[13px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </h3>
      {hint && <p className="mb-2.5 text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}

function TextInput(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-[var(--accent-solid)]",
        props.className
      )}
    />
  )
}

const sliderValue = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number))

type SearchKind = Settings["search"]["kind"]

/** Each option carries where to get its key, so nobody has to go hunting. */
const SEARCH_KINDS: readonly {
  id: SearchKind
  label: string
  hint: string
  needsKey?: boolean
  keyPage?: string
  custom?: boolean
  placeholder?: string
}[] = [
  { id: "none", label: "None", hint: "Web search and page reading stay off." },
  {
    id: "tavily",
    label: "Tavily",
    hint: "Search built for agents. Works from the browser.",
    needsKey: true,
    keyPage: "https://app.tavily.com/home",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    hint: "Search and clean page scraping from one key — pair it with the Firecrawl reader below.",
    needsKey: true,
    keyPage: "https://www.firecrawl.dev/app/api-keys",
  },
  {
    id: "jina",
    label: "Jina",
    hint: "Usable without a key; a key lifts the rate limit.",
    needsKey: true,
    keyPage: "https://jina.ai/api-dashboard/",
  },
  {
    id: "searxng",
    label: "SearXNG",
    hint: "Your own instance. Enable the JSON output format.",
    custom: true,
    placeholder: "http://localhost:8888",
  },
  {
    id: "brave",
    label: "Brave",
    hint: "Often refuses browser calls (CORS). Use it behind your own proxy.",
    needsKey: true,
    keyPage: "https://api-dashboard.search.brave.com/app/keys",
  },
]

function KeyLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent-solid)] hover:underline"
    >
      <HugeiconsIcon icon={KeyIcon} className="size-3" strokeWidth={2} />
      Get a {label} key ↗
    </a>
  )
}

/** Compact inline picker. Selected reads as accent-filled, not a faint tint. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border border-border bg-[var(--paper-2)] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-[5px] px-2 py-0.5 text-[12px] capitalize transition-colors",
            value === o
              ? "accent-fill font-semibold"
              : "font-medium text-muted-foreground hover:text-foreground"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Full-width choice row: accent border, accent label and a tick on the pick. */
function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative rounded-md border px-3 py-2 text-[14px] transition-colors",
              on
                ? "border-[var(--accent-solid)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-solid)]"
                : "border-border bg-[var(--paper-2)] font-medium text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
            )}
          >
            {o.label}
            {on && (
              <HugeiconsIcon
                icon={CheckIcon}
                className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
                strokeWidth={3}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------- tools

export function ToolsPanel() {
  const settings = useStore((s) => s.settings)
  const providers = useStore((s) => s.providers)
  const collections = useStore((s) => s.collections)
  const mcpServers = useStore((s) => s.mcpServers)
  const store = useStore
  const [searchKey, setSearchKey] = React.useState("")
  const [editingSearchKey, setEditingSearchKey] = React.useState(false)
  const [checkingSearchKey, setCheckingSearchKey] = React.useState(false)
  const [probing, setProbing] = React.useState(false)
  const [reindexing, setReindexing] = React.useState<string | null>(null)
  const [manualEmbedModel, setManualEmbedModel] = React.useState("")

  const embedProviders = providers.filter((p) => p.enabled && canEmbed(p))
  const [embedProviderId, setEmbedProviderId] = React.useState(
    settings.embedding.providerId !== "local" ? settings.embedding.providerId : ""
  )
  const embedProvider = embedProviders.find((p) => p.id === embedProviderId) ?? embedProviders[0]
  const active = SEARCH_KINDS.find((k) => k.id === settings.search.kind)

  const activeEmbedding =
    settings.embedding.providerId === "local" ? "local-hash" : settings.embedding.model
  const stale = collections.filter(
    (c) => c.embeddingModel !== activeEmbedding || c.dims !== settings.embedding.dims
  )

  const save = (patch: Partial<Settings>) => void store.getState().saveSettings(patch)

  /** A key is only "saved" once a real search comes back with it. */
  const saveSearchKey = async () => {
    const key = searchKey.trim()
    if (!key) return
    setCheckingSearchKey(true)
    const previous = settings.search.hasKey ? await vault.getSecret("search") : null
    try {
      await vault.setSecret("search", key)
      await webSearch("test", { ...settings, search: { ...settings.search, hasKey: true } }, 1)
      await store.getState().saveSettings({ search: { ...settings.search, hasKey: true } })
      setSearchKey("")
      setEditingSearchKey(false)
      store.getState().toast("success", `${active?.label} key works`)
    } catch (err) {
      if (previous) await vault.setSecret("search", previous)
      else await vault.delSecret("search")
      store.getState().toast("error", `${active?.label}: ${(err as Error).message}`)
    } finally {
      setCheckingSearchKey(false)
    }
  }

  /** Probing here means a bad id or key fails now, not three documents later. */
  const pick = async (providerId: string, model: string) => {
    const previous = settings.embedding
    const candidate = { providerId, model, dims: providerId === "local" ? 384 : 1536 }
    setProbing(true)
    await store.getState().saveSettings({ embedding: candidate })
    try {
      const dims = await probeEmbedding(store.getState().settings)
      await store.getState().saveSettings({ embedding: { ...candidate, dims } })
      store.getState().toast("success", `${model} · ${dims}d`)
    } catch (err) {
      await store.getState().saveSettings({ embedding: previous })
      store.getState().toast("error", `${model}: ${(err as Error).message}`)
    } finally {
      setProbing(false)
    }
  }

  const reindex = async (collectionId: string, name: string) => {
    setReindexing(collectionId)
    try {
      const n = await reindexCollection(collectionId, store.getState().settings)
      await store.getState().reloadCollections()
      store.getState().toast("success", `${name}: ${n} chunks re-embedded`)
    } catch (err) {
      store.getState().toast("error", (err as Error).message)
    } finally {
      setReindexing(null)
    }
  }

  return (
    <div>
      <Section title="Web search" hint="A browser cannot crawl, so search runs through a provider you choose.">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SEARCH_KINDS.map((k) => {
            const on = settings.search.kind === k.id
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={on}
                onClick={() => save({ search: { ...settings.search, kind: k.id } })}
                className={cn(
                  "relative rounded-md border px-3 py-2 text-left text-[14px] transition-colors",
                  on
                    ? "border-[var(--accent-solid)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-solid)]"
                    : "border-border bg-[var(--paper-2)] font-medium text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
                )}
              >
                {k.label}
                {on && (
                  <HugeiconsIcon
                    icon={CheckIcon}
                    className="absolute top-2.5 right-2 size-3.5"
                    strokeWidth={3}
                  />
                )}
              </button>
            )
          })}
        </div>

        {active && active.id !== "none" && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{active.hint}</p>
            {active.id === "searxng" || active.custom ? (
              <TextInput
                placeholder={active.placeholder}
                value={settings.search.endpoint}
                onChange={(e) => save({ search: { ...settings.search, endpoint: e.target.value } })}
              />
            ) : null}
            {active.needsKey &&
              (settings.search.hasKey && !editingSearchKey ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 text-[13px]">
                  <HugeiconsIcon
                    icon={CheckIcon}
                    className="size-3.5 shrink-0 text-[var(--accent-solid)]"
                    strokeWidth={3}
                  />
                  <span className="flex-1">{active.label} key stored</span>
                  <button
                    type="button"
                    onClick={() => setEditingSearchKey(true)}
                    className="font-semibold text-[var(--accent-solid)] hover:underline"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await vault.delSecret("search")
                      save({ search: { ...settings.search, hasKey: false } })
                    }}
                    className="font-semibold text-muted-foreground hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <TextInput
                      type="password"
                      placeholder="API key"
                      value={searchKey}
                      onChange={(e) => setSearchKey(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={checkingSearchKey}
                      onClick={() => void saveSearchKey()}
                      className="ink-fill shrink-0 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60"
                    >
                      {checkingSearchKey ? "Checking…" : "Save"}
                    </button>
                  </div>
                  {active.keyPage && <KeyLink href={active.keyPage} label={active.label} />}
                </>
              ))}
          </div>
        )}
      </Section>

      <Section title="Page reading" hint="Tools and research need a URL turned into text.">
        <Choice
          value={settings.reader.kind}
          onChange={(kind) => save({ reader: { ...settings.reader, kind } })}
          options={[
            { id: "proxy", label: "Text proxy" },
            { id: "firecrawl", label: "Firecrawl" },
          ]}
        />
        {settings.reader.kind === "proxy" ? (
          <TextInput
            value={settings.reader.endpoint}
            placeholder="https://r.jina.ai/"
            onChange={(e) => save({ reader: { ...settings.reader, endpoint: e.target.value } })}
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Uses Firecrawl's scrape endpoint with the key above — set Firecrawl as your search
            provider, or paste its key there.
          </p>
        )}
      </Section>

      <Section
        title="Embeddings"
        hint="Used for knowledge retrieval and memory recall. Paste a model id; it is probed once to read its real vector width."
      >
        <div className="rounded-md border border-border bg-[var(--paper-2)] px-3 py-2 text-[13px]">
          <span className="font-medium">Active</span>{" "}
          <span className="font-mono text-muted-foreground">
            {settings.embedding.providerId === "local"
              ? "local-hash"
              : settings.embedding.model || "not set"}{" "}
            · {settings.embedding.dims}d
            {settings.embedding.providerId !== "local" &&
              ` · ${providers.find((p) => p.id === settings.embedding.providerId)?.label ?? "unknown provider"}`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void pick("local", "local-hash")}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
            settings.embedding.providerId === "local"
              ? "border-[var(--accent-solid)] bg-[var(--accent-soft)]"
              : "border-border bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">Local hashing embedder</span>
            <span className="block font-mono text-[12px] text-muted-foreground">
              384d · offline · lexical, not semantic
            </span>
          </span>
          {settings.embedding.providerId === "local" && (
            <HugeiconsIcon
              icon={CheckIcon}
              className="size-4 text-[var(--accent-solid)]"
              strokeWidth={3}
            />
          )}
        </button>

        {embedProviders.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No connected provider offers embeddings. Add OpenAI, Google, Ollama or any
            OpenAI-compatible endpoint in Providers.
          </p>
        ) : (
          <div className="flex gap-1.5">
            <select
              value={embedProvider?.id ?? ""}
              onChange={(e) => setEmbedProviderId(e.target.value)}
              className="w-32 shrink-0 rounded-md border border-border bg-[var(--paper-2)] px-2 py-1.5 text-[13px] outline-none"
            >
              {embedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <TextInput
              placeholder="model id"
              value={manualEmbedModel}
              onChange={(e) => setManualEmbedModel(e.target.value)}
            />
            <button
              type="button"
              disabled={probing || !manualEmbedModel.trim()}
              onClick={async () => {
                await pick(embedProvider.id, manualEmbedModel.trim())
                setManualEmbedModel("")
              }}
              className="ink-fill shrink-0 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60"
            >
              {probing ? "Testing…" : "Use"}
            </button>
          </div>
        )}

        {stale.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-warn/40 bg-warn/8 p-2.5">
            <span className="block text-[13px] font-semibold text-warn">
              {stale.length} collection{stale.length > 1 ? "s" : ""} built with another model
            </span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Vectors from different models are not comparable. Re-embed to use them with the active
              model — the text is already stored locally, nothing is re-uploaded.
            </p>
            {stale.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  {c.emoji} {c.name}{" "}
                  <span className="font-mono text-muted-foreground">
                    {c.embeddingModel} · {c.dims}d
                  </span>
                </span>
                <button
                  type="button"
                  disabled={Boolean(reindexing)}
                  onClick={() => void reindex(c.id, c.name)}
                  className="shrink-0 rounded-md border border-border bg-[var(--paper-2)] px-2 py-0.5 font-medium hover:bg-[var(--paper-3)] disabled:opacity-50"
                >
                  {reindexing === c.id ? "Re-embedding…" : "Re-embed"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Tool permissions">
        {tools.list().map((tool) => {
          const mode = settings.toolPermissions[tool.name] ?? (tool.sensitive ? "ask" : "always")
          return (
            <Row key={tool.name} label={tool.title} hint={tool.description.slice(0, 90)}>
              <Segmented
                options={["ask", "always", "never"] as const}
                value={mode}
                onChange={(m) =>
                  save({ toolPermissions: { ...settings.toolPermissions, [tool.name]: m } })
                }
              />
            </Row>
          )
        })}
      </Section>

      <Section
        title="MCP servers"
        hint="Streamable-HTTP MCP endpoints. The server must send permissive CORS headers; stdio servers are not reachable from a browser."
      >
        {mcpServers.map((server) => (
          <McpRow key={server.id} server={server} />
        ))}
        <button
          type="button"
          onClick={() =>
            void store.getState().saveMcpServer({ ...newMcpServer(), name: "New server" })
          }
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={AddIcon} className="size-3" strokeWidth={2.5} />
          Add MCP server
        </button>
      </Section>
    </div>
  )
}

function McpRow({ server }: { server: McpServer }) {
  const store = useStore
  const [draft, setDraft] = React.useState(server)
  const [connecting, setConnecting] = React.useState(false)
  const [found, setFound] = React.useState<{ url: string; tools: McpTool[] } | null>(null)

  /** Listing tools is the handshake, so it doubles as a connection test. */
  const saveAndConnect = async () => {
    if (!draft.url.trim()) {
      store.getState().toast("error", "Enter the server URL first")
      return
    }
    setConnecting(true)
    try {
      const tools = await listMcpTools(draft)
      setFound({ url: draft.url, tools })
      await store.getState().saveMcpServer(draft)
      store.getState().toast("success", `${draft.name || draft.url}: ${tools.length} tools`)
    } catch (err) {
      setFound(null)
      store.getState().toast("error", `${draft.name || draft.url}: ${(err as Error).message}`)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-[var(--paper-2)] p-2.5">
      <div className="flex gap-1.5">
        <TextInput
          className="font-sans"
          placeholder="Name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <TextInput
          placeholder="slug"
          value={draft.slug}
          onChange={(e) => setDraft({ ...draft, slug: e.target.value.replace(/\W/g, "_") })}
          className="w-24"
        />
      </div>
      <TextInput
        placeholder="https://server.example.com/mcp"
        value={draft.url}
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
        <span className="text-[13px] text-muted-foreground">enabled</span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={connecting}
          onClick={() => void saveAndConnect()}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[13px] font-semibold hover:bg-[var(--paper-3)] disabled:opacity-60"
        >
          <HugeiconsIcon icon={PlugIcon} className="size-3" strokeWidth={2} />
          {connecting ? "Connecting…" : "Save and connect"}
        </button>
        <button
          type="button"
          aria-label="Remove server"
          onClick={() => void store.getState().deleteMcpServer(server.id)}
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={DeleteIcon} className="size-3.5" strokeWidth={2} />
        </button>
      </div>

      {found?.url === draft.url && (
        <div className="space-y-1 pt-0.5">
          <span className="block text-[12px] text-muted-foreground">
            {found.tools.length} tool{found.tools.length === 1 ? "" : "s"}
            {found.tools.length ? ` · exposed as ${draft.slug}_*` : ""}
          </span>
          {found.tools.map((t) => (
            <div key={t.name} className="rounded-md bg-[var(--paper-3)]/60 px-2 py-1">
              <span className="block font-mono text-[12px] font-medium">{t.name}</span>
              {t.description && (
                <span className="block text-[12px] leading-relaxed text-muted-foreground">
                  {t.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ memory

export function MemoryPanel() {
  const settings = useStore((s) => s.settings)
  const memories = useStore((s) => s.memories)
  const store = useStore
  const [query, setQuery] = React.useState("")
  const [adding, setAdding] = React.useState("")

  const q = query.toLowerCase().trim()
  const list = memories
    .filter((m) => !q || m.text.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)

  const addMemory = async () => {
    if (!adding.trim()) return
    await addManualMemory(adding.trim(), settings)
    setAdding("")
    await store.getState().reloadMemories()
  }

  return (
    <div>
      <Section
        title="Long-term memory"
        hint="After each exchange a small extraction pass looks for durable facts. Everything is stored locally and only relevant memories are injected into a prompt."
      >
        <Row label="Memory enabled">
          <Switch
            checked={settings.memory.enabled}
            onCheckedChange={(v) =>
              void store.getState().saveSettings({ memory: { ...settings.memory, enabled: v } })
            }
          />
        </Row>
        <Row label="Automatic extraction" hint="Costs one small model call per exchange">
          <Switch
            checked={settings.memory.autoExtract}
            onCheckedChange={(v) =>
              void store.getState().saveSettings({ memory: { ...settings.memory, autoExtract: v } })
            }
          />
        </Row>
        <Row label={`Max injected: ${settings.memory.maxInjected}`}>
          <div className="w-36">
            <Slider
              value={[settings.memory.maxInjected]}
              min={1}
              max={20}
              step={1}
              onValueChange={(v) =>
                void store.getState().saveSettings({
                  memory: { ...settings.memory, maxInjected: sliderValue(v) },
                })
              }
            />
          </div>
        </Row>
      </Section>

      <Section title={`Memories (${memories.length})`}>
        <TextInput
          className="font-sans"
          placeholder="Search memories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1.5">
          <TextInput
            className="font-sans"
            placeholder="Teach it something durable…"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addMemory()
            }}
          />
          <button
            type="button"
            onClick={() => void addMemory()}
            className="ink-fill shrink-0 rounded-full px-3 text-[13px] font-semibold"
          >
            Add
          </button>
        </div>

        <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pt-1">
          {list.map((m) => (
            <div
              key={m.id}
              className={cn(
                "group rounded-md border border-border bg-[var(--paper-2)] px-3 py-2 text-[13px]",
                m.disabled && "opacity-50"
              )}
            >
              <p className={cn("leading-relaxed", m.disabled && "line-through")}>{m.text}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="rounded-[4px] border border-border px-1 font-mono text-[11px] text-muted-foreground">
                  {m.kind}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString()} · used {m.useCount}×
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => void store.getState().patchMemory(m.id, { pinned: !m.pinned })}
                  className={cn(
                    "grid size-5 place-items-center rounded-[5px]",
                    m.pinned ? "text-[var(--accent-solid)]" : "text-muted-foreground"
                  )}
                  aria-label={m.pinned ? "Unpin" : "Pin"}
                >
                  <HugeiconsIcon icon={PinIcon} className="size-3" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => void store.getState().patchMemory(m.id, { disabled: !m.disabled })}
                  className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  {m.disabled ? "enable" : "forget"}
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => void store.getState().deleteMemory(m.id)}
                  className="grid size-5 place-items-center rounded-[5px] text-muted-foreground hover:text-destructive"
                >
                  <HugeiconsIcon icon={CloseIcon} className="size-3" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {memories.length ? "No matches." : "Nothing remembered yet."}
            </p>
          )}
        </div>
        {memories.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete all ${memories.length} memories?`)) return
              for (const m of memories) await store.getState().deleteMemory(m.id)
            }}
            className="text-[13px] font-medium text-destructive hover:underline"
          >
            forget everything
          </button>
        )}
      </Section>
    </div>
  )
}

// -------------------------------------------------------------- assistants

export function AssistantsPanel() {
  const assistants = useStore((s) => s.assistants)
  const providers = useStore((s) => s.providers)
  const collections = useStore((s) => s.collections)
  const store = useStore
  const [editing, setEditing] = React.useState<Assistant | null>(null)

  return (
    <div>
      <Section
        title="Custom assistants"
        hint="A name, a system prompt, defaults, and optional knowledge."
      >
        {assistants.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-3 py-2"
          >
            <span className="text-[16px]">{a.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{a.name}</span>
              <span className="block truncate text-[13px] text-muted-foreground">
                {a.description}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setEditing(a)}
              className="rounded-md border border-border px-2.5 py-1 text-[13px] font-medium hover:bg-[var(--paper-3)]"
            >
              Edit
            </button>
            <button
              type="button"
              aria-label="Delete assistant"
              onClick={() => void store.getState().deleteAssistant(a.id)}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:text-destructive"
            >
              <HugeiconsIcon icon={DeleteIcon} className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: uid(),
              name: "",
              emoji: "✳️",
              description: "",
              systemPrompt: "",
              params: {},
              knowledgeCollections: [],
              createdAt: Date.now(),
            })
          }
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={AddIcon} className="size-3" strokeWidth={2.5} />
          New assistant
        </button>
      </Section>

      {editing && (
        <div className="panel space-y-2 rounded-xl p-3">
          <div className="flex gap-1.5">
            <TextInput
              className="w-14 text-center font-sans text-[16px]"
              value={editing.emoji}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value.slice(0, 2) })}
            />
            <TextInput
              className="font-sans"
              placeholder="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <TextInput
            className="font-sans"
            placeholder="One-line description"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />
          <textarea
            value={editing.systemPrompt}
            onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
            placeholder="System prompt"
            className="field-sizing-content max-h-64 min-h-28 w-full resize-none rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2 text-[14px] leading-relaxed outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {collections.map((c) => {
              const on = editing.knowledgeCollections.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      knowledgeCollections: on
                        ? editing.knowledgeCollections.filter((id) => id !== c.id)
                        : [...editing.knowledgeCollections, c.id],
                    })
                  }
                  className={cn(
                    "rounded-md border border-border px-2.5 py-1 text-[13px] font-medium",
                    on ? "bg-[var(--paper-3)]" : "bg-[var(--paper-2)]"
                  )}
                >
                  {c.emoji} {c.name}
                </button>
              )
            })}
          </div>
          <select
            value={editing.providerId && editing.model ? `${editing.providerId}|${editing.model}` : ""}
            onChange={(e) => {
              const [providerId, model] = e.target.value.split("|")
              setEditing({
                ...editing,
                providerId: providerId || undefined,
                model: model || undefined,
              })
            }}
            className="w-full rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 text-[14px] outline-none"
          >
            <option value="">Use the conversation's model</option>
            {providers.flatMap((p) =>
              p.models
                .filter((m) => !m.capabilities.embedding)
                .map((m) => (
                  <option key={`${p.id}|${m.id}`} value={`${p.id}|${m.id}`}>
                    {p.label} · {m.label}
                  </option>
                ))
            )}
          </select>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-full px-3 py-1.5 text-[14px] font-medium text-muted-foreground hover:bg-[var(--paper-3)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editing.name.trim()) return
                void store.getState().saveAssistant(editing)
                setEditing(null)
              }}
              className="ink-fill rounded-full px-4 py-1.5 text-[14px] font-semibold"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------- appearance

export function AppearancePanel() {
  const settings = useStore((s) => s.settings)
  const store = useStore
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <Section title="Theme">
        <Choice
          value={theme}
          onChange={(t) => {
            setTheme(t)
            void store.getState().saveSettings({ theme: t })
          }}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "system", label: "System" },
          ]}
        />
      </Section>

      <Section title="Accent">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ACCENTS).map(([id, tone]) => {
            const on = settings.accent === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => void store.getState().saveSettings({ accent: id })}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                  on
                    ? "border-foreground/60 bg-[var(--paper-3)] font-semibold"
                    : "border-border bg-[var(--paper-2)] font-medium text-muted-foreground hover:text-foreground"
                )}
              >
                <AccentDot color={tone.light} />
                {tone.label}
                {on && (
                  <HugeiconsIcon icon={CheckIcon} className="size-3" strokeWidth={3} />
                )}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Motion" hint="Off stops every transition, including the streaming caret.">
        <Choice
          value={settings.effects}
          onChange={(effects) => void store.getState().saveSettings({ effects })}
          options={[
            { id: "full", label: "Full" },
            { id: "reduced", label: "Reduced" },
            { id: "off", label: "Off" },
          ]}
        />
      </Section>

      <Section title="Composing">
        <Row label="Send with" hint="Shift+Enter always inserts a newline">
          <Segmented
            options={["enter", "mod-enter"] as const}
            value={settings.sendKey}
            onChange={(k) => void store.getState().saveSettings({ sendKey: k })}
          />
        </Row>
      </Section>

      <Section title="Readouts">
        <Row label="Token and cost counts">
          <Switch
            checked={settings.showTokenCounts}
            onCheckedChange={(v) => void store.getState().saveSettings({ showTokenCounts: v })}
          />
        </Row>
        <Row label="Tokens per second" hint="Live while streaming, measured when the turn ends">
          <Switch
            checked={settings.showTokenRate}
            onCheckedChange={(v) => void store.getState().saveSettings({ showTokenRate: v })}
          />
        </Row>
      </Section>
    </div>
  )
}

// -------------------------------------------------------------------- data

export function DataPanel() {
  const store = useStore
  const conversations = useStore((s) => s.conversations)
  const memories = useStore((s) => s.memories)
  const collections = useStore((s) => s.collections)
  const [used, setUsed] = React.useState(0)
  const [attachmentBytes, setAttachmentBytes] = React.useState(0)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const refresh = React.useCallback(async () => {
    setUsed((await storageEstimate()).usage)
    setAttachmentBytes((await attachments.all()).reduce((n, r) => n + r.blob.size, 0))
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const onImport = async (file: File) => {
    try {
      const json: unknown = JSON.parse(await file.text())
      if ((json as Backup).app === "wink") {
        // Cancel (and Escape) must land on the non-destructive option.
        const mode = window.confirm(
          "Replace everything with this backup?\n\nOK replaces, Cancel merges into your current data."
        )
          ? "replace"
          : "merge"
        const res = await importBackup(json as Backup, mode)
        store.getState().toast("success", `Imported ${res.conversations} chats`)
      } else {
        const count = await importChatGptExport(json)
        store.getState().toast("success", `Imported ${count} ChatGPT conversations`)
      }
      await store.getState().init()
    } catch (err) {
      store.getState().toast("error", (err as Error).message)
    }
  }

  return (
    <div>
      <Section title="Storage" hint="Everything lives in this browser's IndexedDB.">
        <Row label="Used">
          <span className="font-mono text-[14px]">{fmtBytes(used)}</span>
        </Row>
        <Row label="Attachments">
          <span className="font-mono text-[14px]">{fmtBytes(attachmentBytes)}</span>
        </Row>
        <Row label="Conversations">
          <span className="font-mono text-[14px]">{conversations.length}</span>
        </Row>
        <Row label="Memories">
          <span className="font-mono text-[14px]">{memories.length}</span>
        </Row>
        <Row label="Knowledge chunks">
          <span className="font-mono text-[14px]">
            {collections.reduce((n, c) => n + c.chunkCount, 0)}
          </span>
        </Row>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[13px] font-medium hover:bg-[var(--paper-3)]"
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-3" strokeWidth={2} />
          Recalculate
        </button>
      </Section>

      <Section title="Backup" hint="Backups never contain API keys.">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={async () => {
              const backup = await exportBackup()
              download(
                `wink-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(backup)
              )
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon icon={DownloadIcon} className="size-3.5" strokeWidth={2} />
            Export everything
          </button>
          <button
            type="button"
            onClick={async () => {
              const backup = await exportBackup({ knowledge: false })
              download(
                `wink-chats-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(backup)
              )
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon icon={DownloadIcon} className="size-3.5" strokeWidth={2} />
            Chats only
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon icon={UploadIcon} className="size-3.5" strokeWidth={2} />
            Import backup or ChatGPT export
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImport(file)
              e.target.value = ""
            }}
          />
        </div>
      </Section>

      <Section title="Danger zone">
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("Delete every conversation, memory, document and provider?")) return
            if (!window.confirm("Really? This cannot be undone.")) return
            await wipeAll()
            location.reload()
          }}
          className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-[13px] font-semibold text-destructive hover:bg-destructive/8"
        >
          <HugeiconsIcon icon={DeleteIcon} className="size-3.5" strokeWidth={2} />
          Erase all local data
        </button>
      </Section>
    </div>
  )
}

// ----------------------------------------------------------------- privacy

export function PrivacyPanel() {
  const settings = useStore((s) => s.settings)
  const providers = useStore((s) => s.providers)
  const store = useStore
  const [pass, setPass] = React.useState("")
  const [pass2, setPass2] = React.useState("")

  const enableVault = async () => {
    if (pass.length < 8 || pass !== pass2) {
      store.getState().toast("error", "Passphrases must match and be at least 8 characters")
      return
    }
    const { salt, check } = await vault.enable(pass)
    await store.getState().saveSettings({ vault: { enabled: true, salt, check } })
    setPass("")
    setPass2("")
    store.getState().toast("success", "Vault enabled — keys now need your passphrase")
  }

  return (
    <div>
      <Section title="Where your data lives">
        <div className="space-y-2 rounded-lg border border-border bg-[var(--paper-2)] p-3 text-[13px] leading-relaxed">
          <Fact icon={ShieldIcon}>
            Conversations, memories, documents, embeddings and settings: IndexedDB in this browser
            only. No Wink server exists.
          </Fact>
          <Fact icon={LockIcon}>
            API keys: AES-GCM encrypted with a non-extractable device key
            {settings.vault.enabled ? " wrapped by your passphrase vault" : ""}.
          </Fact>
          <Fact icon={BrainIcon}>
            Model providers receive only the messages, attachments, retrieved passages and memories
            you allow per provider.
          </Fact>
        </div>
      </Section>

      <Section title="Per-provider data allowances">
        {providers.map((p) => (
          <Row
            key={p.id}
            label={p.label}
            hint={`${p.local ? "on device" : "cloud"} · ${
              [
                p.allow.attachments && "files",
                p.allow.knowledge && "knowledge",
                p.allow.memories && "memories",
              ]
                .filter(Boolean)
                .join(", ") || "text only"
            }`}
          >
            <button
              type="button"
              onClick={() => store.getState().openSettings("providers")}
              className="rounded-md border border-border px-2.5 py-1 text-[13px] font-medium hover:bg-[var(--paper-3)]"
            >
              Change
            </button>
          </Row>
        ))}
        {providers.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No providers connected.</p>
        )}
      </Section>

      <Section
        title="Encrypted vault"
        hint="Adds a passphrase over your API keys. Wink asks for it once per session; forget it and the keys are unrecoverable."
      >
        {settings.vault.enabled ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                vault.lock()
                store.getState().set("vaultPrompt", true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--paper-3)]"
            >
              <HugeiconsIcon icon={LockIcon} className="size-3.5" strokeWidth={2} />
              Lock now
            </button>
            <button
              type="button"
              onClick={async () => {
                await vault.disable()
                await store.getState().saveSettings({ vault: { enabled: false } })
                store.getState().toast("info", "Vault disabled — keys use the device key again")
              }}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-[13px] font-semibold text-destructive hover:bg-destructive/8"
            >
              Disable vault
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <TextInput
              type="password"
              placeholder="Passphrase (8+ characters)"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <TextInput
              type="password"
              placeholder="Repeat passphrase"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void enableVault()}
              className="ink-fill rounded-full px-4 py-1.5 text-[13px] font-semibold"
            >
              Enable vault
            </button>
          </div>
        )}
      </Section>

      <Section title="Housekeeping">
        <button
          type="button"
          onClick={async () => {
            await kv.del("mcpServers")
            store.getState().toast("info", "MCP server list cleared")
          }}
          className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--paper-3)]"
        >
          Clear MCP servers
        </button>
      </Section>
    </div>
  )
}

function Fact({ icon, children }: { icon: typeof ShieldIcon; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <HugeiconsIcon
        icon={icon}
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
      <span className="text-muted-foreground">{children}</span>
    </div>
  )
}
