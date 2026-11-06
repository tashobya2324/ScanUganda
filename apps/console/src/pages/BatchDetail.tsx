import QRCode from "qrcode"
import { useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router"
import { Button, Chip, ErrorNote, Field, Input, Modal, PageHeader, Panel, Skeleton } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"
import { STAGE_LABELS, batchStatus, formatDate, groupCode, timeAgo, unitsToCsv } from "../lib/format"
import { useLoad } from "../lib/hooks"
import type { BatchDetail as BatchDetailT, GeneratedUnit, Lifecycle } from "../lib/types"

const STAGES: Lifecycle[] = ["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"]
const NEXT_VERB: Record<string, string> = { IN_FACTORY: "Release to transit", IN_TRANSIT: "Deliver to distributor", AT_DISTRIBUTOR: "Deliver to retail" }

export function BatchDetail() {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const canEdit = can("admin", "manufacturer")
  const batch = useLoad(() => api.batch(id), [id])
  const regions = useLoad(api.regions)
  const [generated, setGenerated] = useState<GeneratedUnit[]>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<ApiError | string>()

  const b = batch.data
  if (batch.error) {
    return (
      <>
        <Link to="/batches" className="text-sm text-accent hover:underline">← Batches</Link>
        <div className="mt-4"><ErrorNote error={batch.error} retry={batch.reload} /></div>
      </>
    )
  }
  if (!b) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>
  }

  const status = batchStatus(b)
  const areaNames = b.designatedRegionIds.map((r) => regions.data?.find((x) => x.id === r)?.name ?? r)

  async function advance(from: Lifecycle, to: Lifecycle) {
    setError(undefined)
    try {
      const { moved } = await api.advance(b!.id, from, to)
      setNotice(`${moved.toLocaleString()} unit${moved === 1 ? "" : "s"} moved to “${STAGE_LABELS[to]}”.`)
      batch.reload()
    } catch (e) {
      setError(e as ApiError)
    }
  }

  return (
    <>
      <Link to="/batches" className="text-sm text-accent hover:underline print:hidden">← Batches</Link>
      <div className="print:hidden">
        <PageHeader
          title={b.productName}
          subtitle={`${b.packSize} · ${b.manufacturerName}`}
          actions={<><span className="font-mono text-sm text-ink-2">{b.batchCode}</span>{status === "recalled" ? <Chip tone="bad">Recalled</Chip> : status === "expired" ? <Chip>Expired</Chip> : status === "expiring" ? <Chip tone="warn">Expiring soon</Chip> : <Chip tone="good">Active</Chip>}</>}
        />

        {b.recall && (
          <div role="status" className="mb-6 rounded-control border border-stop/30 bg-stop-soft px-4 py-3 text-stop">
            <strong>Recalled {timeAgo(b.recall.at)}.</strong> Every scan of this batch now returns STOP. Reason: {b.recall.reason}
          </div>
        )}
        {notice && <div role="status" className="mb-6 rounded-control border border-genuine/30 bg-genuine-soft px-4 py-3 text-genuine">{notice}</div>}
        {error && <div className="mb-6"><ErrorNote error={error} /></div>}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Panel title="Where the units are">
              <ol className="grid gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-4">
                {STAGES.map((s, i) => {
                  const next = STAGES[i + 1]
                  return (
                    <li key={s} className="flex flex-col justify-between bg-surface p-4">
                      <div>
                        <div className="text-sm text-ink-2">{STAGE_LABELS[s]}</div>
                        <div className="num mt-1 font-mono text-2xl font-medium">{b.lifecycle[s].toLocaleString()}</div>
                      </div>
                      {canEdit && next && b.lifecycle[s] > 0 && !b.recall && (
                        <button
                          onClick={() => advance(s, next)}
                          className="mt-3 text-left text-sm font-medium text-accent underline-offset-2 hover:underline"
                        >
                          {NEXT_VERB[s]} →
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
              <p className="mt-3 text-sm text-ink-2">
                Units start in the factory. A shop scan of a unit still marked “In factory” is stopped as parallel-market stock, so release units as they leave.
              </p>
            </Panel>

            {canEdit && !b.recall && <Generate batch={b} onGenerated={(u) => { setGenerated(u); batch.reload() }} />}
            {generated && <GeneratedCodes batch={b} units={generated} onDismiss={() => setGenerated(undefined)} />}
          </div>

          <div className="space-y-6">
            <Panel title="Details">
              <dl className="space-y-3 text-sm">
                <Row k="Manufactured" v={formatDate(b.manufacturedAt)} />
                <Row k="Expires" v={formatDate(b.expiresAt)} />
                <Row k="Units registered" v={b.unitCount.toLocaleString()} />
                <Row k="Sale area" v={areaNames.length ? areaNames.join(", ") : "Nationwide"} />
                <Row k="Signing key" v={<span className="font-mono text-xs">{b.keyId}</span>} />
              </dl>
            </Panel>
            {canEdit && <RecallPanel batch={b} onChanged={batch.reload} />}
          </div>
        </div>
      </div>
      {generated && <PrintSheet batch={b} units={generated} />}
    </>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-ink-2">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
}

function Generate({ batch, onGenerated }: { batch: BatchDetailT; onGenerated: (u: GeneratedUnit[]) => void }) {
  const [count, setCount] = useState("100")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError>()
  const n = Number(count)
  const valid = Number.isInteger(n) && n >= 1 && n <= 5000

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      onGenerated((await api.generateUnits(batch.id, n)).units)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Generate codes">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="How many" hint="1 to 5,000 at a time">
            {(id) => <Input id={id} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="num" />}
          </Field>
        </div>
        <Button variant="primary" type="submit" disabled={busy || !valid} className="mb-[26px]">{busy ? "Generating…" : "Generate"}</Button>
      </form>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
      <p className="mt-3 text-sm text-ink-2">Each unit gets a signed QR code and a 12-digit scratch code for feature phones.</p>
    </Panel>
  )
}

function GeneratedCodes({ batch, units, onDismiss }: { batch: BatchDetailT; units: GeneratedUnit[]; onDismiss: () => void }) {
  function download() {
    const url = URL.createObjectURL(new Blob([unitsToCsv(units)], { type: "text/csv" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: `${batch.batchCode}-codes.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Panel title={`${units.length.toLocaleString()} codes ready`} action={<button onClick={onDismiss} className="text-sm text-ink-2 hover:text-ink">Dismiss</button>}>
      <div role="alert" className="mb-4 rounded-control border border-check/30 bg-check-soft px-4 py-3 text-sm text-check">
        <strong>Save these now.</strong> The 12-digit codes are stored only as a one-way hash and cannot be shown again. Leaving or dismissing this page removes them.
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={download}>Download CSV</Button>
        <Button onClick={() => window.print()}>Print QR sheet</Button>
      </div>
      <div className="overflow-x-auto rounded-control border border-line">
        <table className="w-full text-sm">
          <thead><tr className="bg-bg text-left text-xs text-ink-2"><th className="px-3 py-2 font-medium">Serial</th><th className="px-3 py-2 font-medium">Scratch code</th><th className="px-3 py-2 font-medium">QR payload</th></tr></thead>
          <tbody>
            {units.slice(0, 5).map((u) => (
              <tr key={u.serial} className="border-t border-line-2">
                <td className="num px-3 py-2 font-mono">{u.serial}</td>
                <td className="num px-3 py-2 font-mono">{groupCode(u.lookupCode)}</td>
                <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs text-ink-2" title={u.payload}>{u.payload}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {units.length > 5 && <p className="mt-2 text-sm text-ink-2">Showing 5 of {units.length.toLocaleString()}. The CSV and print sheet include all of them.</p>}
    </Panel>
  )
}

/** One label per unit, laid out for printing. Hidden on screen. */
function PrintSheet({ batch, units }: { batch: BatchDetailT; units: GeneratedUnit[] }) {
  const [svgs, setSvgs] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    void Promise.all(units.map(async (u) => [u.serial, await QRCode.toString(u.payload, { type: "svg", margin: 0, errorCorrectionLevel: "M" })] as const)).then((pairs) => live && setSvgs(Object.fromEntries(pairs)))
    return () => { live = false }
  }, [units])
  return (
    <div className="hidden print:block">
      <h1 className="mb-3 text-lg font-semibold">{batch.productName} · {batch.batchCode}</h1>
      <div className="grid grid-cols-4 gap-3">
        {units.map((u) => (
          <figure key={u.serial} className="break-inside-avoid rounded border border-line p-2 text-center">
            <div className="mx-auto h-24 w-24 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[u.serial] ?? "" }} />
            <figcaption className="mt-1.5 font-mono text-[10px] leading-tight">
              <div>{batch.batchCode} · {u.serial}</div>
              <div className="mt-0.5 text-[11px] font-medium tracking-wide">{groupCode(u.lookupCode)}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function RecallPanel({ batch, onChanged }: { batch: BatchDetailT; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError>()

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
      setOpen(false)
      setReason("")
      onChanged()
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Recall">
      {batch.recall ? (
        <>
          <p className="text-sm text-ink-2">This batch is recalled. Lifting the recall makes its codes valid again.</p>
          {error && <div className="mt-3"><ErrorNote error={error} /></div>}
          <Button className="mt-3" disabled={busy} onClick={() => run(() => api.liftRecall(batch.id))}>Lift recall</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">If this batch is unsafe, recall it. Every channel (app and USSD) answers STOP immediately.</p>
          <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>Recall this batch…</Button>
        </>
      )}
      {open && (
        <Modal title={`Recall ${batch.batchCode}?`} onClose={() => setOpen(false)}>
          <form onSubmit={(e) => { e.preventDefault(); void run(() => api.recall(batch.id, reason.trim())) }} className="space-y-4">
            <p className="text-sm text-ink-2">Shoppers will see this reason. You can lift the recall later.</p>
            {error && <ErrorNote error={error} />}
            <Field label="Reason" hint="At least 5 characters">
              {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="danger" type="submit" disabled={busy || reason.trim().length < 5}>{busy ? "Recalling…" : "Recall batch"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  )
}
