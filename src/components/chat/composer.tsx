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
    <div className="glass-bar rule-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-10 md:pt-3 md:pb-4">
      <div className="mx-auto w-full max-w-3xl">
        {queue.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {queue.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-[10px] border border-hairline bg-[var(--paper-2)] py-1.5 pr-1.5 pl-2.5 text-[13px] shadow-[var(--shadow-1)] animate-[pop_0.2s_var(--ease-arrive)_both]"
              >
                <span className="max-w-40 truncate font-medium">{att.name}</span>
                <span className="text-muted-foreground">{fmtBytes(att.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${att.name}`}
                  onClick={() => store.getState().removeQueued(att.id)}
                  className="press grid size-5 place-items-center rounded-[6px] text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
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
            "relative rounded-[20px] border bg-[var(--paper-2)] p-1.5 shadow-[var(--shadow-1),inset_0_1px_0_var(--edge-inner)] transition-[border-color,box-shadow] duration-[var(--dur-state)] ease-[var(--ease-out)] focus-within:border-[color-mix(in_oklab,var(--foreground)_22%,transparent)] focus-within:shadow-[var(--shadow-2),inset_0_1px_0_var(--edge-inner)]",
            dragging ? "border-[var(--accent-solid)]" : "border-hairline"
          )}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[20px] bg-[var(--paper-2)] text-[14px] font-semibold animate-[fade-in_0.14s_var(--ease-out)_both]">
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
            className="field-sizing-content max-h-[42vh] min-h-11 w-full resize-none bg-transparent px-3.5 py-2.5 text-[17px] leading-relaxed tracking-[-0.011em] outline-none placeholder:text-muted-foreground/70"
          />

          <div className="flex items-center gap-1 px-1 pb-0.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              aria-label="Attach files"
              className="press press-active grid size-8 place-items-center rounded-[9px] text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
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
              <div className="ml-1 flex rounded-[10px] border border-hairline bg-[var(--paper-3)] p-0.5">
                {(["quick", "standard", "deep"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => store.getState().set("researchDepth", d)}
                    className={cn(
                      "press rounded-[7px] px-2 py-0.5 text-[12px] font-medium capitalize",
                      depth === d
                        ? "bg-[var(--paper-2)] text-foreground shadow-[var(--shadow-1)]"
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
              className="press flex max-w-[14rem] items-center gap-1.5 rounded-[9px] px-2.5 py-1 font-mono text-[13px] text-muted-foreground hover:bg-[var(--paper-3)] hover:text-foreground"
            >
              <span className="truncate">{selection.model || "Pick a model"}</span>
            </button>

            {settings.showTokenCounts && draft.length > 0 && (
              <span className="mr-1 font-mono text-[12px] text-muted-foreground tabular-nums">
                ~{tokens}
              </span>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={() => store.getState().stop()}
                className="ink-fill press press-active grid size-9 place-items-center rounded-full shadow-[var(--shadow-1)] hover:opacity-90"
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
                className="accent-fill press press-active grid size-9 place-items-center rounded-full shadow-[var(--shadow-1)] hover:opacity-90 disabled:scale-100 disabled:opacity-25 disabled:shadow-none"
              >
                <HugeiconsIcon icon={SendIcon} className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-3 text-[12px] text-muted-foreground">
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
        "press press-active relative grid size-8 place-items-center rounded-[9px]",
        active
          ? "bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] text-foreground"
          : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] hover:text-foreground"
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" strokeWidth={2} />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border border-hairline bg-[var(--paper-2)] font-mono text-[10px] font-bold text-foreground shadow-[var(--shadow-1)]">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
