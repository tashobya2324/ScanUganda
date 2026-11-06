import { useState, type FormEvent } from "react"
import { Button, Chip, ErrorNote, Field, Input, Modal, PageHeader, Panel, Select, TableSkeleton, fieldError, td, th, tr } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { useLoad } from "../lib/hooks"
import type { Role } from "../lib/types"

const ROLE_TONE = { admin: "accent", manufacturer: "neutral", inspector: "warn" } as const

export function Team() {
  const users = useLoad(api.users)
  const makers = useLoad(api.manufacturers)
  const [modal, setModal] = useState<"user" | "maker">()

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Who can sign in, and the manufacturers whose products are registered."
        actions={<><Button onClick={() => setModal("maker")}>New manufacturer</Button><Button variant="primary" onClick={() => setModal("user")}>New user</Button></>}
      />
      {(users.error || makers.error) && <ErrorNote error={(users.error ?? makers.error)!} />}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Users" flush>
          {users.loading ? <TableSkeleton rows={4} /> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th></tr></thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id} className={tr}>
                    <td className={`${td} font-medium`}>{u.name}</td>
                    <td className={`${td} text-ink-2`}>{u.email}</td>
                    <td className={td}><Chip tone={ROLE_TONE[u.role]}>{u.role}</Chip>{u.manufacturerId && <span className="ml-2 text-ink-2">{makers.data?.find((m) => m.id === u.manufacturerId)?.name}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Manufacturers" flush>
          {makers.loading ? <TableSkeleton rows={4} /> : (
            <ul>{makers.data?.map((m) => <li key={m.id} className="border-t border-line-2 px-5 py-3 first:border-t-0">{m.name}</li>)}</ul>
          )}
        </Panel>
      </div>
      {modal === "maker" && <NewMaker onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); makers.reload() }} />}
      {modal === "user" && <NewUser makers={makers.data ?? []} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); users.reload() }} />}
    </>
  )
}

function NewMaker({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("")
  const [error, setError] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try { await api.createManufacturer(name.trim()); onDone() } catch (err) { setError(err as ApiError) } finally { setBusy(false) }
  }
  return (
    <Modal title="New manufacturer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote error={error} />}
        <Field label="Company name" hint="A signing key for their codes is created automatically.">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || name.trim().length < 2}>Create</Button></div>
      </form>
    </Modal>
  )
}

function NewUser({ makers, onClose, onDone }: { makers: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "manufacturer" as Role, manufacturerId: "" })
  const [error, setError] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.createUser({ ...f, manufacturerId: f.role === "manufacturer" ? f.manufacturerId : undefined })
      onDone()
    } catch (err) { setError(err as ApiError) } finally { setBusy(false) }
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && !error.details && <ErrorNote error={error} />}
        <Field label="Full name" error={fieldError(error, "name")}>{(id) => <Input id={id} value={f.name} onChange={set("name")} required />}</Field>
        <Field label="Email" error={fieldError(error, "email")}>{(id) => <Input id={id} type="email" value={f.email} onChange={set("email")} required />}</Field>
        <Field label="Temporary password" hint="At least 10 characters. Ask them to keep it private." error={fieldError(error, "password")}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={set("password")} required minLength={10} />}</Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={f.role} onChange={set("role")}>
              <option value="manufacturer">Manufacturer</option><option value="inspector">Inspector</option><option value="admin">Administrator</option>
            </Select>
          )}
        </Field>
        {f.role === "manufacturer" && (
          <Field label="Manufacturer">
            {(id) => (
              <Select id={id} value={f.manufacturerId} onChange={set("manufacturerId")} required>
                <option value="">Choose a manufacturer</option>
                {makers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || !f.name || !f.email || f.password.length < 10 || (f.role === "manufacturer" && !f.manufacturerId)}>{busy ? "Creating…" : "Create user"}</Button>
        </div>
      </form>
    </Modal>
  )
}
