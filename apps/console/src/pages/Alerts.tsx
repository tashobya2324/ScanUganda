import { useState } from "react"
import { Link } from "react-router"
import { Button, Chip, Empty, ErrorNote, PageHeader, Panel, TableSkeleton } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"
import { ALERT_LABELS, timeAgo } from "../lib/format"
import { useLoad, useNow } from "../lib/hooks"
import type { Alert, AlertPriority, AlertStatus } from "../lib/types"

const TABS: { value: AlertStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
]
const PRIORITY_TONE = { high: "bad", medium: "warn", low: "neutral" } as const
const BAR = { high: "bg-stop", medium: "bg-check", low: "bg-line" } as const

export function Alerts() {
  const { user } = useAuth()
  const now = useNow()
  const [status, setStatus] = useState<AlertStatus>("open")
  const [priority, setPriority] = useState<AlertPriority | "">("")
  const [actionError, setActionError] = useState<ApiError>()
  const alerts = useLoad(() => api.alerts({ status, priority: priority || undefined, limit: 200 }), [status, priority], 15_000)
  const open = useLoad(() => api.alerts({ status: "open", limit: 500 }), [], 15_000)
  const investigating = useLoad(() => api.alerts({ status: "investigating", limit: 500 }), [], 15_000)

  async function move(a: Alert, to: AlertStatus, assign?: boolean) {
    setActionError(undefined)
    try {
      await api.updateAlert(a.id, to, assign ? user?.id : undefined)
      alerts.reload(); open.reload(); investigating.reload()
    } catch (e) {
      setActionError(e as ApiError)
    }
  }
  const counts: Partial<Record<AlertStatus, number>> = { open: open.data?.length, investigating: investigating.data?.length }

  return (
    <>
      <PageHeader title="Alerts" subtitle="Situations the system could not clear on its own, most urgent first." />
      {(alerts.error || actionError) && <div className="mb-4"><ErrorNote error={(alerts.error ?? actionError)!} retry={alerts.error ? alerts.reload : undefined} /></div>}
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 p-3">
          <div className="flex gap-1" role="tablist" aria-label="Alert status">
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={status === t.value}
                onClick={() => setStatus(t.value)}
                className={`rounded-control px-3 py-1 text-sm font-medium transition-colors ${status === t.value ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2"}`}
              >
                {t.label}{counts[t.value] ? <span className="num ml-1.5 opacity-70">{counts[t.value]}</span> : null}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as AlertPriority | "")} className="h-8 rounded-control border border-line bg-surface px-2 text-ink">
              <option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </label>
        </div>

        {alerts.loading ? <TableSkeleton rows={5} /> : !alerts.data?.length ? (
          <Empty title={status === "open" ? "No open alerts" : `Nothing ${status}`}>
            {status === "open" ? "When a scan looks wrong (a forged code, impossible travel, stock out of area) it lands here." : "Alerts you move here will be listed."}
          </Empty>
        ) : (
          <ul>
            {alerts.data.map((a) => (
              <li key={a.id} className="flex border-t border-line-2 first:border-t-0">
                <span className={`w-1 shrink-0 ${BAR[a.priority]}`} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{ALERT_LABELS[a.type] ?? a.type}</span>
                      <Chip tone={PRIORITY_TONE[a.priority]}>{a.priority} priority</Chip>
                      {a.assignedTo && <Chip tone="accent">{a.assignedTo === user?.id ? "assigned to you" : "assigned"}</Chip>}
                    </div>
                    <p className="mt-1 text-ink-2">{a.message}</p>
                    <p className="mt-1 text-sm text-ink-2">
                      {a.productName && <>{a.productName} · </>}
                      {a.batchId ? <Link to={`/batches/${a.batchId}`} className="font-mono text-accent hover:underline">{a.batchCode}</Link> : "Code not in registry"}
                      {" · "}{timeAgo(a.createdAt, now)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {a.status === "open" && <Button onClick={() => move(a, "investigating", true)}>Take it</Button>}
                    {a.status !== "resolved" && <Button variant={a.status === "investigating" ? "primary" : "secondary"} onClick={() => move(a, "resolved")}>Resolve</Button>}
                    {a.status === "resolved" && <Button onClick={() => move(a, "open")}>Reopen</Button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
