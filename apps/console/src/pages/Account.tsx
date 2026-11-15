import { useState, type FormEvent } from "react"
import { Button, ErrorNote, Field, Input, PageHeader, Panel } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"

export function Account() {
  const { user } = useAuth()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [again, setAgain] = useState("")
  const [error, setError] = useState<ApiError>()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const mismatch = again !== "" && next !== again
  const ready = current !== "" && next.length >= 10 && next === again && next !== current

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setDone(false)
    try {
      await api.changePassword(current, next)
      setDone(true)
      setCurrent("")
      setNext("")
      setAgain("")
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Password" subtitle={`Change the password for ${user?.email ?? "your account"}.`} />
      <Panel title="Change password" className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorNote error={error} />}
          {done && (
            <p role="status" className="rounded-control border border-line bg-accent-soft px-3 py-2 text-sm text-accent">
              Password changed. Use the new one next time you sign in.
            </p>
          )}
          <Field label="Current password">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
          </Field>
          <Field label="New password" hint="At least 10 characters. Do not reuse a password from another service.">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />}
          </Field>
          <Field label="Repeat the new password" error={mismatch ? "The two passwords do not match" : undefined}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />}
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" type="submit" disabled={busy || !ready}>{busy ? "Saving…" : "Change password"}</Button>
          </div>
        </form>
      </Panel>
    </>
  )
}
