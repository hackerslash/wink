import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AccentDot } from "@/components/fx"
import {
  AddIcon,
  BrainIcon,
  CheckIcon,
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
import { newMcpServer, type McpServer } from "@/lib/mcp"
import { addManualMemory } from "@/lib/memory"
import { useStore } from "@/lib/store"
import { tools } from "@/lib/tools"
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
      <h3 className="mb-1 text-[12.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
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
        {hint && <span className="block text-[12.5px] text-muted-foreground">{hint}</span>}
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
    <div className="flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-[5px] px-2 py-0.5 text-[12px] font-medium capitalize transition-colors",
            value === o ? "bg-[var(--paper-3)] text-foreground" : "text-muted-foreground"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------- tools

export function ToolsPanel() {
  const settings = useStore((s) => s.settings)
  const providers = useStore((s) => s.providers)
  const mcpServers = useStore((s) => s.mcpServers)
  const store = useStore
  const [searchKey, setSearchKey] = React.useState("")

  const embeddingModels = providers.flatMap((p) =>
    p.models.filter((m) => m.capabilities.embedding).map((m) => ({ provider: p, model: m }))
  )

  const save = (patch: Partial<Settings>) => void store.getState().saveSettings(patch)

  return (
    <div>
      <Section
        title="Web search"
        hint="Wink has no server, so search runs through a provider you choose. Tavily and Jina work from the browser; Brave often blocks browser CORS; SearXNG works if you enable its JSON format."
      >
        <div className="flex flex-wrap gap-1.5">
          {(["none", "tavily", "jina", "searxng", "brave"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => save({ search: { ...settings.search, kind } })}
              className={cn(
                "rounded-md border border-border px-3 py-1 text-[13px] font-medium capitalize transition-colors",
                settings.search.kind === kind
                  ? "bg-[var(--paper-3)]"
                  : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              {kind}
            </button>
          ))}
        </div>
        {settings.search.kind !== "none" && (
          <>
            <TextInput
              placeholder={
                settings.search.kind === "searxng"
                  ? "http://localhost:8888"
                  : "custom endpoint (optional)"
              }
              value={settings.search.endpoint}
              onChange={(e) => save({ search: { ...settings.search, endpoint: e.target.value } })}
            />
            <div className="flex gap-1.5">
              <TextInput
                type="password"
                placeholder={settings.search.hasKey ? "key stored — paste to replace" : "API key"}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
              <button
                type="button"
                onClick={async () => {
                  await vault.setSecret("search", searchKey.trim())
                  save({ search: { ...settings.search, hasKey: Boolean(searchKey.trim()) } })
                  setSearchKey("")
                }}
                className="ink-fill shrink-0 rounded-full px-3 text-[13px] font-semibold"
              >
                Save
              </button>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Page reader"
        hint="Browsers block direct cross-origin fetches, so pages are read through a text-extraction proxy. Default is r.jina.ai; set your own to keep URLs private."
      >
        <TextInput
          value={settings.reader.endpoint}
          placeholder="https://r.jina.ai/"
          onChange={(e) => save({ reader: { endpoint: e.target.value } })}
        />
      </Section>

      <Section
        title="Embeddings"
        hint="Used for knowledge retrieval and memory similarity. Local hashing is lexical and offline; a real embedding model (e.g. nomic-embed-text on Ollama) gives semantic recall."
      >
        <div className="space-y-1">
          <button
            type="button"
            onClick={() =>
              save({ embedding: { providerId: "local", model: "local-hash", dims: 384 } })
            }
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left transition-colors",
              settings.embedding.providerId === "local"
                ? "bg-[var(--paper-3)]"
                : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Local hashing embedder</span>
              <span className="block font-mono text-[11.5px] text-muted-foreground">
                384d · offline · lexical
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
          {embeddingModels.map(({ provider, model }) => {
            const on =
              settings.embedding.providerId === provider.id && settings.embedding.model === model.id
            return (
              <button
                key={`${provider.id}-${model.id}`}
                type="button"
                onClick={() =>
                  save({
                    embedding: {
                      providerId: provider.id,
                      model: model.id,
                      dims: model.id.includes("large") ? 3072 : 1536,
                    },
                  })
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left transition-colors",
                  on ? "bg-[var(--paper-3)]" : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{model.label}</span>
                  <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                    {provider.label} {provider.local ? "· on device" : "· cloud"}
                  </span>
                </span>
                {on && (
                  <HugeiconsIcon
                    icon={CheckIcon}
                    className="size-4 text-[var(--accent-solid)]"
                    strokeWidth={3}
                  />
                )}
              </button>
            )
          })}
          {embeddingModels.length === 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              No embedding models found. Connect OpenAI, Gemini or Ollama and refresh models.
            </p>
          )}
        </div>
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
        <span className="text-[12.5px] text-muted-foreground">enabled</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void store.getState().saveMcpServer(draft)}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] font-semibold hover:bg-[var(--paper-3)]"
        >
          <HugeiconsIcon icon={PlugIcon} className="size-3" strokeWidth={2} />
          Save and connect
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
                  className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
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
            className="text-[12.5px] font-medium text-destructive hover:underline"
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
              <span className="block truncate text-[13.5px] font-semibold">{a.name}</span>
              <span className="block truncate text-[12.5px] text-muted-foreground">
                {a.description}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setEditing(a)}
              className="rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-[var(--paper-3)]"
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
            className="field-sizing-content max-h-64 min-h-28 w-full resize-none rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2 text-[13.5px] leading-relaxed outline-none"
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
                    "rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium",
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
            className="w-full rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 text-[13.5px] outline-none"
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
              className="rounded-full px-3 py-1.5 text-[13.5px] font-medium text-muted-foreground hover:bg-[var(--paper-3)]"
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
              className="ink-fill rounded-full px-4 py-1.5 text-[13.5px] font-semibold"
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
        <div className="flex gap-1.5">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTheme(t)
                void store.getState().saveSettings({ theme: t })
              }}
              className={cn(
                "flex-1 rounded-md border border-border px-3 py-2 text-[13.5px] font-medium capitalize transition-colors",
                theme === t ? "bg-[var(--paper-3)]" : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Surface"
        hint="Solid keeps every pane opaque. Liquid glass makes them translucent and blurs what sits behind — heavier on the GPU, and it lights the background with your accent."
      >
        <div className="flex gap-1.5">
          {(
            [
              ["solid", "Solid"],
              ["glass", "Liquid glass"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => void store.getState().saveSettings({ surface: id })}
              className={cn(
                "flex-1 rounded-md border border-border px-3 py-2 text-[13.5px] font-medium transition-colors",
                settings.surface === id
                  ? "bg-[var(--paper-3)]"
                  : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accent" hint="One solid accent, used as a highlighter — never as a wash.">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ACCENTS).map(([id, tone]) => (
            <button
              key={id}
              type="button"
              onClick={() => void store.getState().saveSettings({ accent: id })}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                settings.accent === id
                  ? "border-foreground/40 bg-[var(--paper-3)]"
                  : "border-border bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              <AccentDot color={tone.light} />
              {tone.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Motion"
        hint="Reduce or switch off the small transitions. The interface is solid either way."
      >
        <div className="flex gap-1.5">
          {(["full", "reduced", "off"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => void store.getState().saveSettings({ effects: level })}
              className={cn(
                "flex-1 rounded-md border border-border px-3 py-2 text-[13.5px] font-medium capitalize transition-colors",
                settings.effects === level
                  ? "bg-[var(--paper-3)]"
                  : "bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Behaviour">
        <Row label="Send with" hint="Shift+Enter always inserts a newline">
          <Segmented
            options={["enter", "mod-enter"] as const}
            value={settings.sendKey}
            onChange={(k) => void store.getState().saveSettings({ sendKey: k })}
          />
        </Row>
        <Row label="Show token and cost counts">
          <Switch
            checked={settings.showTokenCounts}
            onCheckedChange={(v) => void store.getState().saveSettings({ showTokenCounts: v })}
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
      const json = JSON.parse(await file.text()) as Backup | unknown
      if ((json as Backup).app === "wink") {
        const mode = window.confirm("Merge into current data? Cancel replaces everything.")
          ? "merge"
          : "replace"
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
          <span className="font-mono text-[13.5px]">{fmtBytes(used)}</span>
        </Row>
        <Row label="Attachments">
          <span className="font-mono text-[13.5px]">{fmtBytes(attachmentBytes)}</span>
        </Row>
        <Row label="Conversations">
          <span className="font-mono text-[13.5px]">{conversations.length}</span>
        </Row>
        <Row label="Memories">
          <span className="font-mono text-[13.5px]">{memories.length}</span>
        </Row>
        <Row label="Knowledge chunks">
          <span className="font-mono text-[13.5px]">
            {collections.reduce((n, c) => n + c.chunkCount, 0)}
          </span>
        </Row>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-[var(--paper-3)]"
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
              className="rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-[var(--paper-3)]"
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
          className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium hover:bg-[var(--paper-3)]"
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
