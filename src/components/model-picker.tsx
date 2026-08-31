import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  BrainIcon,
  CheckIcon,
  CloudIcon,
  CpuIcon,
  EyeIcon,
  FileIcon,
  LayersIcon,
  SearchIcon,
  SettingsIcon,
  WrenchIcon,
} from "@/components/icons"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { fmtTokens } from "@/lib/defaults"
import { useActiveModel, useStore } from "@/lib/store"
import type { ModelInfo, ProviderConfig } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ModelPicker() {
  const open = useStore((s) => s.modelPickerOpen)
  const providers = useStore((s) => s.providers)
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const selection = useActiveModel()
  const store = useStore
  const [query, setQuery] = React.useState("")

  const groups = React.useMemo(() => {
    const q = query.toLowerCase().trim()
    return providers
      .filter((p) => p.enabled)
      .map((p) => ({
        provider: p,
        models: p.models.filter(
          (m) =>
            !m.hidden &&
            !m.capabilities.embedding &&
            (!q || `${p.label} ${m.id} ${m.label}`.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.models.length)
  }, [providers, query])

  const compare = conv?.compareModels ?? []
  const inCompare = (p: ProviderConfig, m: ModelInfo) =>
    compare.some((c) => c.providerId === p.id && c.model === m.id)

  const toggleCompare = (p: ProviderConfig, m: ModelInfo) => {
    const next = inCompare(p, m)
      ? compare.filter((c) => !(c.providerId === p.id && c.model === m.id))
      : [...compare, { providerId: p.id, model: m.id }]
    void store.getState().setCompare(next.length > 1 ? next : undefined)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => store.getState().set("modelPickerOpen", v)}>
      <DialogContent
        showCloseButton={false}
        className="panel raised overflow-hidden !p-0 sm:max-w-xl"
        aria-label="Model picker"
      >
        <div className="flex max-h-[min(70vh,40rem)] flex-col">
          <div className="rule-b flex items-center gap-2.5 px-4 py-3">
            <HugeiconsIcon
              icon={SearchIcon}
              className="size-4 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80"
            />
            {compare.length > 1 && (
              <span className="accent-fill rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                comparing {compare.length}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.length === 0 && (
              <div className="space-y-3 p-8 text-center">
                <p className="text-[14px] text-muted-foreground">
                  {providers.length ? "No models match." : "No providers connected yet."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    store.getState().set("modelPickerOpen", false)
                    store.getState().openSettings("providers")
                  }}
                  className="ink-fill inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-semibold"
                >
                  <HugeiconsIcon icon={SettingsIcon} className="size-3.5" strokeWidth={2} />
                  Connect a provider
                </button>
              </div>
            )}

            {groups.map(({ provider, models }) => (
              <div key={provider.id} className="mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <HugeiconsIcon
                    icon={provider.local ? CpuIcon : CloudIcon}
                    className="size-3.5 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span className="text-[13px] font-semibold">{provider.label}</span>
                  <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {provider.local ? "local" : "cloud"}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {models.map((model) => {
                    const active =
                      selection.providerId === provider.id && selection.model === model.id
                    return (
                      <div
                        key={model.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors",
                          active ? "bg-[var(--paper-3)]" : "hover:bg-[var(--paper-3)]/70"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void store.getState().setModel(provider.id, model.id)
                            store.getState().set("modelPickerOpen", false)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-medium">{model.label}</span>
                              {active && (
                                <HugeiconsIcon
                                  icon={CheckIcon}
                                  className="size-3.5 shrink-0 text-[var(--accent-solid)]"
                                  strokeWidth={3}
                                />
                              )}
                            </span>
                            <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                              {model.id}
                            </span>
                          </span>
                          <Caps model={model} />
                        </button>
                        <button
                          type="button"
                          title="Add to comparison"
                          aria-label="Add to comparison"
                          onClick={() => toggleCompare(provider, model)}
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                            inCompare(provider, model)
                              ? "ink-fill"
                              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-[var(--paper-3)]"
                          )}
                        >
                          <HugeiconsIcon icon={LayersIcon} className="size-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rule-t flex items-center justify-between gap-2 px-4 py-2 text-[11.5px] text-muted-foreground">
            <span>pick 2 or more models to answer side by side</span>
            {compare.length > 1 && (
              <button
                type="button"
                onClick={() => void store.getState().setCompare(undefined)}
                className="font-semibold hover:underline"
              >
                clear comparison
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Caps({ model }: { model: ModelInfo }) {
  const caps = model.capabilities
  const items = [
    caps.vision && { icon: EyeIcon, label: "vision" },
    caps.tools && { icon: WrenchIcon, label: "tools" },
    caps.reasoning && { icon: BrainIcon, label: "reasoning" },
    caps.input.includes("pdf") && { icon: FileIcon, label: "documents" },
  ].filter(Boolean) as { icon: typeof EyeIcon; label: string }[]
  return (
    <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
      {items.map((it) => (
        <span key={it.label} title={it.label} className="grid place-items-center">
          <HugeiconsIcon icon={it.icon} className="size-3.5 text-muted-foreground" strokeWidth={2} />
        </span>
      ))}
      <span className="ml-1 w-12 text-right font-mono text-[11px] text-muted-foreground">
        {fmtTokens(caps.contextWindow)}
      </span>
    </span>
  )
}
