import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  BookIcon,
  CalculatorIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  CodeIcon,
  LinkIcon,
  PlugIcon,
  SearchIcon,
  WrenchIcon,
} from "@/components/icons"
import type { ToolCall } from "@/lib/types"
import { cn } from "@/lib/utils"

const ICONS: Record<string, typeof WrenchIcon> = {
  web_search: SearchIcon,
  fetch_url: LinkIcon,
  search_knowledge: BookIcon,
  calculator: CalculatorIcon,
  run_javascript: CodeIcon,
  current_time: ClockIcon,
}

const STATUS: Record<ToolCall["status"], { label: string; className: string }> = {
  pending: { label: "queued", className: "text-muted-foreground" },
  "awaiting-permission": { label: "needs permission", className: "text-warn" },
  running: { label: "running", className: "text-info" },
  done: { label: "done", className: "text-good" },
  error: { label: "failed", className: "text-destructive" },
  denied: { label: "denied", className: "text-muted-foreground" },
}

export function ToolCard({ call, onRetry }: { call: ToolCall; onRetry?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const icon = ICONS[call.name] ?? PlugIcon
  const status = STATUS[call.status]
  const busy = call.status === "running" || call.status === "pending"
  const duration = call.endedAt && call.startedAt ? call.endedAt - call.startedAt : undefined

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border bg-[var(--paper-2)]",
        call.status === "error" ? "border-destructive/40" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--paper-3)]"
      >
        <HugeiconsIcon
          icon={icon}
          className={cn(
            "size-4 shrink-0",
            busy && "animate-[pulse-soft_1.2s_infinite]",
            call.status === "error" ? "text-destructive" : "text-muted-foreground"
          )}
          strokeWidth={2}
        />
        <span className="font-mono font-medium">{call.name}</span>
        <span className={cn("text-[12px]", status.className)}>{status.label}</span>
        {duration !== undefined && (
          <span className="font-mono text-[11.5px] text-muted-foreground">{duration}ms</span>
        )}
        <span className="flex-1" />
        {call.status === "error" && onRetry && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[var(--accent-solid)] hover:bg-[var(--accent-soft)]"
          >
            retry
          </span>
        )}
        <HugeiconsIcon
          icon={ChevronDownIcon}
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="rule-t space-y-2 px-3 py-2.5 text-[13px]">
          <Section label="Input">
            <pre className="max-h-40 overflow-auto font-mono text-[12.5px] whitespace-pre-wrap">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </Section>
          {(call.result || call.error) && (
            <Section label={call.error ? "Error" : "Output"}>
              <pre
                className={cn(
                  "max-h-64 overflow-auto font-mono text-[12.5px] whitespace-pre-wrap",
                  call.error && "text-destructive"
                )}
              >
                {call.error ?? String(call.result).slice(0, 8000)}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[11.5px] tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="rounded-md border border-border bg-[var(--paper-3)] p-2">{children}</div>
    </div>
  )
}

export function PermissionPrompt({
  toolTitle,
  description,
  args,
  onDecide,
}: {
  toolTitle: string
  description: string
  args: unknown
  onDecide: (allow: boolean, remember: boolean) => void
}) {
  const [remember, setRemember] = React.useState(false)
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-[16px] font-semibold">{toolTitle} wants to run</div>
        <p className="text-[13.5px] text-muted-foreground">{description}</p>
      </div>
      <pre className="max-h-40 overflow-auto rounded-md border border-border bg-[var(--paper-3)] p-3 font-mono text-[12.5px] whitespace-pre-wrap">
        {JSON.stringify(args, null, 2)}
      </pre>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-3.5"
          style={{ accentColor: "var(--accent-solid)" }}
        />
        Remember this choice for {toolTitle.toLowerCase()}
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onDecide(false, remember)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-[var(--paper-3)]"
        >
          <HugeiconsIcon icon={CloseIcon} className="size-3.5" strokeWidth={2} />
          Deny
        </button>
        <button
          type="button"
          onClick={() => onDecide(true, remember)}
          className="ink-fill flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90"
        >
          <HugeiconsIcon icon={CheckIcon} className="size-3.5" strokeWidth={2.5} />
          Allow
        </button>
      </div>
    </div>
  )
}
