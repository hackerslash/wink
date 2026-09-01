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
      if (cite.url) {
        window.open(cite.url, "_blank", "noreferrer,noopener")
        return
      }
      store.getState().set("inspectorTab", "sources")
      store.getState().set("inspectorOpen", true)
    },
    [store]
  )

  // The composer floats over the transcript and grows with the textarea and
  // attachment chips, so the scroller reserves its measured height.
  const sheetRef = React.useRef<HTMLElement>(null)
  const composerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const bar = composerRef.current
    const sheet = sheetRef.current
    if (!bar || !sheet) return
    const observer = new ResizeObserver(([entry]) => {
      sheet.style.setProperty("--composer-h", `${Math.round(entry.contentRect.height)}px`)
    })
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  return (
    <main
      ref={sheetRef}
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--paper)] md:my-2.5 md:mr-2.5 md:ml-2.5 md:rounded-[18px] md:border md:border-hairline md:shadow-[var(--shadow-2)]"
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />

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

        <div ref={composerRef} className="absolute inset-x-0 bottom-0 z-20">
          <Composer onOpenModels={() => store.getState().set("modelPickerOpen", true)} />
        </div>
      </div>

      {artifact && (
        <div className="rule-l hidden w-[min(38%,32rem)] shrink-0 p-3 xl:block">
          <ArtifactViewer artifact={artifact} onClose={() => setArtifact(null)} />
        </div>
      )}
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
  const compare = conv?.compareModels ?? []

  return (
    <header className="glass-bar rule-b absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-2 px-3 md:px-4">
      <button
        type="button"
        aria-label="Toggle sidebar"
        title="Toggle sidebar (⌘B)"
        onClick={() => store.getState().set("sidebarOpen", !sidebarOpen)}
        className="press press-active grid size-8 shrink-0 place-items-center rounded-[9px] text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] hover:text-foreground"
      >
        <HugeiconsIcon icon={MenuIcon} className="size-4" strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={() => store.getState().set("modelPickerOpen", true)}
        className="press press-active flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-hairline bg-[var(--paper-2)] px-2.5 shadow-[var(--shadow-1),inset_0_1px_0_var(--edge-inner)] hover:bg-[var(--paper-3)]"
      >
        {provider && (
          <HugeiconsIcon
            icon={provider.local ? CpuIcon : CloudIcon}
            className={cn("size-3.5 shrink-0", provider.local ? "text-local" : "text-cloud")}
            strokeWidth={2}
          />
        )}
        <span className="min-w-0 text-left leading-tight">
          <span className="block truncate font-mono text-[13px] font-medium">
            {selection.model || "Choose a model"}
          </span>
          {compare.length > 1 ? (
            <span className="block text-[11px] text-[var(--accent-solid)]">
              comparing {compare.length} models
            </span>
          ) : (
            provider && (
              <span className="block truncate text-[11px] text-muted-foreground">
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
        <span className="accent-fill flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] animate-[pop_0.24s_var(--ease-arrive)_both]">
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
            className="press w-full truncate rounded-[9px] bg-transparent px-2 py-1 text-center text-[14px] font-medium text-muted-foreground outline-none hover:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] hover:text-foreground focus:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] focus:text-foreground"
            aria-label="Conversation title"
          />
        )}
      </div>

      {conv && settings.showTokenCounts && (conv.tokenTotal ?? 0) > 0 && (
        <span className="hidden shrink-0 font-mono text-[12px] text-muted-foreground sm:block">
          {fmtTokens(conv.tokenTotal ?? 0)} tok
          {conv.costTotal ? ` · ${fmtCost(conv.costTotal)}` : ""}
        </span>
      )}

      <button
        type="button"
        aria-label="Command palette"
        title="Commands (⌘K)"
        onClick={() => store.getState().set("paletteOpen", true)}
        className="press press-active grid size-8 shrink-0 place-items-center rounded-[9px] text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] hover:text-foreground"
      >
        <HugeiconsIcon icon={CommandIcon} className="size-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Toggle inspector"
        title="Inspector (⌘I)"
        onClick={() => store.getState().set("inspectorOpen", !inspectorOpen)}
        className={cn(
          "press press-active grid size-8 shrink-0 place-items-center rounded-[9px]",
          inspectorOpen
            ? "bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] text-foreground"
            : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] hover:text-foreground"
        )}
      >
        <HugeiconsIcon icon={PanelRightIcon} className="size-4" strokeWidth={2} />
      </button>
    </header>
  )
}
