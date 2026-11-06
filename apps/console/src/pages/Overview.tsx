import { Link } from "react-router"
import { TrendChart } from "../components/TrendChart"
import { Chip, Empty, ErrorNote, PageHeader, Panel, Skeleton } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { ALERT_LABELS, percent, timeAgo } from "../lib/format"
import { useLoad, useNow } from "../lib/hooks"

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "stop" }) {
  return (
    <div className="px-6 py-5">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className={`num mt-1 font-mono text-3xl font-medium ${tone === "stop" ? "text-stop" : ""}`}>{value}</dd>
      {note && <p className="mt-1 text-sm text-ink-2">{note}</p>}
    </div>
  )
}

export function Overview() {
  const { user } = useAuth()
  const now = useNow()
  const overview = useLoad(api.overview, [], 15_000)
  const alerts = useLoad(() => api.alerts({ status: "open", limit: 5 }), [], 15_000)
  const o = overview.data

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user?.name.split(" ")[0]}`}
        subtitle="What happened in the last 24 hours."
      />
      {overview.error && <ErrorNote error={overview.error} retry={overview.reload} />}

      <Panel flush className="overflow-hidden">
        <dl className="grid divide-line-2 sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
          {o ? (
            <>
              <Figure label="Scans" value={String(o.last24h.total)} note={`${o.last24h.check} to check · ${o.last24h.stop} stopped`} />
              <Figure label="Genuine rate" value={percent(o.last24h.genuine, o.last24h.total)} note="of scans in 24 h" />
              <Figure label="Open alerts" value={String(o.openAlerts.high + o.openAlerts.medium + o.openAlerts.low)} note={`${o.openAlerts.high} high priority`} tone={o.openAlerts.high > 0 ? "stop" : undefined} />
              <Figure label="Batches" value={String(o.batches)} note={o.recalledBatches ? `${o.recalledBatches} recalled` : "none recalled"} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3 px-6 py-5"><Skeleton className="w-20" /><Skeleton className="h-8 w-16" /></div>
            ))
          )}
        </dl>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Scans, last 7 days">
          {o ? o.daily.every((d) => d.GENUINE + d.CHECK + d.STOP === 0) ? <Empty title="No scans yet">Scans appear here as soon as someone verifies a product.</Empty> : <TrendChart daily={o.daily} /> : <Skeleton className="h-52" />}
        </Panel>

        <Panel title="Needs attention" action={<Link to="/alerts" className="text-sm text-accent underline-offset-2 hover:underline">All alerts</Link>} flush>
          {alerts.error ? (
            <div className="p-4"><ErrorNote error={alerts.error} retry={alerts.reload} /></div>
          ) : !alerts.data ? (
            <div className="space-y-3 p-5"><Skeleton /><Skeleton /><Skeleton /></div>
          ) : alerts.data.length === 0 ? (
            <Empty title="Nothing needs attention">Open alerts show up here, most urgent first.</Empty>
          ) : (
            <ul>
              {alerts.data.map((a) => (
                <li key={a.id} className="border-t border-line-2 px-5 py-3 first:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{ALERT_LABELS[a.type] ?? a.type}</span>
                    <Chip tone={a.priority === "high" ? "bad" : a.priority === "medium" ? "warn" : "neutral"}>{a.priority}</Chip>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{a.message}</p>
                  <p className="mt-1 text-xs text-ink-2">
                    {a.productName ? `${a.productName} · ` : ""}{a.batchCode ? <span className="font-mono">{a.batchCode}</span> : "unknown code"} · {timeAgo(a.createdAt, now)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
