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
import { cn } from "@/lib/utils"
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
    <div className="px-2 py-8">
      <h1 className="text-[length:var(--text-display)] leading-[1.04] font-semibold tracking-[-0.03em]">
        Bring your models.
        <br />
        <span style={{ color: "var(--accent-solid)" }}>Keep your data.</span>
      </h1>
      <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-muted-foreground">
        A multi-model workspace that runs in your browser. Conversations,
        memories and documents stay in this device's storage — you choose which
        model ever sees them.
      </p>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-4 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        {hero}

        {!hasProvider ? (
          <div className="mt-2 rounded-xl p-5 panel">
            <span className="mb-3 grid size-9 place-items-center rounded-md border border-border bg-[var(--paper-3)]">
              <HugeiconsIcon
                icon={KeyIcon}
                className="size-4"
                strokeWidth={2}
              />
            </span>
            <h2 className="text-[15px] font-semibold">
              Connect your first model
            </h2>
            <p className="mt-1 max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
              Paste an API key for OpenAI, Anthropic or Gemini — or point Wink
              at Ollama and stay entirely offline.
            </p>
            <button
              type="button"
              onClick={() => store.getState().openSettings("providers")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-semibold ink-fill transition-opacity hover:opacity-90"
            >
              <HugeiconsIcon
                icon={RocketIcon}
                className="size-4"
                strokeWidth={2}
              />
              Choose a provider
            </button>
            <div className="mt-4 flex items-center gap-4 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={CpuIcon}
                  className="size-3 text-emerald-500"
                  strokeWidth={2}
                />
                local models supported
              </span>
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={SparklesIcon}
                  className="size-3 text-sky-500"
                  strokeWidth={2}
                />
                any OpenAI-compatible API
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    store.getState().set("mode", p.mode)
                    window.dispatchEvent(new Event("wink:focus-composer"))
                  }}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-left transition-all panel-2",
                    "hover:"
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl accent-fill text-white group-hover:scale-110">
                    <HugeiconsIcon
                      icon={p.icon}
                      className="size-4"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="text-[13px] leading-snug font-medium">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 pt-4 text-[12px] text-muted-foreground rule-t">
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
      <span className="font-mono text-[13.5px] font-semibold text-foreground tabular-nums">
        {value}
      </span>
      {label}
    </span>
  )
}
