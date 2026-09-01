import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { ChatView } from "@/components/chat-view"
import { PermissionPrompt } from "@/components/chat/tool-card"
import { CommandPalette } from "@/components/command-palette"
import { Shimmer } from "@/components/fx"
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, LockIcon } from "@/components/icons"
import { Inspector } from "@/components/inspector"
import { ModelPicker } from "@/components/model-picker"
import { SettingsDialog } from "@/components/settings"
import { Sidebar } from "@/components/sidebar"
import { useTheme } from "@/components/theme-provider"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ACCENTS } from "@/lib/defaults"
import { useStore } from "@/lib/store"
import { vault } from "@/lib/vault"
import { cn } from "@/lib/utils"

export function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const store = useStore
  const { setTheme } = useTheme()

  React.useEffect(() => {
    void store.getState().init()
  }, [store])

  // Theme and accent live in the local settings record, not just localStorage.
  React.useEffect(() => {
    if (!ready) return
    setTheme(settings.theme)
  }, [ready, settings.theme, setTheme])

  React.useEffect(() => {
    const tone = ACCENTS[settings.accent] ?? ACCENTS.vermilion
    const root = document.documentElement
    const apply = () => {
      const dark = root.classList.contains("dark")
      root.style.setProperty("--accent-solid", dark ? tone.dark : tone.light)
      root.style.setProperty("--accent-on", dark ? "oklch(16% 0.01 60)" : "oklch(99% 0.002 75)")
    }
    apply()
    root.dataset.effects = settings.effects
    // The theme provider toggles a class on <html>; re-resolve when it does.
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [settings.accent, settings.effects])

  useHotkeys()

  return (
    <div className="flex h-svh w-full overflow-hidden bg-[var(--canvas)] text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => store.getState().set("sidebarOpen", false)}
          className="fixed inset-0 z-20 bg-[var(--mat-scrim)] backdrop-blur-[2px] animate-[fade-in_0.2s_var(--ease-out)_both] md:hidden"
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 bg-[var(--shell)] shadow-[var(--shadow-3)] md:static md:bg-transparent md:shadow-none",
          !sidebarOpen && "pointer-events-none"
        )}
      >
        <Sidebar />
      </div>

      {ready ? <ChatView /> : <BootSkeleton />}
      <Inspector />

      <CommandPalette />
      <ModelPicker />
      <SettingsDialog />
      <PermissionDialog />
      <VaultDialog />
      <Toasts />
    </div>
  )
}

function BootSkeleton() {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 bg-[var(--paper)] p-6 md:my-2.5 md:mr-2.5 md:ml-2.5 md:rounded-[18px] md:border md:border-hairline md:shadow-[var(--shadow-2)]">
      <Shimmer className="h-9 w-56" />
      <div className="mx-auto mt-16 w-full max-w-2xl space-y-4">
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-16 w-3/4" />
        <Shimmer className="h-16 w-2/3" />
      </div>
    </main>
  )
}

function useHotkeys() {
  const store = useStore
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === "k") {
        e.preventDefault()
        store.getState().set("paletteOpen", !store.getState().paletteOpen)
      } else if (key === "n") {
        e.preventDefault()
        void store.getState().newConversation()
      } else if (key === "b") {
        e.preventDefault()
        store.getState().set("sidebarOpen", !store.getState().sidebarOpen)
      } else if (key === "i" && !e.shiftKey) {
        e.preventDefault()
        store.getState().set("inspectorOpen", !store.getState().inspectorOpen)
      } else if (key === "/") {
        e.preventDefault()
        store.getState().set("modelPickerOpen", !store.getState().modelPickerOpen)
      } else if (key === ".") {
        e.preventDefault()
        store.getState().stop()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [store])
}

function PermissionDialog() {
  const permission = useStore((s) => s.permission)
  return (
    <Dialog open={permission !== null} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        aria-label="Tool permission"
        className="glass-overlay sm:max-w-md"
      >
        {permission && (
          <PermissionPrompt
            toolTitle={permission.tool.title}
            description={permission.tool.description}
            args={permission.args}
            onDecide={(allow, remember) => useStore.getState().resolvePermission(allow, remember)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function VaultDialog() {
  const open = useStore((s) => s.vaultPrompt)
  const settings = useStore((s) => s.settings)
  const store = useStore
  const [pass, setPass] = React.useState("")
  const [error, setError] = React.useState("")

  const unlock = async () => {
    if (!settings.vault.salt || !settings.vault.check) return
    const ok = await vault.unlock(pass, settings.vault.salt, settings.vault.check)
    if (!ok) return setError("That passphrase does not match.")
    setPass("")
    setError("")
    store.getState().set("vaultPrompt", false)
    store.getState().toast("success", "Vault unlocked")
  }

  return (
    <Dialog open={open} onOpenChange={(v) => store.getState().set("vaultPrompt", v)}>
      <DialogContent
        showCloseButton={false}
        aria-label="Unlock vault"
        className="glass-overlay sm:max-w-sm"
      >
        <div className="space-y-3">
          <span className="grid size-9 place-items-center rounded-[11px] border border-hairline bg-[var(--paper-2)] shadow-[var(--shadow-1)]">
            <HugeiconsIcon icon={LockIcon} className="size-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold">Unlock your vault</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Your API keys are encrypted with this passphrase. Everything else works without it.
            </p>
          </div>
          <input
            autoFocus
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void unlock()}
            placeholder="Passphrase"
            className="w-full rounded-[11px] border border-hairline bg-[var(--paper-2)] px-3 py-2.5 font-mono text-[14px] shadow-[inset_0_1px_2px_oklch(20%_0.01_262/0.05)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-state)] ease-[var(--ease-out)] focus:border-[var(--accent-solid)]"
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => store.getState().set("vaultPrompt", false)}
              className="press press-active flex-1 rounded-full border border-hairline bg-[var(--paper-2)] px-3 py-2 text-[14px] font-medium text-muted-foreground hover:text-foreground"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => void unlock()}
              className="ink-fill press press-active flex-1 rounded-full px-3 py-2 text-[14px] font-semibold hover:opacity-90"
            >
              Unlock
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const store = useStore
  return (
    <div className="pointer-events-none fixed right-3 bottom-28 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="glass-overlay pointer-events-auto flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[14px] animate-[rise_0.28s_var(--ease-arrive)_both]"
        >
          <HugeiconsIcon
            icon={t.kind === "error" ? AlertIcon : t.kind === "success" ? CheckIcon : InfoIcon}
            className={cn(
              "size-4 shrink-0",
              t.kind === "error" ? "text-destructive" : "text-muted-foreground"
            )}
            strokeWidth={2.2}
          />
          <span className="min-w-0 flex-1 font-medium break-words">{t.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => store.getState().dismissToast(t.id)}
            className="press grid size-5 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={CloseIcon} className="size-3" strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default App
