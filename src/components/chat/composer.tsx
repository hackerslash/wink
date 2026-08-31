import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  AttachmentIcon,
  BookIcon,
  BrainIcon,
  CloseIcon,
  SearchIcon,
  SendIcon,
  StopIcon,
  WrenchIcon,
} from "@/components/icons"
import { estimateTokens } from "@/lib/chunk"
import { fmtBytes } from "@/lib/defaults"
import { useActiveModel, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export function Composer({ onOpenModels }: { onOpenModels: () => void }) {
  const draft = useStore((s) => s.composerDraft)
  const queue = useStore((s) => s.attachmentQueue)
  const streaming = useStore((s) => s.streamingIds.length > 0)
  const mode = useStore((s) => s.mode)
  const depth = useStore((s) => s.researchDepth)
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const settings = useStore((s) => s.settings)
  const collections = useStore((s) => s.collections)
  const selection = useActiveModel()
  const store = useStore
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const focus = () => inputRef.current?.focus()
    window.addEventListener("wink:focus-composer", focus)
    return () => window.removeEventListener("wink:focus-composer", focus)
  }, [])

  const send = () => {
    if (streaming) return
    void store.getState().send(draft)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const wantsSend =
      settings.sendKey === "enter"
        ? e.key === "Enter" && !e.shiftKey
        : e.key === "Enter" && (e.metaKey || e.ctrlKey)
    if (wantsSend) {
      e.preventDefault()
      send()
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (files.length) {
      e.preventDefault()
      void store.getState().attachFiles(files)
    }
  }

  const params = conv?.params ?? settings.defaultParams
  const tokens = estimateTokens(draft) + queue.reduce((n, a) => n + estimateTokens(a.text ?? ""), 0)
  const activeCollections = collections.filter((c) => params.knowledgeCollections.includes(c.id))

  return (
    <div className="px-3 pb-4 md:px-10 md:pb-6">
      <div className="mx-auto w-full max-w-3xl">
        {queue.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {queue.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] py-1.5 pr-1.5 pl-2.5 text-[12.5px]"
              >
                <span className="max-w-40 truncate font-medium">{att.name}</span>
                <span className="text-muted-foreground">{fmtBytes(att.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${att.name}`}
                  onClick={() => store.getState().removeQueued(att.id)}
                  className="grid size-5 place-items-center rounded-[5px] text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
                >
                  <HugeiconsIcon icon={CloseIcon} className="size-3" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void store.getState().attachFiles([...e.dataTransfer.files])
          }}
          className={cn(
            "relative rounded-xl border bg-[var(--paper-2)] p-1.5 transition-colors",
            dragging ? "border-[var(--accent-solid)]" : "border-border"
          )}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-[var(--paper-2)] text-[14px] font-semibold">
              Drop files to attach
            </div>
          )}

          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(e) => store.getState().set("composerDraft", e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={
              mode === "research"
                ? "Ask a research question — the agent will plan, search and cite…"
                : "Message your model…"
            }
            className="field-sizing-content max-h-[42vh] min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-[16.5px] leading-relaxed outline-none placeholder:text-muted-foreground/80"
          />

          <div className="flex items-center gap-1 px-1 pb-0.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              aria-label="Attach files"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground"
            >
              <HugeiconsIcon icon={AttachmentIcon} className="size-4" strokeWidth={2} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void store.getState().attachFiles([...(e.target.files ?? [])])
                e.target.value = ""
              }}
            />

            <Toggle
              active={mode === "research"}
              icon={SearchIcon}
              label="Deep research"
              onClick={() => store.getState().set("mode", mode === "research" ? "chat" : "research")}
            />
            <Toggle
              active={params.toolsEnabled}
              icon={WrenchIcon}
              label="Tools"
              onClick={() => void store.getState().setParams({ toolsEnabled: !params.toolsEnabled })}
            />
            <Toggle
              active={params.memoryEnabled && settings.memory.enabled}
              icon={BrainIcon}
              label="Memory"
              onClick={() =>
                void store.getState().setParams({ memoryEnabled: !params.memoryEnabled })
              }
            />
            <Toggle
              active={activeCollections.length > 0}
              icon={BookIcon}
              label={
                activeCollections.length
                  ? `Knowledge: ${activeCollections.map((c) => c.name).join(", ")}`
                  : "Knowledge (pick collections in the inspector)"
              }
              onClick={() => store.getState().set("inspectorOpen", true)}
              badge={activeCollections.length || undefined}
            />

            {mode === "research" && (
              <div className="ml-1 flex rounded-md border border-border p-0.5">
                {(["quick", "standard", "deep"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => store.getState().set("researchDepth", d)}
                    className={cn(
                      "rounded-[5px] px-2 py-0.5 text-[12px] font-medium capitalize transition-colors",
                      depth === d
                        ? "bg-[var(--paper-3)] text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            <span className="flex-1" />

            <button
              type="button"
              onClick={onOpenModels}
              className="flex max-w-[14rem] items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[12.5px] text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground"
            >
              <span className="truncate">{selection.model || "Pick a model"}</span>
            </button>

            {settings.showTokenCounts && draft.length > 0 && (
              <span className="mr-1 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                ~{tokens}
              </span>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={() => store.getState().stop()}
                className="ink-fill grid size-9 place-items-center rounded-full transition-opacity hover:opacity-90"
                aria-label="Stop generating"
                title="Stop"
              >
                <HugeiconsIcon icon={StopIcon} className="size-4" strokeWidth={2.5} />
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() && !queue.length}
                aria-label="Send message"
                className="accent-fill grid size-9 place-items-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <HugeiconsIcon icon={SendIcon} className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-3 text-[11.5px] text-muted-foreground">
          <span>
            <kbd>{settings.sendKey === "enter" ? "↵" : "⌘↵"}</kbd> send
          </span>
          <span>
            <kbd>⌘K</kbd> commands
          </span>
          <span>
            <kbd>⌘/</kbd> models
          </span>
          <span className="hidden sm:inline">Stored on this device only</span>
        </div>
      </div>
    </div>
  )
}

function Toggle({
  active,
  icon,
  label,
  onClick,
  badge,
}: {
  active: boolean
  icon: typeof WrenchIcon
  label: string
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative grid size-8 place-items-center rounded-md transition-colors",
        active
          ? "bg-[var(--paper-3)] text-[var(--accent-solid)]"
          : "text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" strokeWidth={2} />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border border-border bg-[var(--paper)] font-mono text-[9.5px] font-bold text-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
