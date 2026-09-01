import { HugeiconsIcon } from "@hugeicons/react"
import {
  BookIcon,
  BrainIcon,
  CloseIcon,
  DatabaseIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from "@/components/icons"
import {
  AppearancePanel,
  AssistantsPanel,
  DataPanel,
  MemoryPanel,
  PrivacyPanel,
  ToolsPanel,
} from "@/components/settings/panels"
import { KnowledgePanel } from "@/components/settings/knowledge-panel"
import { ProvidersPanel } from "@/components/settings/providers-panel"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useStore, type SettingsTab } from "@/lib/store"
import { cn } from "@/lib/utils"
const TABS: { id: SettingsTab; label: string; icon: typeof SettingsIcon }[] = [
  { id: "providers", label: "Providers", icon: SettingsIcon },
  { id: "tools", label: "Tools", icon: WrenchIcon },
  { id: "knowledge", label: "Knowledge", icon: BookIcon },
  { id: "memory", label: "Memory", icon: BrainIcon },
  { id: "assistants", label: "Assistants", icon: SparklesIcon },
  { id: "appearance", label: "Appearance", icon: SunIcon },
  { id: "data", label: "Data", icon: DatabaseIcon },
  { id: "privacy", label: "Privacy", icon: ShieldIcon },
]

export function SettingsDialog() {
  const tab = useStore((s) => s.settingsTab)
  const store = useStore

  return (
    <Dialog
      open={tab !== null}
      onOpenChange={(v) => !v && store.getState().openSettings(null)}
    >
      <DialogContent
        showCloseButton={false}
        aria-label="Settings"
        className="flex h-[min(86vh,46rem)] w-[min(96vw,58rem)] max-w-none flex-col overflow-hidden !p-0 sm:max-w-none md:flex-row"
      >
        <nav className="rule-b flex shrink-0 gap-1 overflow-x-auto p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:border-[var(--hairline)]">
          <div className="mb-1 hidden items-center gap-2 px-2 pt-1 md:flex">
            <span className="accent-fill grid size-6 place-items-center rounded-[8px]">
              <HugeiconsIcon
                icon={SettingsIcon}
                className="size-3.5"
                strokeWidth={2}
              />
            </span>
            <span className="text-[14px] font-semibold tracking-[-0.012em]">Settings</span>
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => store.getState().openSettings(t.id)}
              className={cn(
                "press flex shrink-0 items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[14px] font-medium",
                tab === t.id
                  ? "bg-[var(--paper-2)] text-foreground shadow-[var(--shadow-1)]"
                  : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] hover:text-foreground"
              )}
            >
              <HugeiconsIcon
                icon={t.icon}
                className="size-3.5"
                strokeWidth={2}
              />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="rule-b flex h-14 shrink-0 items-center gap-2 px-5">
            <h2 className="text-[15px] font-semibold">
              {TABS.find((t) => t.id === tab)?.label ?? "Settings"}
            </h2>
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => store.getState().openSettings(null)}
              className="press press-active grid size-8 place-items-center rounded-[9px] text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] hover:text-foreground"
            >
              <HugeiconsIcon icon={CloseIcon} className="size-4" strokeWidth={2} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {(tab === "providers" || tab === "models") && <ProvidersPanel />}
            {tab === "tools" && <ToolsPanel />}
            {tab === "knowledge" && <KnowledgePanel />}
            {tab === "memory" && <MemoryPanel />}
            {tab === "assistants" && <AssistantsPanel />}
            {tab === "appearance" && <AppearancePanel />}
            {tab === "data" && <DataPanel />}
            {tab === "privacy" && <PrivacyPanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
