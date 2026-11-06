import { NavLink, Outlet } from "react-router"
import { useAuth } from "../lib/auth"
import type { Role } from "../lib/types"
import { cx } from "./ui"

const NAV: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/", label: "Overview" },
  { to: "/batches", label: "Batches" },
  { to: "/alerts", label: "Alerts" },
  { to: "/feed", label: "Live scans" },
  { to: "/map", label: "Map" },
  { to: "/team", label: "Team", roles: ["admin"] },
]

/** Where shoppers use the mobile app. Same address under /app/ in development; set VITE_PWA_URL when deployed apart. */
export const MOBILE_APP_URL: string = import.meta.env.VITE_PWA_URL ?? "/app/"

const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", manufacturer: "Manufacturer", inspector: "Inspector" }

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0F5C47" />
      <path d="M9 12V9.5A.5.5 0 0 1 9.5 9H12M20 9h2.5a.5.5 0 0 1 .5.5V12M23 20v2.5a.5.5 0 0 1-.5.5H20M12 23H9.5a.5.5 0 0 1-.5-.5V20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="m12.5 16 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Layout() {
  const { user, signOut, can } = useAuth()
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr] print:block">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r print:hidden">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 px-5 py-4">
            <Mark />
            <div className="leading-tight">
              <div className="font-semibold">ScanUganda</div>
              <div className="text-xs text-ink-2">Console</div>
            </div>
          </div>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.filter((n) => !n.roles || can(...n.roles)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  cx(
                    "relative whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-line-2 hover:text-ink",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden border-t border-line-2 p-4 lg:block">
            <a href={MOBILE_APP_URL} target="_blank" rel="noreferrer" className="mb-3 block text-sm text-accent underline-offset-2 hover:underline">
              Open the mobile app ↗
            </a>
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="text-xs text-ink-2">{user && ROLE_LABEL[user.role]}</div>
            <button onClick={signOut} className="mt-2 text-sm text-ink-2 underline underline-offset-2 hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-3 border-b border-line bg-surface px-6 py-2 text-sm lg:hidden print:hidden">
          <span className="text-ink-2">{user?.name}</span>
          <button onClick={signOut} className="underline underline-offset-2">Sign out</button>
        </header>
        <main className="mx-auto max-w-[1280px] px-6 py-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
