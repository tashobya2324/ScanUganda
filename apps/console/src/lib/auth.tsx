import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react"
import { api, getSession, onSessionChange, setSession, type Session } from "./api"
import type { Role, User } from "./types"

interface AuthValue {
  user: User | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore<Session | null>(onSessionChange, getSession)
  const value: AuthValue = {
    user: session?.user ?? null,
    signIn: async (email, password) => setSession(await api.login(email, password)),
    signOut: () => setSession(null),
    can: (...roles) => !!session && roles.includes(session.user.role),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error("useAuth must be used inside AuthProvider")
  return v
}
