import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Wordmark } from "@/components/fx"
import {
  AddIcon,
  ArchiveIcon,
  BookIcon,
  BrainIcon,
  ChevronDownIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  FolderIcon,
  MoreIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  TagIcon,
} from "@/components/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { storageEstimate } from "@/lib/db"
import { fmtBytes } from "@/lib/defaults"
import { exportConversation } from "@/lib/exporting"
import { useStore } from "@/lib/store"
import type { Conversation } from "@/lib/types"
import { cn } from "@/lib/utils"

const DAY = 86_400_000

function bucketOf(conv: Conversation) {
  const age = Date.now() - conv.updatedAt
  if (age < DAY) return "Today"
  if (age < 2 * DAY) return "Yesterday"
  if (age < 7 * DAY) return "Previous 7 days"
  if (age < 30 * DAY) return "Previous 30 days"
  return new Date(conv.updatedAt).toLocaleString(undefined, { month: "long", year: "numeric" })
}

export function Sidebar() {
  const open = useStore((s) => s.sidebarOpen)
  const conversations = useStore((s) => s.conversations)
  const folders = useStore((s) => s.folders)
  const assistants = useStore((s) => s.assistants)
  const collections = useStore((s) => s.collections)
  const memories = useStore((s) => s.memories)
  const activeId = useStore((s) => s.activeId)
  const search = useStore((s) => s.search)
  const store = useStore
  const [view, setView] = React.useState<"chats" | "archive" | "trash">("chats")
  const [used, setUsed] = React.useState(0)

  React.useEffect(() => {
    void storageEstimate().then((e) => setUsed(e.usage))
  }, [conversations.length, collections.length])

  const q = search.toLowerCase().trim()
  const visible = conversations.filter((c) => {
    if (view === "trash") return Boolean(c.trashedAt)
    if (c.trashedAt) return false
    if (view === "archive") return c.archived
    if (c.archived) return false
    return !q || c.title.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q))
  })

  const pinned = visible.filter((c) => c.pinned)
  const loose = visible.filter((c) => !c.pinned && !c.folderId)
  const byFolder = new Map(
    folders.map((f) => [f.id, visible.filter((c) => c.folderId === f.id && !c.pinned)])
  )

  const buckets = React.useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const conv of loose) {
      const key = bucketOf(conv)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(conv)
    }
    return [...map.entries()]
  }, [loose])

  return (
    <aside
      className={cn(
        "z-30 flex h-full shrink-0 flex-col overflow-hidden bg-[var(--shell)] transition-[width] duration-300",
        open ? "w-[17.5rem]" : "w-0"
      )}
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      <div className="rule-r flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Wordmark />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void store.getState().newConversation()}
            title="New chat (⌘N)"
            aria-label="New chat"
            className="grid size-8 place-items-center rounded-md border border-border bg-[var(--paper-2)] text-foreground transition-colors hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon icon={AddIcon} className="size-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-4 pb-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-2 focus-within:border-[var(--accent-solid)]">
            <HugeiconsIcon
              icon={SearchIcon}
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              value={search}
              onChange={(e) => store.getState().set("search", e.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/80"
            />
            {search && (
              <button
                type="button"
                onClick={() => store.getState().set("search", "")}
                className="text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            )}
          </label>
        </div>

        <nav className="px-4 pb-3">
          <div className="flex rounded-md border border-border bg-[var(--paper-2)] p-0.5">
            {(["chats", "archive", "trash"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "flex-1 rounded-[6px] py-1 text-[12.5px] font-medium capitalize transition-colors",
                  view === v
                    ? "bg-[var(--paper-3)] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-2">
          {pinned.length > 0 && (
            <Group label="Pinned">
              {pinned.map((c) => (
                <ConvRow key={c.id} conv={c} active={c.id === activeId} />
              ))}
            </Group>
          )}

          {view === "chats" &&
            folders.map((folder) => {
              const items = byFolder.get(folder.id) ?? []
              if (!items.length && q) return null
              return (
                <FolderGroup key={folder.id} id={folder.id} name={folder.name} color={folder.color}>
                  {items.map((c) => (
                    <ConvRow key={c.id} conv={c} active={c.id === activeId} />
                  ))}
                </FolderGroup>
              )
            })}

          {buckets.map(([label, items], i) => (
            <Group
              key={label}
              label={label}
              action={
                view === "trash" && i === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Permanently delete ${visible.length} conversation(s)?`))
                        void store.getState().emptyTrash()
                    }}
                    className="flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={DeleteIcon} className="size-3" strokeWidth={2} />
                    Empty
                  </button>
                ) : undefined
              }
            >
              {items.map((c) => (
                <ConvRow key={c.id} conv={c} active={c.id === activeId} />
              ))}
            </Group>
          ))}

          {visible.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {q
                ? "Nothing matches."
                : view === "chats"
                  ? "No chats yet."
                  : view === "trash"
                    ? "Trash is empty."
                    : "Nothing archived."}
            </p>
          )}

        </div>

        <div className="rule-t space-y-0.5 p-2">
          <NavRow
            icon={BookIcon}
            label="Knowledge"
            hint={collections.length ? `${collections.length}` : undefined}
            onClick={() => store.getState().openSettings("knowledge")}
          />
          <NavRow
            icon={BrainIcon}
            label="Memory"
            hint={memories.length ? `${memories.filter((m) => !m.disabled).length}` : undefined}
            onClick={() => store.getState().openSettings("memory")}
          />
          <NavRow
            icon={SparklesIcon}
            label="Assistants"
            hint={`${assistants.length}`}
            onClick={() => store.getState().openSettings("assistants")}
          />
          <NavRow
            icon={FolderIcon}
            label="New folder"
            onClick={() => {
              const name = window.prompt("Folder name")
              if (name) void store.getState().newFolder(name)
            }}
          />
          <NavRow
            icon={SettingsIcon}
            label="Settings"
            onClick={() => store.getState().openSettings("providers")}
          />
          <button
            type="button"
            onClick={() => store.getState().openSettings("privacy")}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--paper-3)]"
          >
            <HugeiconsIcon icon={ShieldIcon} className="size-3.5 shrink-0 text-good" strokeWidth={2} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium">Stored on this device</span>
              <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                {fmtBytes(used)}
              </span>
            </span>
          </button>
        </div>
      </div>
    </aside>
  )
}

function Group({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-[11.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="flex-1" />
        {action}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  )
}

function FolderGroup({
  id,
  name,
  color,
  children,
}: {
  id: string
  name: string
  color: string
  children: React.ReactNode
}) {
  const collapsed = useStore((s) => s.folders.find((f) => f.id === id)?.collapsed)
  const store = useStore
  const count = React.Children.count(children)
  return (
    <div>
      <div className="group flex items-center gap-1.5 px-2 py-1">
        <button
          type="button"
          onClick={() => void store.getState().patchFolder(id, { collapsed: !collapsed })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <HugeiconsIcon
            icon={ChevronDownIcon}
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
            strokeWidth={2.5}
          />
          <span className="size-2 shrink-0 rounded-[3px]" style={{ background: color }} />
          <span className="truncate text-[13px] font-semibold">{name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
        </button>
        <button
          type="button"
          aria-label={`Delete folder ${name}`}
          onClick={() => void store.getState().deleteFolder(id)}
          className="grid size-5 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        >
          <HugeiconsIcon icon={DeleteIcon} className="size-3" strokeWidth={2} />
        </button>
      </div>
      {!collapsed && <div className="space-y-px pl-3">{children}</div>}
    </div>
  )
}

function NavRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof BookIcon
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-[var(--paper-3)]"
    >
      <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" strokeWidth={2} />
      <span className="flex-1 truncate font-medium">{label}</span>
      {hint && <span className="font-mono text-[11.5px] text-muted-foreground">{hint}</span>}
    </button>
  )
}

function ConvRow({ conv, active }: { conv: Conversation; active: boolean }) {
  const folders = useStore((s) => s.folders)
  const store = useStore
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState(conv.title)

  if (renaming)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setRenaming(false)
          if (draft.trim()) void store.getState().patchConversation(conv.id, { title: draft.trim() })
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setDraft(conv.title)
            setRenaming(false)
          }
        }}
        className="w-full rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 text-[13.5px] outline-none"
      />
    )

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
        active ? "bg-[var(--paper-3)]" : "hover:bg-[var(--paper-3)]/70"
      )}
    >
      <button
        type="button"
        onClick={() => void store.getState().select(conv.id)}
        className="min-w-0 flex-1 px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5">
          {conv.pinned && (
            <HugeiconsIcon
              icon={PinIcon}
              className="size-2.5 shrink-0 text-muted-foreground"
              strokeWidth={2.5}
            />
          )}
          <span
            className={cn(
              "truncate text-[13.5px]",
              active ? "font-semibold" : "font-medium",
              conv.title === "New chat" && "text-muted-foreground"
            )}
          >
            {conv.title}
          </span>
        </span>
        {conv.tags.length > 0 && (
          <span className="mt-0.5 flex gap-1">
            {conv.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-[4px] bg-[var(--paper-3)] px-1 text-[10.5px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </span>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${conv.title}`}
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 aria-expanded:opacity-100 hover:bg-[var(--paper-2)]"
            >
              <HugeiconsIcon icon={MoreIcon} className="size-3.5" strokeWidth={2} />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() =>
              void store.getState().patchConversation(conv.id, { pinned: !conv.pinned })
            }
          >
            <HugeiconsIcon icon={PinIcon} strokeWidth={2} />
            {conv.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <HugeiconsIcon icon={EditIcon} strokeWidth={2} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void store.getState().duplicate(conv.id)}>
            <HugeiconsIcon icon={CopyIcon} strokeWidth={2} />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={FolderIcon} strokeWidth={2} />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem
                onClick={() => void store.getState().patchConversation(conv.id, { folderId: null })}
              >
                No folder
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() =>
                    void store.getState().patchConversation(conv.id, { folderId: f.id })
                  }
                >
                  <span className="size-2 rounded-[3px]" style={{ background: f.color }} />
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() => {
              const tag = window.prompt("Add tag")
              if (tag)
                void store
                  .getState()
                  .patchConversation(conv.id, { tags: [...new Set([...conv.tags, tag.trim()])] })
            }}
          >
            <HugeiconsIcon icon={TagIcon} strokeWidth={2} />
            Add tag
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={DownloadIcon} strokeWidth={2} />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem onClick={() => void exportConversation(conv.id, "md")}>
                Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportConversation(conv.id, "json")}>
                JSON
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() =>
              void store.getState().patchConversation(conv.id, { archived: !conv.archived })
            }
          >
            <HugeiconsIcon icon={ArchiveIcon} strokeWidth={2} />
            {conv.archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {conv.trashedAt ? (
            <>
              <DropdownMenuItem onClick={() => void store.getState().restore(conv.id)}>
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void store.getState().purge(conv.id)}
              >
                <HugeiconsIcon icon={DeleteIcon} strokeWidth={2} />
                Delete forever
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void store.getState().trash(conv.id)}
            >
              <HugeiconsIcon icon={DeleteIcon} strokeWidth={2} />
              Move to trash
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
