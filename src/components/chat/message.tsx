import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  AlertIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  FileIcon,
  GitBranchIcon,
  PdfIcon,
  RefreshIcon,
} from "@/components/icons"
import { MarkdownView } from "@/components/markdown-view"
import { ResearchView } from "@/components/chat/research-view"
import { ToolCard } from "@/components/chat/tool-card"
import { estimateTokens } from "@/lib/chunk"
import { attachments as attachmentStore } from "@/lib/db"
import { fmtCost, fmtTokens } from "@/lib/defaults"
import type { Artifact } from "@/lib/markdown"
import { extractThink, stripThinkTags } from "@/lib/markdown"
import { siblingsOf } from "@/lib/prompt"
import { useStore } from "@/lib/store"
import type { Attachment, Citation, Message } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  message: Message
  all: Message[]
  streaming: boolean
  onArtifact: (a: Artifact) => void
  onCitation: (c: Citation) => void
  compact?: boolean
}

export const MessageView = React.memo(function MessageView({
  message,
  all,
  streaming,
  onArtifact,
  onCitation,
  compact,
}: Props) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(message.content)
  const [copied, setCopied] = React.useState(false)
  const showCounts = useStore((s) => s.settings.showTokenCounts)
  const showRate = useStore((s) => s.settings.showTokenRate)
  const store = useStore
  const isUser = message.role === "user"

  const siblings = React.useMemo(() => siblingsOf(all, message), [all, message])
  const branchIndex = siblings.findIndex((m) => m.id === message.id)

  const inlineThink = React.useMemo(() => extractThink(message.content), [message.content])
  const body = React.useMemo(
    () => (inlineThink ? stripThinkTags(message.content) : message.content),
    [inlineThink, message.content]
  )
  const reasoning = message.reasoning ?? inlineThink

  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!streaming || !showRate) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [streaming, showRate])

  const rate = React.useMemo(() => {
    if (!showRate) return null
    if (streaming) {
      const seconds = (now - message.createdAt) / 1000
      const produced = estimateTokens(body) + estimateTokens(reasoning ?? "")
      return seconds > 0.4 ? Math.round(produced / seconds) : null
    }
    if (!message.usage?.ms || !message.usage.out) return null
    return Math.round(message.usage.out / (message.usage.ms / 1000))
  }, [showRate, streaming, now, message.createdAt, message.usage, body, reasoning])

  const copy = () => {
    void navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }

  if (editing) {
    return (
      <div className={cn("group relative", isUser && "flex justify-end")}>
        <div className="panel w-full max-w-[min(100%,52rem)] space-y-2 rounded-xl p-3">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false)
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                setEditing(false)
                void store.getState().editMessage(message.id, draft)
              }
            }}
            className="field-sizing-content max-h-[50vh] min-h-24 w-full resize-none bg-transparent text-[16.5px] leading-relaxed outline-none"
          />
          <div className="flex items-center justify-end gap-2 text-[13px]">
            <span className="mr-auto text-muted-foreground">
              {isUser ? "Editing forks the conversation" : "Editing rewrites this message"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-3 py-1.5 font-medium text-muted-foreground hover:bg-[var(--paper-3)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                void store.getState().editMessage(message.id, draft)
              }}
              className="ink-fill rounded-full px-3.5 py-1.5 font-semibold"
            >
              {isUser ? "Send fork" : "Save"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group relative animate-[fade-in_0.16s_var(--ease-out)_both]",
        isUser ? "flex justify-end" : "flex flex-col"
      )}
      data-message-id={message.id}
    >
      <div className={cn("min-w-0", isUser ? "max-w-[min(100%,44rem)]" : "w-full")}>
        {!isUser && !compact && (
          <div className="mb-2 flex items-center gap-2">
            <span
              className="size-[7px] rounded-[2px]"
              style={{ background: "var(--accent-solid)" }}
              aria-hidden
            />
            <span className="font-mono text-[12px] font-medium text-muted-foreground">
              {message.model ?? "assistant"}
            </span>
            {message.usage?.ms ? (
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {(message.usage.ms / 1000).toFixed(1)}s
              </span>
            ) : null}
            {rate !== null && (
              <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {rate} tok/s
              </span>
            )}
          </div>
        )}

        {message.research && <ResearchView run={message.research} />}

        {reasoning && <Reasoning text={reasoning} streaming={streaming && !body} />}

        {message.attachments?.length ? (
          <div className={cn("mb-2 flex flex-wrap gap-2", isUser && "justify-end")}>
            {message.attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}

        {(message.toolCalls ?? []).map((call, i) => (
          <ToolCard
            key={`${call.id}-${i}`}
            call={call}
            onRetry={() => void store.getState().regenerate(message.id)}
          />
        ))}

        {isUser ? (
          <div className="rounded-xl border border-border bg-[var(--paper-3)] px-4 py-2.5 text-[16.5px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        ) : body ? (
          <MarkdownView
            content={body}
            citations={message.citations}
            streaming={streaming}
            onArtifact={onArtifact}
            onCitation={onCitation}
          />
        ) : streaming ? (
          <ThinkingDots />
        ) : null}

        {message.error && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-[13px] text-destructive">
            <HugeiconsIcon icon={AlertIcon} className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0 flex-1 break-words">{message.error}</span>
            <button
              type="button"
              onClick={() => void store.getState().regenerate(message.id)}
              className="shrink-0 font-semibold hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {message.citations?.length ? (
          <CitationStrip citations={message.citations} onCitation={onCitation} />
        ) : null}

        <div
          className={cn(
            "mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
            isUser && "justify-end"
          )}
        >
          {siblings.length > 1 && (
            <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border px-1 py-0.5">
              <button
                type="button"
                aria-label="Previous version"
                disabled={branchIndex <= 0}
                onClick={() => void store.getState().switchBranch(siblings[branchIndex - 1].id)}
                className="grid size-5 place-items-center rounded-[5px] hover:bg-[var(--paper-3)] disabled:opacity-30"
              >
                <HugeiconsIcon icon={ChevronLeftIcon} className="size-3" strokeWidth={2.5} />
              </button>
              <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {branchIndex + 1}/{siblings.length}
              </span>
              <button
                type="button"
                aria-label="Next version"
                disabled={branchIndex >= siblings.length - 1}
                onClick={() => void store.getState().switchBranch(siblings[branchIndex + 1].id)}
                className="grid size-5 place-items-center rounded-[5px] hover:bg-[var(--paper-3)] disabled:opacity-30"
              >
                <HugeiconsIcon icon={ChevronRightIcon} className="size-3" strokeWidth={2.5} />
              </button>
            </div>
          )}
          <Action label={copied ? "Copied" : "Copy"} icon={CopyIcon} onClick={copy} />
          <Action
            label="Edit"
            icon={EditIcon}
            onClick={() => {
              setDraft(message.content)
              setEditing(true)
            }}
          />
          {!isUser && (
            <Action
              label="Regenerate"
              icon={RefreshIcon}
              onClick={() => void store.getState().regenerate(message.id)}
            />
          )}
          {!isUser && (
            <Action
              label="Continue from here"
              icon={GitBranchIcon}
              onClick={() =>
                void store
                  .getState()
                  .patchConversation(message.conversationId, { headId: message.id })
              }
            />
          )}
          <Action
            label="Delete"
            icon={DeleteIcon}
            danger
            onClick={() => void store.getState().deleteMessage(message.id)}
          />
          {message.usage && showCounts && (
            <span className="ml-1 font-mono text-[11.5px] text-muted-foreground">
              {fmtTokens(message.usage.in)}↑ {fmtTokens(message.usage.out)}↓
              {message.usage.cost != null ? ` ${fmtCost(message.usage.cost)}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

function Action({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string
  icon: typeof CopyIcon
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground",
        danger && "hover:bg-destructive/10 hover:text-destructive"
      )}
    >
      <HugeiconsIcon icon={icon} className="size-3.5" strokeWidth={2} />
    </button>
  )
}

function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border bg-[var(--paper-2)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--paper-3)]"
      >
        <HugeiconsIcon
          icon={BrainIcon}
          className={cn("size-4 text-muted-foreground", streaming && "animate-[pulse-soft_1.4s_infinite]")}
          strokeWidth={2}
        />
        <span className="text-[13px] font-medium">{streaming ? "Thinking…" : "Reasoning"}</span>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {text.length.toLocaleString()} chars
        </span>
        <span className="flex-1" />
        <HugeiconsIcon
          icon={ChevronDownIcon}
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="rule-t max-h-72 overflow-auto px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full"
          style={{
            background: "var(--accent-solid)",
            animation: `pulse-soft 1.1s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

function CitationStrip({
  citations,
  onCitation,
}: {
  citations: Citation[]
  onCitation: (c: Citation) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <button
          key={`${c.n}-${c.url ?? c.chunkId}`}
          type="button"
          onClick={() => onCitation(c)}
          className="flex max-w-[16rem] items-center gap-1.5 rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1 text-[12.5px] transition-colors hover:bg-[var(--paper-3)]"
        >
          <span className="font-mono text-[11.5px] text-[var(--accent-solid)]">{c.n}</span>
          <span className="truncate">{c.title}</span>
        </button>
      ))}
    </div>
  )
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (attachment.kind !== "image") return
    let objectUrl: string | null = null
    void attachmentStore.get(attachment.blobKey).then((blob) => {
      if (!blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment])

  if (attachment.kind === "image")
    return url ? (
      <img
        src={url}
        alt={attachment.name}
        className="max-h-56 rounded-lg border border-border object-cover"
      />
    ) : (
      <div className="size-24 animate-pulse rounded-lg bg-[var(--paper-3)]" />
    )

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-2.5 py-1.5 text-[12.5px]">
      <HugeiconsIcon
        icon={attachment.kind === "pdf" ? PdfIcon : FileIcon}
        className="size-3.5 text-muted-foreground"
        strokeWidth={2}
      />
      <span className="max-w-40 truncate font-medium">{attachment.name}</span>
      {attachment.text && (
        <span className="text-muted-foreground">{Math.round(attachment.text.length / 1000)}k</span>
      )}
    </div>
  )
}
