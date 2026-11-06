import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { MemoryRouter } from "react-router"
import { setSession, type Session } from "./lib/api"
import { AuthProvider } from "./lib/auth"
import type { Role } from "./lib/types"

export const sessionFor = (role: Role = "admin"): Session => ({
  token: "t",
  expiresAt: Date.now() + 3_600_000,
  user: { id: "u-me", email: "me@x.test", name: "Ada Lovelace", role, manufacturerId: role === "manufacturer" ? "m1" : null },
})

/** Renders inside a router and auth provider, optionally already signed in. */
export function renderApp(ui: ReactElement, opts: { role?: Role | null; route?: string } = {}) {
  setSession(opts.role === null ? null : sessionFor(opts.role ?? "admin"))
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[opts.route ?? "/"]}>{ui}</MemoryRouter>
    </AuthProvider>,
  )
}
