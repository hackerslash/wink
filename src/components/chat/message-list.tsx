import * as React from "react"

import { MessageView } from "@/components/chat/message"
import type { Artifact } from "@/lib/markdown"
import { pathToHead } from "@/lib/prompt"
import type { Citation, Conversation, Message } from "@/lib/types"

type Row = { key: string; lanes: Message[] }

/** One row per turn; compare runs put their lanes side by side in one row. */
function buildRows(all: Message[], conv: Conversation): Row[] {
  const path = pathToHead(all, conv.headId)
  const rows: Row[] = []
  const consumed = new Set<string>()
  for (const msg of path) {
    if (consumed.has(msg.id)) continue
    if (msg.role === "assistant" && msg.laneId) {
      const lanes = all
        .filter((m) => m.parentId === msg.parentId && m.laneId)
        .sort((a, b) => a.createdAt - b.createdAt)
      for (const lane of lanes) consumed.add(lane.id)
      rows.push({ key: `lanes-${msg.parentId}`, lanes })
      continue
    }
    rows.push({ key: msg.id, lanes: [msg] })
  }
  return rows
}

interface Props {
  conversation: Conversation
  messages: Message[]
  streamingIds: string[]
  onArtifact: (a: Artifact) => void
  onCitation: (c: Citation) => void
}

export function MessageList({
  conversation,
  messages,
  streamingIds,
  onArtifact,
  onCitation,
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const autoScrolling = React.useRef(false)
  const [pinned, setPinned] = React.useState(true)
  const rows = React.useMemo(() => buildRows(messages, conversation), [messages, conversation])
  const streaming = streamingIds.length > 0

  // Follow the newest token for a few frames — lazily-rendered rows change the
  // scroll height after the first assignment.
  React.useEffect(() => {
    if (!pinned) return
    let frames = 0
    autoScrolling.current = true
    let raf = requestAnimationFrame(function step() {
      const el = scrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      if (++frames < 6) raf = requestAnimationFrame(step)
      else autoScrolling.current = false
    })
    return () => {
      cancelAnimationFrame(raf)
      autoScrolling.current = false
    }
  }, [rows, pinned, messages])

  const onScroll = React.useCallback(() => {
    const el = scrollRef.current
    // Ignore the scroll events our own auto-follow loop generates.
    if (!el || autoScrolling.current) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }, [])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-x-hidden overflow-y-auto scroll-pt-[5.5rem] scroll-pb-[var(--composer-h,9rem)] px-4 pt-[5.5rem] pb-[var(--composer-h,9rem)] md:px-10"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          {rows.map((row) => (
            <div
              key={row.key}
              // Offscreen turns skip layout and paint, which keeps very long
              // histories smooth without virtualisation's scroll maths.
              // ponytail: DOM nodes still exist; virtualise only if a single
              // thread grows past a few thousand turns.
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
            >
              <RowView
                row={row}
                messages={messages}
                streamingIds={streamingIds}
                onArtifact={onArtifact}
                onCitation={onCitation}
              />
            </div>
          ))}
          <div className="h-8 shrink-0" />
        </div>
      </div>

      {!pinned && (
        <button
          type="button"
          onClick={() => {
            setPinned(true)
            const el = scrollRef.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
          }}
          className="glass-overlay press press-active absolute bottom-[calc(var(--composer-h,9rem)+0.75rem)] left-1/2 z-10 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[13px] font-medium animate-[pop_0.24s_var(--ease-arrive)_both]"
        >
          {streaming ? "Jump to live ↓" : "Jump to latest ↓"}
        </button>
      )}
    </div>
  )
}

function RowView({
  row,
  messages,
  streamingIds,
  onArtifact,
  onCitation,
}: {
  row: Row
  messages: Message[]
  streamingIds: string[]
  onArtifact: (a: Artifact) => void
  onCitation: (c: Citation) => void
}) {
  if (row.lanes.length === 1) {
    const msg = row.lanes[0]
    return (
      <MessageView
        message={msg}
        all={messages}
        streaming={streamingIds.includes(msg.id)}
        onArtifact={onArtifact}
        onCitation={onCitation}
      />
    )
  }
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(row.lanes.length, 3)}, minmax(0, 1fr))` }}
    >
      {row.lanes.map((msg) => (
        <div key={msg.id} className="panel min-w-0 rounded-[16px] p-3.5">
          <div className="rule-b mb-2 flex items-center gap-1.5 pb-2">
            <span
              className="size-[6px] rounded-[2px]"
              style={{ background: "var(--accent-solid)" }}
              aria-hidden
            />
            <span className="truncate font-mono text-[12px] font-medium">{msg.model}</span>
            {msg.usage?.ms ? (
              <span className="ml-auto font-mono text-[12px] text-muted-foreground">
                {(msg.usage.ms / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
          <MessageView
            message={msg}
            all={messages}
            streaming={streamingIds.includes(msg.id)}
            onArtifact={onArtifact}
            onCitation={onCitation}
            compact
          />
        </div>
      ))}
    </div>
  )
}
