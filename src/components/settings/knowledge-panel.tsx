import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AddIcon, DeleteIcon, FileIcon, UploadIcon } from "@/components/icons"
import { docs as docStore } from "@/lib/db"
import { fmtBytes } from "@/lib/defaults"
import {
  createCollection,
  deleteCollection,
  deleteDoc,
  ingestFile,
  isSupportedDoc,
} from "@/lib/rag"
import { useStore } from "@/lib/store"
import type { Collection, KnowledgeDoc } from "@/lib/types"
import { cn } from "@/lib/utils"

export function KnowledgePanel() {
  const collections = useStore((s) => s.collections)
  const settings = useStore((s) => s.settings)
  const store = useStore
  const [active, setActive] = React.useState<string | null>(collections[0]?.id ?? null)

  React.useEffect(() => {
    if (!active && collections.length) setActive(collections[0].id)
  }, [collections, active])

  const collection = collections.find((c) => c.id === active)

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-[var(--paper-3)] p-3 text-[13px] leading-relaxed text-muted-foreground">
        Documents are parsed, chunked and embedded in a worker, then stored in IndexedDB. Retrieval
        is hybrid: cosine similarity over embeddings blended with BM25 keyword scoring. The embedding
        provider is{" "}
        <strong className="font-semibold text-foreground">
          {settings.embedding.providerId === "local"
            ? "the built-in local hashing embedder"
            : `${settings.embedding.model} (remote)`}
        </strong>
        {settings.embedding.providerId === "local" &&
          ", which is lexical only. Point it at a real embedding model in Tools → Embeddings for semantic recall."}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-medium transition-colors",
              active === c.id
                ? "border-border bg-[var(--paper-3)]"
                : "border-border bg-[var(--paper-2)] hover:bg-[var(--paper-3)]"
            )}
          >
            <span>{c.emoji}</span>
            {c.name}
            <span className="font-mono text-[12px] text-muted-foreground">{c.docCount}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={async () => {
            const name = window.prompt("Collection name")
            if (!name) return
            const col = await createCollection(name.trim(), settings)
            await store.getState().reloadCollections()
            setActive(col.id)
          }}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={AddIcon} className="size-3.5" strokeWidth={2.5} />
          New collection
        </button>
      </div>

      {collection ? (
        <CollectionView collection={collection} />
      ) : (
        <p className="py-8 text-center text-[14px] text-muted-foreground">
          Create a collection to start building local knowledge.
        </p>
      )}
    </div>
  )
}

function CollectionView({ collection }: { collection: Collection }) {
  const settings = useStore((s) => s.settings)
  const store = useStore
  const [docs, setDocs] = React.useState<KnowledgeDoc[]>([])
  const [dragging, setDragging] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const reload = React.useCallback(async () => {
    setDocs((await docStore.byCollection(collection.id)).sort((a, b) => b.createdAt - a.createdAt))
  }, [collection.id])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const ingest = async (files: File[]) => {
    const supported = files.filter(isSupportedDoc)
    const skipped = files.length - supported.length
    if (skipped) store.getState().toast("error", `${skipped} unsupported file(s) skipped`)
    for (const file of supported) {
      await ingestFile(collection.id, file, settings, (doc) => {
        setDocs((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)])
      })
      await store.getState().reloadCollections()
    }
    await reload()
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void ingest([...e.dataTransfer.files])
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
          dragging ? "border-[var(--accent-solid)] bg-[var(--paper-3)]" : "border-border"
        )}
      >
        <HugeiconsIcon icon={UploadIcon} className="size-5 text-muted-foreground" strokeWidth={2} />
        <span className="text-[14px] font-semibold">
          Drop PDFs, Markdown, text or code here
        </span>
        <span className="text-[13px] text-muted-foreground">
          Parsed and embedded locally · never uploaded unless you ask a cloud model
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void ingest([...(e.target.files ?? [])])
            e.target.value = ""
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className="font-mono">
          {collection.chunkCount} chunks · {collection.dims}d · {collection.embeddingModel}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`Delete “${collection.name}” and all its documents?`)) return
            await deleteCollection(collection.id)
            await store.getState().reloadCollections()
          }}
          className="font-medium text-destructive hover:underline"
        >
          delete collection
        </button>
      </div>

      <div className="space-y-1">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-2 rounded-md border border-border bg-[var(--paper-2)] px-3 py-2"
          >
            <HugeiconsIcon
              icon={FileIcon}
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{doc.name}</div>
              <div className="font-mono text-[12px] text-muted-foreground">
                {fmtBytes(doc.size)} · {doc.chunkCount} chunks · {doc.status}
                {doc.error && <span className="text-destructive"> — {doc.error}</span>}
              </div>
              {doc.status !== "ready" && doc.status !== "error" && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--paper-3)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.round((doc.progress ?? 0) * 100)}%`,
                      background: "var(--accent-solid)",
                    }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={`Delete ${doc.name}`}
              onClick={async () => {
                await deleteDoc(doc.id)
                await store.getState().reloadCollections()
                setDocs((prev) => prev.filter((d) => d.id !== doc.id))
              }}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <HugeiconsIcon icon={DeleteIcon} className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        ))}
        {docs.length === 0 && (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No documents yet.</p>
        )}
      </div>
    </div>
  )
}
