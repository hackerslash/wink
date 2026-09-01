import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { CloseIcon, CodeIcon, CopyIcon, DownloadIcon, EyeIcon } from "@/components/icons"
import { download } from "@/lib/exporting"
import type { Artifact } from "@/lib/markdown"
import { renderMarkdown } from "@/lib/markdown"
import { cn } from "@/lib/utils"

const EXT: Record<Artifact["kind"], string> = {
  html: "html",
  svg: "svg",
  code: "txt",
  markdown: "md",
}

/** Sandboxed without allow-same-origin: generated HTML cannot reach IndexedDB or the vault. */
export function ArtifactViewer({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const previewable =
    artifact.kind === "html" || artifact.kind === "svg" || artifact.kind === "markdown"
  const [tab, setTab] = React.useState<"preview" | "code">(previewable ? "preview" : "code")

  const srcDoc = React.useMemo(() => {
    if (artifact.kind === "html") return artifact.code
    if (artifact.kind === "svg")
      return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#141310}svg{max-width:96%;max-height:96%}</style>${artifact.code}`
    if (artifact.kind === "markdown")
      return `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.7 system-ui;padding:24px;max-width:70ch;margin:auto;color:#eae7e2;background:#141310}pre{overflow:auto;background:#00000040;padding:12px;border-radius:8px}</style>${renderMarkdown(artifact.code)}`
    return ""
  }, [artifact])

  return (
    <div className="panel flex h-full flex-col overflow-hidden rounded-xl">
      <div className="rule-b flex items-center gap-2 px-3 py-2">
        <HugeiconsIcon icon={CodeIcon} className="size-4 text-muted-foreground" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{artifact.title}</span>
        {previewable && (
          <div className="flex rounded-md border border-border p-0.5">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-medium transition-colors",
                  tab === t
                    ? "bg-[var(--paper-3)] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={t === "preview" ? EyeIcon : CodeIcon}
                  className="size-3"
                  strokeWidth={2}
                />
                {t}
              </button>
            ))}
          </div>
        )}
        <IconBtn
          label="Copy"
          icon={CopyIcon}
          onClick={() => void navigator.clipboard.writeText(artifact.code)}
        />
        <IconBtn
          label="Download"
          icon={DownloadIcon}
          onClick={() =>
            download(
              `artifact.${EXT[artifact.kind]}`,
              artifact.code,
              artifact.kind === "svg" ? "image/svg+xml" : "text/plain"
            )
          }
        />
        <IconBtn label="Close" icon={CloseIcon} onClick={onClose} />
      </div>

      {tab === "preview" && previewable ? (
        <iframe
          title={artifact.title}
          sandbox="allow-scripts allow-popups allow-forms"
          srcDoc={srcDoc}
          className="min-h-0 flex-1 bg-[#141310]"
        />
      ) : (
        <div
          className="prose-wink min-h-0 flex-1 overflow-auto p-3"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(`\`\`\`${artifact.lang}\n${artifact.code}\n\`\`\``),
          }}
        />
      )}
    </div>
  )
}

function IconBtn({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: typeof CopyIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--paper-3)] hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} className="size-3.5" strokeWidth={2} />
    </button>
  )
}
