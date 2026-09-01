import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CloudIcon,
  CpuIcon,
  DeleteIcon,
  EyeIcon,
  KeyIcon,
  RefreshIcon,
} from "@/components/icons"
import { Switch } from "@/components/ui/switch"
import { fmtTokens } from "@/lib/defaults"
import { keyPageFor, providerFromTemplate, TEMPLATES, type ProviderTemplate } from "@/lib/providers"
import { useStore } from "@/lib/store"
import type { ProviderConfig } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ProvidersPanel() {
  const providers = useStore((s) => s.providers)
  const [adding, setAdding] = React.useState<ProviderTemplate | null>(null)

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-border bg-[var(--paper-3)] p-3 text-[13px] leading-relaxed text-muted-foreground">
        Keys are encrypted with a non-extractable device key and stored only in this browser.
        Requests go straight from your browser to the provider — Wink has no server. Local endpoints
        (Ollama, LM Studio, llama.cpp) need CORS enabled: for Ollama, start it with{" "}
        <code className="rounded bg-[var(--paper-2)] px-1 font-mono text-[12.5px]">
          OLLAMA_ORIGINS=*
        </code>
        .
      </p>

      {providers.length > 0 && (
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-[12.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Connect a provider
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setAdding(t)}
              className="group flex flex-col items-start gap-1 rounded-lg border border-border bg-[var(--paper-2)] p-3 text-left transition-colors hover:bg-[var(--paper-3)]"
            >
              <span className="flex w-full items-center gap-1.5">
                <HugeiconsIcon
                  icon={t.local ? CpuIcon : CloudIcon}
                  className={cn("size-3.5", t.local ? "text-local" : "text-cloud")}
                  strokeWidth={2}
                />
                <span className="truncate text-[13.5px] font-semibold">{t.label}</span>
                <HugeiconsIcon
                  icon={AddIcon}
                  className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  strokeWidth={2.5}
                />
              </span>
              <span className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                {t.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      {adding && <AddProvider template={adding} onDone={() => setAdding(null)} />}
    </div>
  )
}

function AddProvider({ template, onDone }: { template: ProviderTemplate; onDone: () => void }) {
  const store = useStore
  const [label, setLabel] = React.useState(template.label)
  const [baseUrl, setBaseUrl] = React.useState(template.baseUrl)
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async () => {
    if (!baseUrl.trim()) return
    setBusy(true)
    try {
      const cfg = {
        ...providerFromTemplate(template),
        label: label.trim() || template.label,
        baseUrl: baseUrl.trim(),
      }
      await store.getState().addProvider(cfg, key.trim() || undefined)
      onDone()
    } catch {
      // refreshModels already surfaced the error; keep the form open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-3 rounded-xl p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold">Add {template.label}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          aria-label="Cancel"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-[var(--paper-3)]"
        >
          <HugeiconsIcon icon={CloseIcon} className="size-3.5" strokeWidth={2} />
        </button>
      </div>
      <Field label="Name">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-md border border-border bg-[var(--paper)] px-2.5 py-1.5 text-[13.5px] outline-none"
        />
      </Field>
      <Field label="Base URL">
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="w-full rounded-md border border-border bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[13px] outline-none"
        />
      </Field>
      <Field label={template.needsKey ? "API key" : "API key (optional)"}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={template.needsKey ? "sk-…" : "leave blank for local servers"}
          className="w-full rounded-md border border-border bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[13px] outline-none"
        />
      </Field>
      {template.docs && (
        <a
          href={template.docs}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block text-[12.5px] font-medium text-[var(--accent-solid)] hover:underline"
        >
          get a key →
        </a>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="ink-fill w-full rounded-full py-2 text-[13.5px] font-semibold disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect and load models"}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function ProviderCard({ provider }: { provider: ProviderConfig }) {
  const store = useStore
  const settings = useStore((s) => s.settings)
  const [key, setKey] = React.useState("")
  const [editingKey, setEditingKey] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const usable = provider.models.filter((m) => !m.capabilities.embedding)
  const keyPage = keyPageFor(provider)

  return (
    <div className="panel rounded-xl p-3.5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={provider.local ? CpuIcon : CloudIcon}
          className={cn("size-4 shrink-0", provider.local ? "text-local" : "text-cloud")}
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{provider.label}</span>
            <span
              className={cn(
                "rounded-[4px] border px-1.5 py-px font-mono text-[11px] tracking-wider uppercase",
                provider.local
                  ? "border-local/40 text-local"
                  : "border-cloud/40 text-cloud"
              )}
            >
              {provider.local ? "on device" : "cloud"}
            </span>
            {provider.hasKey && (
              <HugeiconsIcon
                icon={KeyIcon}
                className="size-3 text-muted-foreground"
                strokeWidth={2}
              />
            )}
          </div>
          <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
            {provider.baseUrl} · {usable.length} models
          </span>
        </div>
        <Switch
          checked={provider.enabled}
          onCheckedChange={(v) => void store.getState().patchProvider(provider.id, { enabled: v })}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <SmallBtn
          icon={RefreshIcon}
          label={busy ? "Loading…" : "Refresh models"}
          onClick={async () => {
            setBusy(true)
            try {
              await store.getState().refreshModels(provider.id)
            } catch {
              /* toast already shown */
            } finally {
              setBusy(false)
            }
          }}
        />
        <SmallBtn
          icon={KeyIcon}
          label={provider.hasKey ? "Replace key" : "Set key"}
          onClick={() => setEditingKey((v) => !v)}
        />
        <SmallBtn
          icon={EyeIcon}
          label={expanded ? "Hide models" : "Models"}
          onClick={() => setExpanded((v) => !v)}
        />
        <span className="flex-1" />
        <SmallBtn
          icon={DeleteIcon}
          label="Remove"
          danger
          onClick={() => void store.getState().removeProvider(provider.id)}
        />
      </div>

      {editingKey && (
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-1.5">
          <input
            autoFocus
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="paste a new key"
            className="min-w-0 flex-1 rounded-md border border-border bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[13px] outline-none"
          />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await store.getState().setProviderKey(provider.id, key.trim())
                  setKey("")
                  setEditingKey(false)
                } catch {
                  /* refreshModels already toasted the rejection */
                } finally {
                  setBusy(false)
                }
              }}
              className="ink-fill shrink-0 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60"
            >
              {busy ? "Checking…" : "Save"}
            </button>
          </div>
          {keyPage && (
            <a
              href={keyPage}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent-solid)] hover:underline"
            >
              <HugeiconsIcon icon={KeyIcon} className="size-3" strokeWidth={2} />
              Get a {provider.label} key ↗
            </a>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {(
          [
            ["attachments", "Files"],
            ["knowledge", "Knowledge"],
            ["memories", "Memories"],
          ] as const
        ).map(([field, label]) => (
          <button
            key={field}
            type="button"
            onClick={() =>
              void store.getState().patchProvider(provider.id, {
                allow: { ...provider.allow, [field]: !provider.allow[field] },
              })
            }
            className={cn(
              "flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors",
              provider.allow[field]
                ? "border-good/40 bg-good/10 text-good"
                : "border-dashed border-border text-muted-foreground line-through"
            )}
            title={`${provider.allow[field] ? "Allowed" : "Blocked"}: send ${label.toLowerCase()} to ${provider.label}`}
          >
            {provider.allow[field] && (
              <HugeiconsIcon icon={CheckIcon} className="size-2.5" strokeWidth={3} />
            )}
            {label}
          </button>
        ))}
      </div>

      {expanded && (
        <div className="rule-t mt-3 max-h-72 space-y-0.5 overflow-y-auto pt-2">
          {provider.models.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--paper-3)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12.5px]">{m.id}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {fmtTokens(m.capabilities.contextWindow)} ctx
                  {m.capabilities.vision && " · vision"}
                  {m.capabilities.tools && " · tools"}
                  {m.capabilities.reasoning && " · reasoning"}
                  {m.capabilities.embedding && " · embeddings"}
                  {m.price && ` · $${m.price.in}/$${m.price.out} per 1M`}
                </span>
              </span>
              {settings.defaultProviderId === provider.id && settings.defaultModel === m.id && (
                <span className="rounded-[4px] border border-border px-1.5 text-[11px] font-medium text-muted-foreground">
                  default
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  void store.getState().patchModel(provider.id, m.id, { hidden: !m.hidden })
                }
                className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
              >
                {m.hidden ? "show" : "hide"}
              </button>
            </div>
          ))}
          {provider.models.length === 0 && (
            <p className="px-1.5 py-2 text-[12.5px] text-muted-foreground">
              No models loaded yet — hit refresh.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SmallBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof KeyIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:bg-[var(--paper-3)]",
        danger && "hover:border-destructive/40 hover:bg-destructive/8 hover:text-destructive"
      )}
    >
      <HugeiconsIcon icon={icon} className="size-3" strokeWidth={2} />
      {label}
    </button>
  )
}
