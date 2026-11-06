import type { Verdict } from "@scanuganda/core"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { NavLink, useNavigate } from "react-router"
import { useT, type StringKey } from "../i18n"

export const cx = (...p: (string | false | undefined | null)[]) => p.filter(Boolean).join(" ")

/* ---------- icons: one set, 1.75 stroke, 24 grid ---------- */

const PATHS = {
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8 12h8" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 7.5V12l3 2" /></>,
  report: <><path d="M5 21V4M5 4h11l-1.8 3.5L16 11H5" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
  offline: <><path d="M3 3l18 18M8.5 8.8A10 10 0 0 0 3 12.5M5.5 15a6 6 0 0 1 3-1.6M15.5 9a10 10 0 0 1 5.5 3.5M12 19h.01" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
} as const
export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger"
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink active:bg-[#0b4a39] disabled:bg-ink-2/40",
  secondary: "bg-surface text-ink border border-line active:bg-line-2 disabled:text-ink-2/60",
  ghost: "text-ink-2 active:bg-line-2",
  danger: "bg-stop text-white active:bg-[#961f19]",
}

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cx("inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-5 text-base font-semibold transition-colors", VARIANTS[variant], className)}
    />
  )
}

/* ---------- verdict mark: shape + word, never colour alone ---------- */

export type MarkVerdict = Verdict | "PENDING"
export const VERDICT_BG: Record<MarkVerdict, string> = {
  GENUINE: "bg-genuine",
  CHECK: "bg-check",
  STOP: "bg-stop",
  PENDING: "bg-pending",
}
export const VERDICT_HEX: Record<MarkVerdict, string> = {
  GENUINE: "#117a4a",
  CHECK: "#9a5b00",
  STOP: "#b3261e",
  PENDING: "#3f4448",
}
export const VERDICT_TEXT: Record<MarkVerdict, string> = {
  GENUINE: "text-genuine",
  CHECK: "text-check",
  STOP: "text-stop",
  PENDING: "text-pending",
}

/** Circle for genuine, diamond for check, octagon for stop, dashed ring for not-yet-checked. */
export function VerdictShape({ verdict, size = 96, ink = "#fff", fill = "currentColor", className }: { verdict: MarkVerdict; size?: number; ink?: string; fill?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className={className}>
      {verdict === "GENUINE" && <circle cx="48" cy="48" r="44" fill={fill} />}
      {verdict === "CHECK" && <path d="M48 3 93 48 48 93 3 48Z" fill={fill} />}
      {verdict === "STOP" && <path d="M30 4h36l26 26v36L66 92H30L4 66V30Z" fill={fill} />}
      {verdict === "PENDING" && <circle cx="48" cy="48" r="42" fill="none" stroke={fill} strokeWidth="6" strokeDasharray="10 9" />}
      {verdict === "GENUINE" && <path d="m29 49 13 13 25-27" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === "CHECK" && <path d="M48 28v26M48 66h.01" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" />}
      {verdict === "STOP" && <path d="m33 33 30 30M63 33 33 63" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" />}
      {verdict === "PENDING" && <path d="M48 30v20l12 8" fill="none" stroke={fill} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

export function VerdictBadge({ verdict }: { verdict: MarkVerdict }) {
  const { t } = useT()
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-semibold", VERDICT_TEXT[verdict])}>
      <VerdictShape verdict={verdict} size={16} ink="#fff" />
      {t(`verdict.${verdict}.word` as StringKey)}
    </span>
  )
}

/* ---------- chrome ---------- */

export function TopBar({ title, back = true, right }: { title: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate()
  const { t } = useT()
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line bg-bg/95 px-2 backdrop-blur-sm">
      {back ? (
        <button onClick={() => (typeof back === "string" ? nav(back) : nav(-1))} aria-label={t("common.back")} className="flex h-12 w-12 items-center justify-center rounded-full text-ink active:bg-line-2">
          <Icon name="back" />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  )
}

export function BottomNav() {
  const { t } = useT()
  const items: { to: string; key: StringKey; icon: IconName }[] = [
    { to: "/", key: "nav.scan", icon: "scan" },
    { to: "/history", key: "nav.history", icon: "history" },
    { to: "/report", key: "nav.report", icon: "report" },
    { to: "/settings", key: "nav.settings", icon: "settings" },
  ]
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === "/"}
          className={({ isActive }) => cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium", isActive ? "text-accent" : "text-ink-2")}
        >
          <Icon name={i.icon} />
          {t(i.key)}
        </NavLink>
      ))}
    </nav>
  )
}

const TONES = {
  info: "border-line bg-surface text-ink-2",
  warn: "border-check/30 bg-check-soft text-check",
  bad: "border-stop/30 bg-stop-soft text-stop",
} as const

export function Banner({ tone = "info", icon, children, role }: { tone?: keyof typeof TONES; icon?: IconName; children: ReactNode; role?: "status" | "alert" }) {
  return (
    <div role={role} className={cx("flex items-start gap-3 rounded-control border px-4 py-3 text-sm", TONES[tone])}>
      {icon && <span className="mt-0.5 shrink-0"><Icon name={icon} size={18} /></span>}
      <div>{children}</div>
    </div>
  )
}

export function Page({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className={cx("mx-auto min-h-dvh max-w-md bg-bg", nav && "pb-20")}>
      {children}
      {nav && <BottomNav />}
    </div>
  )
}
