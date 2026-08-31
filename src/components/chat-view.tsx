import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { ArtifactViewer } from "@/components/chat/artifact-viewer"
import { Composer } from "@/components/chat/composer"
import { MessageList } from "@/components/chat/message-list"
import {
  ChevronDownIcon,
  CloudIcon,
  CommandIcon,
  CpuIcon,
  MenuIcon,
  PanelRightIcon,
  SearchIcon,
} from "@/components/icons"
import { Landing } from "@/components/landing"
import { fmtCost, fmtTokens } from "@/lib/defaults"
import type { Artifact } from "@/lib/markdown"
import { useActiveModel, useStore } from "@/lib/store"
import type { Citation } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ChatView() {
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const messages = useStore((s) => s.messages)
  const streamingIds = useStore((s) => s.streamingIds)
  const store = useStore
  const [artifact, setArtifact] = React.useState<Artifact | null>(null)

  const onCitation = React.useCallback(
    (cite: Citation) => {
      if (!cite.url) store.getState().set("inspectorOpen", true)
    },
    [store]
  )

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--paper)]">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!conv || messages.length === 0 ? (
            <Landing />
          ) : (
            <MessageList
              conversation={conv}
              messages={messages}
              streamingIds={streamingIds}
              onArtifact={setArtifact}
              onCitation={onCitation}
            />
          )}
          <Composer onOpenModels={() => store.getState().set("modelPickerOpen", true)} />
        </div>
        {artifact && (
          <div className="hidden w-[min(38%,32rem)] shrink-0 border-l border-border p-3 xl:block">
            <ArtifactViewer artifact={artifact} onClose={() => setArtifact(null)} />
          </div>
        )}
      </div>
    </main>
  )
}

function Header() {
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const providers = useStore((s) => s.providers)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const inspectorOpen = useStore((s) => s.inspectorOpen)
  const mode = useStore((s) => s.mode)
  const settings = useStore((s) => s.settings)
  const selection = useActiveModel()
  const store = useStore
  const provider = providers.find((p) => p.id === selection.providerId)

  return (
    <header className="rule-b flex h-14 shrink-0 items-center gap-2 px-3 md:px-4">
      <button
        type="button"
        aria-label="Toggle sidebar"
        title="Toggle sidebar (⌘B)"
        onClick={() => store.getState().set("sidebarOpen", !sidebarOpen)}
        className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-[var(--paper-2)] text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground"
      >
        <HugeiconsIcon icon={MenuIcon} className="size-4" strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={() => store.getState().set("modelPickerOpen", true)}
        className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 transition-colors hover:bg-[var(--paper-3)]"
      >
        {provider && (
          <HugeiconsIcon
            icon={provider.local ? CpuIcon : CloudIcon}
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
        )}
        <span className="min-w-0 text-left">
          <span className="block truncate font-mono text-[13px] font-medium">
            {selection.model || "Choose a model"}
          </span>
          {conv?.compareModels?.length ? (
            <span className="block text-[11.5px] text-[var(--accent-solid)]">
              comparing {conv.compareModels.length} models
            </span>
          ) : (
            provider && (
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {provider.label}
              </span>
            )
          )}
        </span>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={2.5}
        />
      </button>

      {mode === "research" && (
        <span className="accent-fill flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold tracking-wide">
          <HugeiconsIcon icon={SearchIcon} className="size-3" strokeWidth={2.5} />
          RESEARCH
        </span>
      )}

      <div className="min-w-0 flex-1 px-2">
        {conv && (
          <input
            value={conv.title}
            onChange={(e) =>
              void store.getState().patchConversation(conv.id, { title: e.target.value })
            }
            className="w-full truncate rounded-md bg-transparent px-2 py-1 text-center text-[14px] font-medium text-muted-foreground outline-none transition-colors hover:bg-[var(--paper-3)] hover:text-foreground focus:bg-[var(--paper-3)] focus:text-foreground"
            aria-label="Conversation title"
          />
        )}
      </div>

      {conv && settings.showTokenCounts && (conv.tokenTotal ?? 0) > 0 && (
        <span className="hidden shrink-0 font-mono text-[11.5px] text-muted-foreground sm:block">
          {fmtTokens(conv.tokenTotal ?? 0)} tok
          {conv.costTotal ? ` · ${fmtCost(conv.costTotal)}` : ""}
        </span>
      )}

      <button
        type="button"
        aria-label="Command palette"
        title="Commands (⌘K)"
        onClick={() => store.getState().set("paletteOpen", true)}
        className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-[var(--paper-2)] text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground"
      >
        <HugeiconsIcon icon={CommandIcon} className="size-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Toggle inspector"
        title="Inspector (⌘I)"
        onClick={() => store.getState().set("inspectorOpen", !inspectorOpen)}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border border-border transition-colors",
          inspectorOpen
            ? "bg-[var(--paper-3)] text-foreground"
            : "bg-[var(--paper-2)] text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
        )}
      >
        <HugeiconsIcon icon={PanelRightIcon} className="size-4" strokeWidth={2} />
      </button>
    </header>
  )
}
