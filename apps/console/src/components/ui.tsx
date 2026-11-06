import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react"
import type { ApiError } from "../lib/api"
import type { Verdict } from "../lib/types"

export const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" ")

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "danger" | "ghost"
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-[#0b4a39] disabled:bg-ink-2/40",
  secondary: "bg-surface text-ink border border-line hover:bg-line-2 disabled:text-ink-2/60",
  danger: "bg-stop text-white hover:bg-[#961f19] disabled:bg-ink-2/40",
  ghost: "text-ink-2 hover:text-ink hover:bg-line-2",
}

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-control px-3.5 text-sm font-medium transition-colors duration-150",
        VARIANTS[variant],
        className,
      )}
    />
  )
}

/* ---------- form fields ---------- */

const control =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-2/60 focus-visible:border-accent"

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-sm text-stop" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-sm text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(control, className)} />
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(control, "pr-8", className)} />
}

/* ---------- verdict mark: shape + word, never colour alone ---------- */

const V = {
  GENUINE: { word: "Genuine", color: "text-genuine", soft: "bg-genuine-soft", fill: "#117a4a" },
  CHECK: { word: "Check", color: "text-check", soft: "bg-check-soft", fill: "#9a5b00" },
  STOP: { word: "Stop", color: "text-stop", soft: "bg-stop-soft", fill: "#b3261e" },
} as const

export const verdictColor = (v: Verdict) => V[v].fill

export function VerdictMark({ verdict, size = 16, label = true }: { verdict: Verdict; size?: number; label?: boolean }) {
  const v = V[verdict]
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-medium", v.color)}>
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        {verdict === "GENUINE" && <circle cx="8" cy="8" r="7" fill={v.fill} />}
        {verdict === "CHECK" && <path d="M8 .8 15.2 8 8 15.2.8 8Z" fill={v.fill} />}
        {verdict === "STOP" && <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5Z" fill={v.fill} />}
        {verdict === "GENUINE" && <path d="m5 8.2 2.2 2.2L11 6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
        {verdict === "CHECK" && <path d="M8 4.8v3.6M8 10.8h.01" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
        {verdict === "STOP" && <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
      </svg>
      {label ? v.word : <span className="sr-only">{v.word}</span>}
    </span>
  )
}

/* ---------- status chips ---------- */

const TONES = {
  neutral: "bg-line-2 text-ink-2",
  good: "bg-genuine-soft text-genuine",
  warn: "bg-check-soft text-check",
  bad: "bg-stop-soft text-stop",
  accent: "bg-accent-soft text-accent",
} as const

export function Chip({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cx("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium", TONES[tone])}>{children}</span>
}

/* ---------- layout pieces ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 max-w-prose text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, action, children, className, flush }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx("rounded-panel border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-line-2 px-5 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} aria-hidden="true" />
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-5" />
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-ink-2">{children}</p>}
    </div>
  )
}

export function ErrorNote({ error, retry }: { error: ApiError | string; retry?: () => void }) {
  const message = typeof error === "string" ? error : error.message
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-control border border-stop/30 bg-stop-soft px-4 py-3 text-sm text-stop">
      <span>{message}</span>
      {retry && (
        <button onClick={retry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}

/* ---------- table ---------- */

export const th = "sticky top-0 bg-surface px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-2"
export const td = "px-4 py-3 align-middle"
export const tr = "border-t border-line-2 hover:bg-bg/60"

/* ---------- modal ---------- */

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh] print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx("w-full rounded-panel bg-surface shadow-float", wide ? "max-w-2xl" : "max-w-md")}>
        <header className="flex items-center justify-between border-b border-line-2 px-5 py-3.5">
          <h2 id={titleId} className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-2 hover:text-ink" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function fieldError(error: ApiError | undefined, name: string): string | undefined {
  return error?.details?.fieldErrors?.[name]?.[0]
}
