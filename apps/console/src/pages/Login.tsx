import { useState, type FormEvent } from "react"
import { Navigate } from "react-router"
import { MOBILE_APP_URL } from "../components/Layout"
import { Button, ErrorNote, Field, Input } from "../components/ui"
import { ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"

export function Login() {
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <div className="hidden flex-col justify-between bg-accent p-12 text-accent-ink lg:flex">
        <div className="flex items-center gap-2.5 font-semibold">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#fff" fillOpacity=".14" />
            <path d="M9 12V9.5A.5.5 0 0 1 9.5 9H12M20 9h2.5a.5.5 0 0 1 .5.5V12M23 20v2.5a.5.5 0 0 1-.5.5H20M12 23H9.5a.5.5 0 0 1-.5-.5V20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <path d="m12.5 16 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          ScanUganda
        </div>
        <div>
          <p className="max-w-md text-3xl font-semibold leading-tight">
            One scan tells a shopper whether the packet in their hand is the real one.
          </p>
          <p className="mt-4 max-w-md text-accent-ink/75">
            Register batches, print signed codes, and see where every unit is scanned, as it happens.
          </p>
        </div>
        <p className="font-mono text-sm text-accent-ink/60">GENUINE · CHECK · STOP</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="mt-1 text-ink-2">For manufacturers, UNBS inspectors and administrators.</p>
          </div>
          {error && <ErrorNote error={error} />}
          <Field label="Email">
            {(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
          </Field>
          <Field label="Password">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          <Button variant="primary" type="submit" disabled={busy || !email || !password} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-sm text-ink-2">
            Checking a product you want to buy?{" "}
            <a href={MOBILE_APP_URL} className="font-medium text-accent underline underline-offset-2">Open the mobile app</a>
          </p>
        </form>
      </div>
    </div>
  )
}
