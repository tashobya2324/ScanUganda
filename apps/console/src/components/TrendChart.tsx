import type { Overview } from "../lib/types"

const COLORS = { GENUINE: "#117a4a", CHECK: "#9a5b00", STOP: "#b3261e" } as const

/** Stacked daily bars. Plain SVG: no charting library needed for one chart. */
export function TrendChart({ daily }: { daily: Overview["daily"] }) {
  const W = 640, H = 220, L = 32, B = 28, T = 8
  const max = Math.max(4, ...daily.map((d) => d.GENUINE + d.CHECK + d.STOP))
  const niceMax = Math.ceil(max / 4) * 4
  const plotH = H - B - T
  const slot = (W - L) / daily.length
  const bar = Math.min(44, slot * 0.58)
  const y = (v: number) => T + plotH - (v / niceMax) * plotH
  const total = daily.reduce((n, d) => n + d.GENUINE + d.CHECK + d.STOP, 0)

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Scans per day for the last 7 days, ${total} in total`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (niceMax / 4) * i
          return (
            <g key={i}>
              <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#e4e0d6" strokeWidth="1" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5b6168" className="num">{v}</text>
            </g>
          )
        })}
        {daily.map((d, i) => {
          const x = L + slot * i + (slot - bar) / 2
          let top = y(0)
          const seg = (k: keyof typeof COLORS) => {
            const h = (d[k] / niceMax) * plotH
            top -= h
            return h > 0 ? <rect key={k} x={x} y={top} width={bar} height={h} fill={COLORS[k]} rx={k === "STOP" ? 3 : 0}><title>{`${d.date}: ${d[k]} ${k.toLowerCase()}`}</title></rect> : null
          }
          const label = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
          return (
            <g key={d.date}>
              {seg("GENUINE")}
              {seg("CHECK")}
              {seg("STOP")}
              <text x={x + bar / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b6168">{label}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs text-ink-2">
        {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k] }} />
            {k[0]}{k.slice(1).toLowerCase()}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
