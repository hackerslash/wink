import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  AddIcon,
  ArchiveIcon,
  BookIcon,
  BrainIcon,
  ChatIcon,
  CommandIcon,
  DownloadIcon,
  LayersIcon,
  MoonIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from "@/components/icons"
import { useTheme } from "@/components/theme-provider"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { download, exportBackup } from "@/lib/exporting"
import { searchKnowledge, searchMessages, type MessageHit } from "@/lib/search"
import { useStore } from "@/lib/store"
import type { Citation } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Command {
  id: string
  label: string
  hint?: string
  icon: typeof AddIcon
  group: string
  run: () => void
  keywords?: string
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const conversations = useStore((s) => s.conversations)
  const collections = useStore((s) => s.collections)
  const assistants = useStore((s) => s.assistants)
  const settings = useStore((s) => s.settings)
  const store = useStore
  const { theme, setTheme } = useTheme()
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  const [query, setQuery] = React.useState("")
  const [cursor, setCursor] = React.useState(0)
  const [messageHits, setMessageHits] = React.useState<MessageHit[]>([])
  const [knowledgeHits, setKnowledgeHits] = React.useState<Citation[]>([])
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setMessageHits([])
      setKnowledgeHits([])
      setCursor(0)
    }
  }, [open])

  // Debounced deep search across every local message and collection.
  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setMessageHits([])
      setKnowledgeHits([])
      return
    }
    const timer = setTimeout(() => {
      void searchMessages(query, 12).then(setMessageHits)
      void searchKnowledge(
        query,
        settings,
        collections.map((c) => c.id),
        6
      )
        .then(setKnowledgeHits)
        .catch(() => setKnowledgeHits([]))
    }, 190)
    return () => clearTimeout(timer)
  }, [open, query, settings, collections])

  const close = () => store.getState().set("paletteOpen", false)

  const commands = React.useMemo<Command[]>(() => {
    const base: Command[] = [
      {
        id: "new",
        label: "New chat",
        hint: "⌘N",
        icon: AddIcon,
        group: "Actions",
        run: () => void store.getState().newConversation(),
      },
      {
        id: "models",
        label: "Switch model",
        hint: "⌘/",
        icon: SparklesIcon,
        group: "Actions",
        run: () => store.getState().set("modelPickerOpen", true),
      },
      {
        id: "research",
        label: store.getState().mode === "research" ? "Leave research mode" : "Deep research mode",
        icon: SearchIcon,
        group: "Actions",
        run: () =>
          store.getState().set("mode", store.getState().mode === "research" ? "chat" : "research"),
      },
      {
        id: "compare",
        label: "Compare models side by side",
        icon: LayersIcon,
        group: "Actions",
        run: () => store.getState().set("modelPickerOpen", true),
      },
      {
        id: "inspector",
        label: "Toggle inspector",
        hint: "⌘I",
        icon: WrenchIcon,
        group: "View",
        run: () => store.getState().set("inspectorOpen", !store.getState().inspectorOpen),
      },
      {
        id: "sidebar",
        label: "Toggle sidebar",
        hint: "⌘B",
        icon: ArchiveIcon,
        group: "View",
        run: () => store.getState().set("sidebarOpen", !store.getState().sidebarOpen),
      },
      {
        id: "theme",
        label: dark ? "Light theme" : "Dark theme",
        hint: "d",
        icon: dark ? SunIcon : MoonIcon,
        group: "View",
        run: () => setTheme(dark ? "light" : "dark"),
      },
      {
        id: "providers",
        label: "Providers and API keys",
        icon: SettingsIcon,
        group: "Settings",
        run: () => store.getState().openSettings("providers"),
      },
      {
        id: "knowledge",
        label: "Knowledge collections",
        icon: BookIcon,
        group: "Settings",
        run: () => store.getState().openSettings("knowledge"),
      },
      {
        id: "memory",
        label: "Memories",
        icon: BrainIcon,
        group: "Settings",
        run: () => store.getState().openSettings("memory"),
      },
      {
        id: "tools",
        label: "Tools, search and MCP",
        icon: WrenchIcon,
        group: "Settings",
        run: () => store.getState().openSettings("tools"),
      },
      {
        id: "privacy",
        label: "Privacy and local vault",
        icon: ShieldIcon,
        group: "Settings",
        run: () => store.getState().openSettings("privacy"),
      },
      {
        id: "backup",
        label: "Download a full backup",
        icon: DownloadIcon,
        group: "Settings",
        run: () =>
          void exportBackup().then((b) =>
            download(`wink-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b))
          ),
      },
    ]
    for (const a of assistants)
      base.push({
        id: `assistant-${a.id}`,
        label: `Use ${a.name}`,
        hint: a.description,
        icon: SparklesIcon,
        group: "Assistants",
        keywords: a.description,
        run: () => void store.getState().applyAssistant(a.id),
      })
    return base
  }, [assistants, store, dark, setTheme])

  const q = query.toLowerCase().trim()
  const filteredCommands = q
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q))
    : commands
  const chatHits = q
    ? conversations.filter((c) => !c.trashedAt && c.title.toLowerCase().includes(q)).slice(0, 6)
    : conversations.filter((c) => !c.trashedAt && c.pinned).slice(0, 4)

  type Item = { key: string; render: React.ReactNode; run: () => void; group: string }
  const items: Item[] = [
    ...filteredCommands.map((c) => ({
      key: c.id,
      group: c.group,
      run: () => {
        close()
        c.run()
      },
      render: (
        <>
          <HugeiconsIcon
            icon={c.icon}
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1 truncate">{c.label}</span>
          {c.hint && <kbd>{c.hint}</kbd>}
        </>
      ),
    })),
    ...chatHits.map((c) => ({
      key: `conv-${c.id}`,
      group: q ? "Conversations" : "Pinned",
      run: () => {
        close()
        void store.getState().select(c.id)
      },
      render: (
        <>
          <HugeiconsIcon
            icon={c.pinned ? PinIcon : ChatIcon}
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1 truncate">{c.title}</span>
          <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
            {new Date(c.updatedAt).toLocaleDateString()}
          </span>
        </>
      ),
    })),
    ...messageHits.map((h) => ({
      key: `msg-${h.message.id}`,
      group: "In messages",
      run: () => {
        close()
        void store.getState().select(h.message.conversationId)
      },
      render: (
        <>
          <HugeiconsIcon
            icon={ChatIcon}
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">
              {h.conversation?.title ?? "Conversation"}
            </span>
            <span className="block truncate text-[12px] text-muted-foreground">{h.excerpt}</span>
          </span>
        </>
      ),
    })),
    ...knowledgeHits.map((c) => ({
      key: `know-${c.chunkId}`,
      group: "In knowledge",
      run: () => {
        close()
        store.getState().openSettings("knowledge")
      },
      render: (
        <>
          <HugeiconsIcon
            icon={BookIcon}
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{c.title}</span>
            <span className="block truncate text-[12px] text-muted-foreground">{c.snippet}</span>
          </span>
        </>
      ),
    })),
  ]

  React.useEffect(() => setCursor(0), [query, items.length])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, items.length - 1))
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      items[cursor]?.run()
    }
  }

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  let lastGroup = ""

  return (
    <Dialog open={open} onOpenChange={(v) => store.getState().set("paletteOpen", v)}>
      <DialogContent
        showCloseButton={false}
        aria-label="Command palette"
        className="top-[12%] translate-y-0 overflow-hidden !p-0 sm:max-w-xl"
      >
        <div className="flex max-h-[min(70vh,34rem)] flex-col" onKeyDown={onKeyDown}>
          <div className="rule-b flex items-center gap-2.5 px-4 py-3.5">
            <HugeiconsIcon
              icon={CommandIcon}
              className="size-4 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats, messages, knowledge — or run a command"
              className="w-full bg-transparent text-[16px] tracking-[-0.011em] outline-none placeholder:text-muted-foreground/70"
            />
            <kbd>esc</kbd>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
                Nothing found for “{query}”.
              </p>
            )}
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null
              lastGroup = item.group
              return (
                <React.Fragment key={item.key}>
                  {header && (
                    <div className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={item.run}
                    className={cn(
                      "press flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[14px]",
                      cursor === i
                        ? "bg-[var(--paper-2)] shadow-[var(--shadow-1)]"
                        : "hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]"
                    )}
                  >
                    {item.render}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
