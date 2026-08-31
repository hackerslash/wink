import * as React from "react"

import { renderMarkdown, type Artifact } from "@/lib/markdown"
import type { Citation } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  content: string
  citations?: Citation[]
  streaming?: boolean
  className?: string
  onCitation?: (citation: Citation) => void
  onArtifact?: (artifact: Artifact) => void
}

/**
 * Model output is rendered through marked with HTML escaped, links forced to
 * noopener, and [n] markers rewritten into citation chips.
 */
export const MarkdownView = React.memo(function MarkdownView({
  content,
  citations = [],
  streaming,
  className,
  onCitation,
  onArtifact,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null)
  const html = React.useMemo(() => renderMarkdown(content, citations), [content, citations])

  // Copy / open buttons are attached to the rendered DOM instead of being
  // rebuilt as React nodes: one pass per render, no parser round-trip.
  React.useEffect(() => {
    const root = ref.current
    if (!root) return
    for (const block of root.querySelectorAll<HTMLElement>(".code-block")) {
      const head = block.querySelector(".code-head")
      if (!head || head.querySelector(".code-actions")) continue
      const actions = document.createElement("div")
      actions.className = "code-actions"

      const copy = document.createElement("button")
      copy.type = "button"
      copy.textContent = "Copy"
      copy.onclick = () => {
        void navigator.clipboard.writeText(block.querySelector("code")?.textContent ?? "")
        copy.textContent = "Copied"
        setTimeout(() => (copy.textContent = "Copy"), 1400)
      }
      actions.append(copy)

      const kind = block.dataset.artifact
      if (kind && onArtifact) {
        const open = document.createElement("button")
        open.type = "button"
        open.textContent = kind === "code" ? "Open" : "Preview"
        open.onclick = () =>
          onArtifact({
            id: `inline-${Math.random().toString(36).slice(2)}`,
            kind: kind as Artifact["kind"],
            lang: block.dataset.lang || "text",
            title: `${block.dataset.lang || "code"} artifact`,
            code: block.querySelector("code")?.textContent ?? "",
          })
        actions.append(open)
      }
      head.append(actions)
    }
  }, [html, onArtifact])

  const onClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-citation]")
    if (!target) return
    const n = Number(target.dataset.citation)
    const cite = citations.find((c) => c.n === n)
    if (!cite) return
    if (!cite.url) e.preventDefault()
    onCitation?.(cite)
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn("prose-wink max-w-none", streaming && "streaming-caret", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
