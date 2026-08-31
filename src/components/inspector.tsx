import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import {
  BookIcon,
  BrainIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  InfoIcon,
  LinkIcon,
  PinIcon,
  SlidersIcon,
  SparklesIcon,
  WrenchIcon,
} from "@/components/icons"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { fmtCost, fmtTokens } from "@/lib/defaults"
import { exportConversation } from "@/lib/exporting"
import { pathToHead } from "@/lib/prompt"
import { activeSelection, useStore } from "@/lib/store"
import { tools } from "@/lib/tools"
import { uid } from "@/lib/db"
import type { Citation } from "@/lib/types"
import { cn } from "@/lib/utils"
type Tab = "model" | "context" | "memory" | "sources" | "tools" | "info"
const TABS: { id: Tab; icon: typeof SlidersIcon; label: string }[] = [
  { id: "model", icon: SlidersIcon, label: "Model" },
  { id: "context", icon: BookIcon, label: "Context" },
  { id: "memory", icon: BrainIcon, label: "Memory" },
  { id: "sources", icon: LinkIcon, label: "Sources" },
  { id: "tools", icon: WrenchIcon, label: "Tools" },
  { id: "info", icon: InfoIcon, label: "Info" },
]

export function Inspector() {
  const open = useStore((s) => s.inspectorOpen)
  const [tab, setTab] = React.useState<Tab>("model")

  return (
    <aside
      className={cn(
        "z-20 hidden h-full shrink-0 overflow-hidden transition-[width,opacity] duration-400 lg:block",
        open ? "w-[21rem] opacity-100" : "w-0 opacity-0"
      )}
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      <div className="flex h-full flex-col overflow-hidden border-l border-border bg-[var(--paper)]">
        <div className="flex h-14 items-center gap-1 px-2 rule-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              title={t.label}
              aria-label={t.label}
              className={cn(
                "grid size-8 place-items-center rounded-xl transition-all",
                tab === t.id
                  ? "bg-[var(--paper-3)] text-foreground"
                  : "text-muted-foreground hover:bg-[var(--paper-3)]/70 hover:text-foreground"
              )}
            >
              <HugeiconsIcon icon={t.icon} className="size-4" strokeWidth={2} />
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close inspector"
            onClick={() => useStore.getState().set("inspectorOpen", false)}
            className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06]"
          >
            <HugeiconsIcon
              icon={CloseIcon}
              className="size-4"
              strokeWidth={2}
            />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "model" && <ModelTab />}
          {tab === "context" && <ContextTab />}
          {tab === "memory" && <MemoryTab />}
          {tab === "sources" && <SourcesTab />}
          {tab === "tools" && <ToolsTab />}
          {tab === "info" && <InfoTab />}
        </div>
      </div>
    </aside>
  )
}

function Section({
  title,
  children,
  hint,
}: {
  title: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  )
}

function Num({ value }: { value: number | string }) {
  return (
    <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
      {value}
    </span>
  )
}

const sliderValue = (v: number | readonly number[]) =>
  Array.isArray(v) ? v[0] : (v as number)

