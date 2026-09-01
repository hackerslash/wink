import { HugeiconsIcon } from "@hugeicons/react"
import {
  BookIcon,
  BrainIcon,
  CpuIcon,
  KeyIcon,
  RocketIcon,
  SearchIcon,
  SparklesIcon,
  WrenchIcon,
} from "@/components/icons"
import { useStore } from "@/lib/store"
const PROMPTS = [
  {
    icon: SearchIcon,
    label: "Research a question with citations",
    mode: "research" as const,
    text: "",
  },
  {
    icon: BookIcon,
    label: "Ask about my own documents",
    mode: "chat" as const,
    text: "",
  },
  {
    icon: WrenchIcon,
    label: "Use a tool to check something live",
    mode: "chat" as const,
    text: "",
  },
  {
    icon: BrainIcon,
    label: "Remember how I like to work",
    mode: "chat" as const,
    text: "",
  },
]

export function Landing() {
  const providers = useStore((s) => s.providers)
  const collections = useStore((s) => s.collections)
  const memories = useStore((s) => s.memories)
  const store = useStore
  const hasProvider = providers.some((p) => p.enabled && p.models.length)

  const hero = (
    <div className="px-2 py-8 animate-[rise_0.5s_var(--ease-out)_both]">
      <h1 className="text-[length:var(--text-display)] leading-[1.04] font-semibold tracking-[var(--track-display)]">
        Bring your models.
        <br />
        <span className="text-muted-foreground">Keep your data.</span>
      </h1>
      <p className="mt-4 max-w-[54ch] text-[17px] leading-[1.6] tracking-[-0.011em] text-muted-foreground">
        A multi-model workspace that runs in your browser. Conversations,
        memories and documents stay in this device's storage — you choose which
        model ever sees them.
      </p>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-4 pt-[5.5rem] pb-[var(--composer-h,9rem)] md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        {hero}

        {!hasProvider ? (
          <div className="panel mt-2 max-w-[33rem] rounded-[18px] p-6 animate-[rise_0.5s_60ms_var(--ease-out)_both]">
            <span className="mb-3.5 grid size-9 place-items-center rounded-[11px] border border-hairline bg-[var(--paper-3)] text-[var(--accent-solid)]">
              <HugeiconsIcon
                icon={KeyIcon}
                className="size-4"
                strokeWidth={2}
              />
            </span>
            <h2 className="text-[16px] font-semibold tracking-[-0.016em]">
              Connect your first model
            </h2>
            <p className="mt-1.5 max-w-[46ch] text-[15px] leading-[1.6] text-muted-foreground">
              Paste an API key for OpenAI, Anthropic or Gemini — or point Wink
              at Ollama and stay entirely offline.
            </p>
            <button
              type="button"
              onClick={() => store.getState().openSettings("providers")}
              className="ink-fill press press-active mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-semibold shadow-[var(--shadow-1)] hover:opacity-90"
            >
              <HugeiconsIcon
                icon={RocketIcon}
                className="size-4"
                strokeWidth={2}
              />
              Choose a provider
            </button>
            <div className="mt-5 flex items-center gap-4 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={CpuIcon}
                  className="size-3 text-local"
                  strokeWidth={2}
                />
                local models supported
              </span>
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={SparklesIcon}
                  className="size-3 text-cloud"
                  strokeWidth={2}
                />
                any OpenAI-compatible API
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PROMPTS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    store.getState().set("mode", p.mode)
                    window.dispatchEvent(new Event("wink:focus-composer"))
                  }}
                  className="press group flex items-center gap-3 rounded-[14px] border border-hairline bg-[var(--paper-2)] px-3.5 py-3 text-left shadow-[var(--shadow-1)] hover:-translate-y-px hover:shadow-[var(--shadow-2)]"
                  style={{ animation: `rise 0.45s ${120 + i * 45}ms var(--ease-out) both` }}
                >
                  <span className="press grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--paper-3)] text-muted-foreground group-hover:bg-[color-mix(in_oklab,var(--accent-solid)_12%,transparent)] group-hover:text-[var(--accent-solid)]">
                    <HugeiconsIcon
                      icon={p.icon}
                      className="size-4"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="text-[14px] leading-snug font-medium">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="rule-t mt-7 flex flex-wrap items-center gap-4 pt-4 text-[13px] text-muted-foreground animate-[fade-in_0.5s_320ms_var(--ease-out)_both]">
              <Stat
                label="providers"
                value={providers.filter((p) => p.enabled).length}
              />
              <Stat
                label="models"
                value={providers.reduce(
                  (n, p) =>
                    n +
                    p.models.filter((m) => !m.capabilities.embedding).length,
                  0
                )}
              />{" "}
              <Stat label="collections" value={collections.length} />
              <Stat
                label="memories"
                value={memories.filter((m) => !m.disabled).length}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-[14px] font-semibold text-foreground tabular-nums">
        {value}
      </span>
      {label}
    </span>
  )
}
