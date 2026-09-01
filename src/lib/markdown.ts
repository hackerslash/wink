import DOMPurify from "dompurify"
import hljs from "highlight.js/lib/common"
import { marked, type Tokens } from "marked"

import type { Citation } from "./types"

export interface Artifact {
  id: string
  kind: "html" | "svg" | "code" | "markdown"
  lang: string
  title: string
  code: string
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Big self-contained blocks become artifacts instead of inline code walls. */
function artifactKind(lang: string, code: string): Artifact["kind"] | null {
  const l = lang.toLowerCase()
  if (l === "html" && /<(html|body|div|section|canvas|script)/i.test(code)) return "html"
  if (l === "svg" || (l === "xml" && code.trimStart().startsWith("<svg"))) return "svg"
  if (code.split("\n").length >= 24) return "code"
  return null
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const language = (lang ?? "").split(/\s+/)[0] || ""
      const valid = language && hljs.getLanguage(language)
      const highlighted = valid
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value
      const kind = artifactKind(language, text)
      return `<div class="code-block group/code relative" data-lang="${escapeHtml(
        language
      )}"${kind ? ` data-artifact="${kind}"` : ""}><div class="code-head"><span>${
        escapeHtml(language || "text")
      }</span></div><pre><code class="hljs language-${escapeHtml(
        language
      )}">${highlighted}</code></pre></div>`
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens)
      return `<a href="${escapeHtml(href)}" title="${escapeHtml(
        title ?? ""
      )}" target="_blank" rel="noreferrer noopener">${text}</a>`
    },
  },
})

/** Rewrites [n] markers into clickable chips bound to real citations. */
function linkCitations(html: string, citations: Citation[]) {
  if (!citations.length) return html
  const byNumber = new Map(citations.map((c) => [c.n, c]))
  return html.replace(/\[(\d{1,3})\](?!\()/g, (match, digits: string) => {
    const cite = byNumber.get(Number(digits))
    if (!cite) return match
    const label = escapeHtml(cite.title.slice(0, 90))
    return `<a class="citation" data-citation="${cite.n}" href="${escapeHtml(
      cite.url ?? "#"
    )}"${cite.url ? ' target="_blank" rel="noreferrer noopener"' : ""} title="${label}">${cite.n}</a>`
  })
}

const cache = new Map<string, string>()

export function renderMarkdown(text: string, citations: Citation[] = []): string {
  const key = `${citations.map((c) => c.n).join(",")}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  // marked emits raw HTML verbatim, and this lands in dangerouslySetInnerHTML.
  const html = DOMPurify.sanitize(
    linkCitations(marked.parse(text, { async: false }), citations),
    { ADD_ATTR: ["target"] }
  )
  if (cache.size > 300) cache.clear()
  cache.set(key, html)
  return html
}

export function stripThinkTags(text: string) {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart()
}

export function extractThink(text: string) {
  const parts = [...text.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g)].map((m) => m[1])
  return parts.join("\n").trim()
}