function ModelTab() {
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const providers = useStore((s) => s.providers)
  const assistants = useStore((s) => s.assistants)
  const presets = useStore((s) => s.presets)
  const settings = useStore((s) => s.settings)
  const store = useStore
  const params = conv?.params ?? settings.defaultParams
  const selection = activeSelection(useStore.getState())
  const model = providers
    .find((p) => p.id === selection.providerId)
    ?.models.find((m) => m.id === selection.model)

  return (
    <>
      <Section title="Model">
        <button
          type="button"
          onClick={() => store.getState().set("modelPickerOpen", true)}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-3)]"
        >
          <HugeiconsIcon
            icon={SparklesIcon}
            className="size-4 text-primary"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {model?.label ?? selection.model ?? "Pick a model"}
            </span>
            <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
              {providers.find((p) => p.id === selection.providerId)?.label ??
                "no provider"}
              {model
                ? ` · ${fmtTokens(model.capabilities.contextWindow)} ctx`
                : ""}
            </span>
          </span>
        </button>
        {conv?.compareModels?.length ? (
          <div className="mt-2 space-y-1">
            {conv.compareModels.map((c) => (
              <div
                key={`${c.providerId}:${c.model}`}
                className="flex items-center gap-1.5 rounded-xl bg-foreground/[0.05] px-2 py-1 text-[12.5px]"
              >
                <span className="size-1.5 rounded-full accent-fill" />
                <span className="truncate font-mono">{c.model}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void store.getState().setCompare(undefined)}
              className="text-[11.5px] font-medium text-muted-foreground hover:underline"
            >
              exit comparison
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Assistant">
        <div className="flex flex-wrap gap-1.5">
          {assistants.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void store.getState().applyAssistant(a.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-all",
                conv?.assistantId === a.id
                  ? "ink-fill"
                  : "border border-border bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
              )}
            >
              <span>{a.emoji}</span>
              {a.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="System prompt" hint="Applies to this conversation only.">
        <textarea
          value={params.systemPrompt}
          onChange={(e) =>
            void store.getState().setParams({ systemPrompt: e.target.value })
          }
          placeholder="Default Wink personality"
          className="field-sizing-content max-h-60 min-h-20 w-full resize-none rounded-md border border-border bg-[var(--paper-2)] px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-[var(--accent-solid)]"
        />
      </Section>

      <Section title="Generation">
        <Row label="Temperature">
          <Num value={params.temperature.toFixed(2)} />
        </Row>
        <Slider
          value={[params.temperature]}
          min={0}
          max={2}
          step={0.05}
          onValueChange={(v) =>
            void store.getState().setParams({ temperature: sliderValue(v) })
          }
        />
        <Row label="Top P">
          <Num value={params.topP.toFixed(2)} />
        </Row>
        <Slider
          value={[params.topP]}
          min={0.05}
          max={1}
          step={0.05}
          onValueChange={(v) =>
            void store.getState().setParams({ topP: sliderValue(v) })
          }
        />
        <Row label="Max output">
          <input
            type="number"
            min={64}
            placeholder="auto"
            value={params.maxTokens ?? ""}
            onChange={(e) =>
              void store.getState().setParams({
                maxTokens: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="w-24 rounded-lg px-2 py-1 text-right font-mono text-[12.5px] outline-none panel-2"
          />
        </Row>
        {model?.capabilities.reasoning && (
          <Row label="Reasoning">
            <div className="flex rounded-full bg-muted/70 p-0.5">
              {(["off", "low", "medium", "high"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() =>
                    void store.getState().setParams({
                      reasoningEffort: level === "off" ? undefined : level,
                    })
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize transition-all",
                    (params.reasoningEffort ?? "off") === level
                      ? "bg-background"
                      : "text-muted-foreground"
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </Row>
        )}
        {model?.capabilities.json && (
          <Row label="JSON mode">
            <Switch
              checked={params.jsonMode}
              onCheckedChange={(v) =>
                void store.getState().setParams({ jsonMode: v })
              }
            />
          </Row>
        )}
      </Section>

      <Section title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span key={p.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => void store.getState().setParams(p.params)}
                className="rounded-l-full bg-foreground/[0.06] px-2.5 py-1 text-[12.5px] font-medium hover:bg-foreground/[0.12]"
              >
                {p.name}
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${p.name}`}
                onClick={() => void store.getState().deletePreset(p.id)}
                className="rounded-r-full bg-foreground/[0.06] py-1 pr-1.5 pl-0.5 text-muted-foreground hover:text-destructive"
              >
                <HugeiconsIcon
                  icon={CloseIcon}
                  className="size-3"
                  strokeWidth={2.5}
                />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Preset name")
              if (!name) return
              void store.getState().savePreset({
                id: uid(),
                name,
                params: {
                  temperature: params.temperature,
                  topP: params.topP,
                  maxTokens: params.maxTokens,
                  systemPrompt: params.systemPrompt,
                  reasoningEffort: params.reasoningEffort,
                  jsonMode: params.jsonMode,
                },
                createdAt: Date.now(),
              })
            }}
            className="rounded-full border border-dashed border-border px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:border-primary hover:text-primary"
          >
            + save current
          </button>
        </div>
      </Section>
    </>
  )
}

function ContextTab() {
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const collections = useStore((s) => s.collections)
  const settings = useStore((s) => s.settings)
  const store = useStore
  const params = conv?.params ?? settings.defaultParams

  return (
    <>
      <Section
        title="History window"
        hint={
          params.contextWindowMessages === 0
            ? "Sending the full branch each turn."
            : `Only the last ${params.contextWindowMessages} messages are sent.`
        }
      >
        <Row label="Messages sent">
          <Num value={params.contextWindowMessages || "all"} />
        </Row>
        <Slider
          value={[params.contextWindowMessages]}
          min={0}
          max={60}
          step={2}
          onValueChange={(v) =>
            void store
              .getState()
              .setParams({ contextWindowMessages: sliderValue(v) })
          }
        />
      </Section>

      <Section
        title="Knowledge collections"
        hint="Retrieved passages are injected with citations."
      >
        {collections.length === 0 ? (
          <button
            type="button"
            onClick={() => store.getState().openSettings("knowledge")}
            className="w-full rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            + create a collection
          </button>
        ) : (
          <div className="space-y-1">
            {collections.map((c) => {
              const on = params.knowledgeCollections.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    void store.getState().setParams({
                      knowledgeCollections: on
                        ? params.knowledgeCollections.filter(
                            (id) => id !== c.id
                          )
                        : [...params.knowledgeCollections, c.id],
                    })
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    on ? "bg-primary/10" : "hover:bg-foreground/[0.05]"
                  )}
                >
                  <span className="text-base">{c.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {c.name}
                    </span>
                    <span className="block font-mono text-[11.5px] text-muted-foreground">
                      {c.docCount} docs · {c.chunkCount} chunks
                    </span>
                  </span>
                  {on && (
                    <HugeiconsIcon
                      icon={CheckIcon}
                      className="size-4 text-primary"
                      strokeWidth={3}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Toggles">
        <Row label="Tools">
          <Switch
            checked={params.toolsEnabled}
            onCheckedChange={(v) =>
              void store.getState().setParams({ toolsEnabled: v })
            }
          />
        </Row>
        <Row label="Memory recall">
          <Switch
            checked={params.memoryEnabled}
            onCheckedChange={(v) =>
              void store.getState().setParams({ memoryEnabled: v })
            }
          />
        </Row>
        <Row label="Knowledge retrieval">
          <Switch
            checked={params.knowledgeEnabled}
            onCheckedChange={(v) =>
              void store.getState().setParams({ knowledgeEnabled: v })
            }
          />
        </Row>
      </Section>
    </>
  )
}

function MemoryTab() {
  const memories = useStore((s) => s.memories)
  const messages = useStore((s) => s.messages)
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const store = useStore

  const usedIds = new Set(
    pathToHead(messages, conv?.headId ?? null).flatMap((m) => m.memoryIds ?? [])
  )
  const used = memories.filter((m) => usedIds.has(m.id))
  const rest = memories
    .filter((m) => !usedIds.has(m.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <>
      {used.length > 0 && (
        <Section title="Used in this conversation">
          <div className="space-y-1.5">
            {used.map((m) => (
              <MemoryRow key={m.id} id={m.id} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title={`All memories (${memories.length})`}
        hint="Extracted locally; nothing is uploaded."
      >
        <div className="space-y-1.5">
          {rest.slice(0, 40).map((m) => (
            <MemoryRow key={m.id} id={m.id} />
          ))}
          {memories.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Nothing remembered yet. Memories appear as you chat.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => store.getState().openSettings("memory")}
          className="mt-2 text-[11.5px] font-medium text-primary hover:underline"
        >
          manage all memories →
        </button>
      </Section>
    </>
  )
}

function MemoryRow({ id }: { id: string }) {
  const memory = useStore((s) => s.memories.find((m) => m.id === id))
  const store = useStore
  if (!memory) return null
  return (
    <div
      className={cn(
        "group rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2 text-[12.5px] leading-relaxed",
        memory.disabled && "opacity-45"
      )}
    >
      <p className={cn(memory.disabled && "line-through")}>{memory.text}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="rounded bg-foreground/[0.07] px-1 font-mono text-[11px] text-muted-foreground">
          {memory.kind}
        </span>
        {memory.useCount > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            used {memory.useCount}×
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={memory.pinned ? "Unpin memory" : "Pin memory"}
          onClick={() =>
            void store
              .getState()
              .patchMemory(memory.id, { pinned: !memory.pinned })
          }
          className={cn(
            "grid size-5 place-items-center rounded-md",
            memory.pinned
              ? "text-primary"
              : "text-muted-foreground opacity-0 group-hover:opacity-100"
          )}
        >
          <HugeiconsIcon icon={PinIcon} className="size-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() =>
            void store
              .getState()
              .patchMemory(memory.id, { disabled: !memory.disabled })
          }
          className="rounded-md px-1 text-[11px] font-semibold text-muted-foreground opacity-0 group-hover:opacity-100"
        >
          {memory.disabled ? "enable" : "forget"}
        </button>
        <button
          type="button"
          aria-label="Delete memory"
          onClick={() => void store.getState().deleteMemory(memory.id)}
          className="grid size-5 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
        >
          <HugeiconsIcon
            icon={CloseIcon}
            className="size-3"
            strokeWidth={2.5}
          />
        </button>
      </div>
    </div>
  )
}

function SourcesTab() {
  const messages = useStore((s) => s.messages)
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const path = pathToHead(messages, conv?.headId ?? null)
  const map = new Map<string, Citation>()
  for (const m of path)
    for (const c of m.citations ?? [])
      map.set(c.url ?? c.chunkId ?? `${c.title}-${c.n}`, c)
  const cites = [...map.values()]

  return (
    <Section title={`Sources (${cites.length})`}>
      {cites.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No sources yet. Web search and knowledge retrieval add them
          automatically.
        </p>
      ) : (
        <div className="space-y-1.5">
          {cites.map((c) => (
            <a
              key={c.url ?? c.chunkId}
              href={c.url ?? "#"}
              target={c.url ? "_blank" : undefined}
              rel="noreferrer noopener"
              className="block rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2 transition-colors hover:bg-[var(--paper-3)]"
            >
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[11.5px] text-primary">
                  [{c.n}]
                </span>
                <span className="truncate text-[12.5px] font-semibold">
                  {c.title}
                </span>
              </span>
              {c.url && (
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {c.url}
                </span>
              )}
              {c.collection && (
                <span className="mt-0.5 inline-block rounded bg-emerald-500/15 px-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  local · {c.collection}
                </span>
              )}
              {c.snippet && (
                <span className="mt-1 line-clamp-3 block text-[11.5px] leading-relaxed text-muted-foreground">
                  {c.snippet}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </Section>
  )
}

function ToolsTab() {
  const settings = useStore((s) => s.settings)
  const store = useStore
  const list = tools.list()

  return (
    <>
      <Section
        title="Available tools"
        hint="“Ask” prompts you before every run."
      >
        <div className="space-y-1">
          {list.map((tool) => {
            const mode =
              settings.toolPermissions[tool.name] ??
              (tool.sensitive ? "ask" : "always")
            return (
              <div
                key={tool.name}
                className="rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold">
                    {tool.title}
                  </span>
                  {tool.network && (
                    <span className="rounded bg-sky-500/15 px-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                      network
                    </span>
                  )}
                  <span className="flex-1" />
                  <div className="flex rounded-full bg-muted/70 p-0.5">
                    {(["ask", "always", "never"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          void store.getState().saveSettings({
                            toolPermissions: {
                              ...settings.toolPermissions,
                              [tool.name]: m,
                            },
                          })
                        }
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-semibold transition-all",
                          mode === m ? "bg-background" : "text-muted-foreground"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            )
          })}
        </div>
      </Section>
      <button
        type="button"
        onClick={() => store.getState().openSettings("tools")}
        className="text-[11.5px] font-medium text-primary hover:underline"
      >
        configure search, reader and MCP servers →
      </button>
    </>
  )
}

function InfoTab() {
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const messages = useStore((s) => s.messages)
  if (!conv)
    return (
      <p className="text-[13px] text-muted-foreground">
        No conversation selected.
      </p>
    )
  const path = pathToHead(messages, conv.headId)

  return (
    <>
      <Section title="Conversation">
        <Row label="Messages">
          <Num value={`${path.length} of ${messages.length}`} />
        </Row>
        <Row label="Tokens">
          <Num value={fmtTokens(conv.tokenTotal ?? 0)} />
        </Row>
        <Row label="Spend">
          <Num value={conv.costTotal ? fmtCost(conv.costTotal) : "—"} />
        </Row>
        <Row label="Created">
          <Num value={new Date(conv.createdAt).toLocaleDateString()} />
        </Row>
        <Row label="Branches">
          <Num
            value={
              messages.length - path.length > 0
                ? `${messages.length - path.length} hidden`
                : "none"
            }
          />
        </Row>
      </Section>
      <Section title="Export">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void exportConversation(conv.id, "md")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-[var(--paper-2)] py-2 text-[12.5px] font-medium transition-colors hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon
              icon={DownloadIcon}
              className="size-3.5"
              strokeWidth={2}
            />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => void exportConversation(conv.id, "json")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-[var(--paper-2)] py-2 text-[12.5px] font-medium transition-colors hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon
              icon={DownloadIcon}
              className="size-3.5"
              strokeWidth={2}
            />
            JSON
          </button>
        </div>
      </Section>
      <Section title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {conv.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                void useStore.getState().patchConversation(conv.id, {
                  tags: conv.tags.filter((x) => x !== t),
                })
              }
              className="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11.5px] font-medium hover:bg-destructive/15 hover:text-destructive"
            >
              {t}
              <HugeiconsIcon
                icon={CloseIcon}
                className="size-2.5"
                strokeWidth={3}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const tag = window.prompt("Add tag")
              if (tag)
                void useStore.getState().patchConversation(conv.id, {
                  tags: [...new Set([...conv.tags, tag.trim()])],
                })
            }}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11.5px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            + tag
          </button>
        </div>
      </Section>
    </>
  )
}
