import { useMemo, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { Button, Chip, Empty, ErrorNote, Field, Input, Modal, PageHeader, Panel, Select, TableSkeleton, fieldError, td, th, tr } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"
import { CATEGORY_LABELS, batchStatus, formatDate } from "../lib/format"
import { useLoad } from "../lib/hooks"
import type { Category } from "../lib/types"

const STATUS_CHIP = {
  active: <Chip tone="good">Active</Chip>,
  expiring: <Chip tone="warn">Expiring soon</Chip>,
  expired: <Chip tone="neutral">Expired</Chip>,
  recalled: <Chip tone="bad">Recalled</Chip>,
} as const

const toMs = (date: string) => new Date(date + "T00:00:00Z").getTime()

export function Batches() {
  const { can } = useAuth()
  const canEdit = can("admin", "manufacturer")
  const batches = useLoad(api.batches)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (batches.data ?? []).filter((b) => !q || `${b.batchCode} ${b.productName} ${b.manufacturerName}`.toLowerCase().includes(q))
  }, [batches.data, query])
  const showMaker = can("admin", "inspector")

  return (
    <>
      <PageHeader
        title="Batches"
        subtitle="Every production run you have registered. A batch carries its own signing key, expiry and sale area."
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}>New batch</Button>}
      />
      {batches.error && <ErrorNote error={batches.error} retry={batches.reload} />}
      <Panel flush>
        <div className="border-b border-line-2 p-3">
          <Input type="search" aria-label="Search batches" placeholder="Search by batch code or product" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
        </div>
        {batches.loading ? <TableSkeleton /> : rows.length === 0 ? (
          <Empty title={query ? "No batch matches that search" : "No batches yet"}>
            {query ? "Try a different code or product name." : canEdit ? "Create a batch, then generate codes to print on the packaging." : "Batches appear here once a manufacturer registers them."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Batch</th>
                  <th className={th}>Product</th>
                  {showMaker && <th className={th}>Manufacturer</th>}
                  <th className={`${th} text-right`}>Units</th>
                  <th className={th}>Expires</th>
                  <th className={th}>Sale area</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className={tr}>
                    <td className={td}><Link to={`/batches/${b.id}`} className="font-mono font-medium text-accent hover:underline">{b.batchCode}</Link></td>
                    <td className={td}>{b.productName}<span className="text-ink-2"> · {b.packSize}</span></td>
                    {showMaker && <td className={td}>{b.manufacturerName}</td>}
                    <td className={`${td} num text-right`}>{b.unitCount.toLocaleString()}</td>
                    <td className={`${td} num`}>{formatDate(b.expiresAt)}</td>
                    <td className={td}>{b.designatedRegionIds.length ? `${b.designatedRegionIds.length} area${b.designatedRegionIds.length > 1 ? "s" : ""}` : "Nationwide"}</td>
                    <td className={td}>{STATUS_CHIP[batchStatus(b)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && <NewBatch onClose={() => setCreating(false)} onCreated={() => { setCreating(false); batches.reload() }} />}
    </>
  )
}

function NewBatch({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { can } = useAuth()
  const products = useLoad(api.products)
  const regions = useLoad(api.regions)
  const [productId, setProductId] = useState("")
  const [batchCode, setBatchCode] = useState("")
  const [made, setMade] = useState(new Date().toISOString().slice(0, 10))
  const [expires, setExpires] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  const [addingProduct, setAddingProduct] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.createBatch({ productId, batchCode: batchCode.trim(), manufacturedAt: toMs(made), expiresAt: toMs(expires), regionIds: picked })
      onCreated()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }

  if (addingProduct) {
    return <NewProduct onClose={() => setAddingProduct(false)} onCreated={(id) => { products.reload(); setProductId(id); setAddingProduct(false) }} showMaker={can("admin")} />
  }

  return (
    <Modal title="New batch" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && !error.details && <ErrorNote error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product" error={fieldError(error, "productId")}>
            {(id) => (
              <Select id={id} value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Choose a product</option>
                {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.packSize})</option>)}
              </Select>
            )}
          </Field>
          <Field label="Batch code" hint="Your own label, e.g. PS-2411-01" error={fieldError(error, "batchCode")}>
            {(id) => <Input id={id} value={batchCode} onChange={(e) => setBatchCode(e.target.value)} required maxLength={60} className="font-mono" />}
          </Field>
          <Field label="Manufactured">
            {(id) => <Input id={id} type="date" value={made} onChange={(e) => setMade(e.target.value)} required />}
          </Field>
          <Field label="Expires">
            {(id) => <Input id={id} type="date" value={expires} min={made} onChange={(e) => setExpires(e.target.value)} required />}
          </Field>
        </div>
        <button type="button" onClick={() => setAddingProduct(true)} className="text-sm text-accent underline-offset-2 hover:underline">
          Product not listed? Add a product
        </button>
        <fieldset>
          <legend className="text-sm font-medium">Sale area</legend>
          <p className="mb-2 text-sm text-ink-2">Leave empty for nationwide. Scans outside these areas raise a distribution alert.</p>
          <div className="flex flex-wrap gap-2">
            {regions.data?.map((r) => {
              const on = picked.includes(r.id)
              return (
                <label key={r.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-line-2"}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== r.id) : [...picked, r.id])} />
                  {r.name}
                </label>
              )
            })}
          </div>
        </fieldset>
        {error?.details && <ErrorNote error={error.message} />}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || !productId || !batchCode || !expires}>{busy ? "Creating…" : "Create batch"}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NewProduct({ onClose, onCreated, showMaker }: { onClose: () => void; onCreated: (id: string) => void; showMaker: boolean }) {
  const makers = useLoad(() => (showMaker ? api.manufacturers() : Promise.resolve([])), [showMaker])
  const [name, setName] = useState("")
  const [packSize, setPackSize] = useState("")
  const [category, setCategory] = useState<Category>("FOOD")
  const [maker, setMaker] = useState("")
  const [error, setError] = useState<ApiError>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await api.createProduct({ name: name.trim(), packSize: packSize.trim(), category, manufacturerId: showMaker ? maker : undefined })
      onCreated(id)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="New product" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote error={error} />}
        {showMaker && (
          <Field label="Manufacturer">
            {(id) => (
              <Select id={id} value={maker} onChange={(e) => setMaker(e.target.value)} required>
                <option value="">Choose a manufacturer</option>
                {makers.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Product name" error={fieldError(error, "name")}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pack size" hint="e.g. 1 kg packet">{(id) => <Input id={id} value={packSize} onChange={(e) => setPackSize(e.target.value)} required />}</Field>
          <Field label="Category">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Back</Button>
          <Button variant="primary" type="submit" disabled={busy || !name || !packSize || (showMaker && !maker)}>{busy ? "Adding…" : "Add product"}</Button>
        </div>
      </form>
    </Modal>
  )
}
