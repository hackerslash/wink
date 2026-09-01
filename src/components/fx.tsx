import { cn } from "@/lib/utils"

export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg", className)}
      style={{
        background: "var(--paper-3)",
        backgroundImage:
          "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 6%, transparent), transparent)",
        backgroundSize: "220% 100%",
        animation: "shimmer 2.4s linear infinite",
      }}
    />
  )
}

export function AccentDot({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  return (
    <span
      className={cn("inline-block size-3 rounded-[4px]", className)}
      style={{
        background: color,
        boxShadow: "inset 0 0 0 1px oklch(0% 0 0 / 0.12)",
      }}
    />
  )
}

/** The wordmark: ink text plus one accent square. Used in the sidebar and boot. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className="size-[13px] rounded-[4px]"
        style={{ background: "var(--accent-solid)" }}
        aria-hidden
      />
      <span className="text-[17px] font-semibold tracking-[-0.03em]">wink</span>
    </span>
  )
}
