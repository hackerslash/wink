import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { BookIcon, ChevronDownIcon, IdeaIcon, LinkIcon, SearchIcon, SparklesIcon,
} from "@/components/icons"
import type { ResearchRun, ResearchStep } from "@/lib/types"
import { cn } from "@/lib/utils"
const STEP_ICON = { plan: IdeaIcon, search: SearchIcon, read: LinkIcon, reflect: BookIcon, synthesize: SparklesIcon,
} as const
export function ResearchView({ run }: { run: ResearchRun }) { const [open, setOpen] = React.useState(run.status === "running")
  const running = run.status === "running"
const done = run.steps.filter((s) => s.status !== "running").length

  return (
    <div className="panel-2 mb-4 overflow-hidden rounded-lg">
      <button
        type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
      >
        <span
          className={cn(
            "accent-fill grid size-7 shrink-0 place-items-center rounded-xl text-white ",
            running && "animate-pulse-soft"
          )}
        >
          <HugeiconsIcon icon={SearchIcon} className="size-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {running ? "Researching" : run.status === "cancelled" ? "Research stopped" : "Research complete"}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {done}/{run.steps.length} steps · {run.sources.length} sources
            {run.endedAt && ` · ${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s`}
          </span>
        </span>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          className={cn("size-4 text-muted-foreground ", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="space-y-1 border-t border-border/50 p-2">
          {run.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
          {run.sources.length > 0 && (
            <div className="pt-2">
              <div className="px-2 pb-1 font-mono text-[11.5px] tracking-wider text-muted-foreground uppercase">
                Sources
              </div>
              <ol className="space-y-0.5">
                {run.sources.map((s) => (
                  <li key={s.n} className="flex gap-2 px-2 py-1 text-[12.5px]">
                    <span className="font-mono text-muted-foreground">[{s.n}]</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank" rel="noreferrer noopener" className="truncate hover:underline"
                      >
                        {s.title}
                      </a>
                    ) : (
                      <span className="truncate">
                        {s.title}
                        <span className="text-muted-foreground"> · local</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({ step }: { step: ResearchStep }) {
  const [open, setOpen] = React.useState(false)
  const icon = STEP_ICON[step.kind]
  return (
    <div className="rounded-xl transition-colors hover:bg-foreground/[0.04]">
      <button
        type="button" onClick={() => step.output && setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-lg",
            step.status === "running" && "animate-pulse-soft bg-primary/20 text-primary",
            step.status === "done" && "bg-emerald-500/15 text-emerald-500",
            step.status === "error" && "bg-destructive/15 text-destructive"
          )}
        >
          <HugeiconsIcon icon={icon} className="size-3" strokeWidth={2} />
        </span>
        <span className="truncate text-[12.5px] font-medium">{step.label}</span>
        {step.detail && (
          <span className="truncate text-[12.5px] text-muted-foreground">— {step.detail}</span>
        )}
        <span className="flex-1" />
        {step.endedAt && (
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {((step.endedAt - step.startedAt) / 1000).toFixed(1)}s
          </span>
        )}
      </button>
      {open && step.output && (
        <pre className="mx-2 mb-2 max-h-56 overflow-auto rounded-lg bg-foreground/[0.05] p-2 text-[12.5px] whitespace-pre-wrap">
          {step.output}
        </pre>
      )}
    </div>
  )
}
