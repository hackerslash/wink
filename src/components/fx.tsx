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

/** The wordmark: the W mark plus ink text. Used in the sidebar and boot. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-[17px] shrink-0 rounded-[5px] shadow-[var(--shadow-1)]"
        aria-hidden
      >
        <rect width="32" height="32" fill="var(--accent-solid)" />
        <path
          d="M7 10.5 11.5 22 16 13.4 20.5 22 24.4 15.2"
          fill="none"
          stroke="var(--accent-on)"
          strokeWidth="2.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[17px] leading-none font-semibold tracking-[-0.028em]">
        wink
      </span>
    </span>
  )
}
