import { useState } from "react"
import { Link } from "react-router"
import { Button, Chip, Empty, ErrorNote, PageHeader, Panel, TableSkeleton, VerdictMark, td, th, tr } from "../components/ui"
import { api } from "../lib/api"
import { formatTime, timeAgo } from "../lib/format"
import { useLoad, useNow } from "../lib/hooks"
import type { Verdict } from "../lib/types"

const FILTERS: { value: Verdict | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "STOP", label: "Stop" },
  { value: "CHECK", label: "Check" },
  { value: "GENUINE", label: "Genuine" },
]

export function Feed() {
  const [verdict, setVerdict] = useState<Verdict | "">("")
  const [paused, setPaused] = useState(false)
  const now = useNow(10_000)
  const scans = useLoad(() => api.scans({ verdict: verdict || undefined, limit: 100 }), [verdict], 5_000, paused)

  return (
    <>
      <PageHeader
        title="Live scans"
        subtitle="Every verification as it happens, across the app, USSD and SMS."
        actions={
          <Button onClick={() => setPaused(!paused)} aria-pressed={paused}>
            <span className={`h-2 w-2 rounded-full ${paused ? "bg-ink-2" : "animate-pulse bg-genuine"}`} aria-hidden="true" />
            {paused ? "Paused" : "Live"}
          </Button>
        }
      />
      {scans.error && <ErrorNote error={scans.error} retry={scans.reload} />}
      <Panel flush>
        <div className="flex gap-1 border-b border-line-2 p-3" role="group" aria-label="Filter by result">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setVerdict(f.value)}
              aria-pressed={verdict === f.value}
              className={`rounded-control px-3 py-1 text-sm font-medium transition-colors ${verdict === f.value ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {scans.loading ? <TableSkeleton rows={8} /> : !scans.data?.length ? (
          <Empty title="No scans to show">{verdict ? "Nothing with that result yet." : "Scans appear here the moment someone verifies a product."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Result</th><th className={th}>When</th><th className={th}>Batch</th><th className={th}>Serial</th>
                  <th className={th}>Channel</th><th className={th}>Location</th><th className={th}>Why</th>
                </tr>
              </thead>
              <tbody>
                {scans.data.map((s) => (
                  <tr key={s.id} className={tr}>
                    <td className={td}><VerdictMark verdict={s.verdict} /></td>
                    <td className={`${td} num whitespace-nowrap`} title={`${formatTime(s.scannedAt)}`}>{timeAgo(s.scannedAt, now)}{s.wasOffline && <span className="ml-2"><Chip tone="accent">offline</Chip></span>}</td>
                    <td className={td}>{s.batchId ? <Link to={`/batches/${s.batchId}`} className="font-mono text-accent hover:underline">{s.batchCode ?? s.batchId}</Link> : <span className="text-ink-2">unknown</span>}</td>
                    <td className={`${td} num font-mono`}>{s.serial ?? "–"}</td>
                    <td className={td}>{s.channel}</td>
                    <td className={`${td} num font-mono text-xs`}>{s.lat !== null && s.lng !== null ? `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}` : <span className="font-sans text-ink-2">not shared</span>}</td>
                    <td className={`${td} max-w-[300px] text-ink-2`}>{s.reasons[0]?.message ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
