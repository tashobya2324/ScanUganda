import L from "leaflet"
import { useEffect, useRef, useState } from "react"
import { ErrorNote, PageHeader, Panel, VerdictMark, verdictColor } from "../components/ui"
import { api } from "../lib/api"
import { timeAgo } from "../lib/format"
import { useLoad } from "../lib/hooks"
import type { Region, Scan, Verdict } from "../lib/types"

const UGANDA: L.LatLngTuple = [1.37, 32.29]

export function MapPage() {
  const scans = useLoad(() => api.scans({ limit: 300 }), [], 10_000)
  const regions = useLoad(api.regions)
  const [show, setShow] = useState<Record<Verdict, boolean>>({ GENUINE: true, CHECK: true, STOP: true })
  const located = (scans.data ?? []).filter((s) => s.lat !== null && s.lng !== null)
  const visible = located.filter((s) => show[s.verdict])

  return (
    <>
      <PageHeader title="Map" subtitle="Where products are being checked. Circles show each area's sale zone; markers are scans." />
      {scans.error && <ErrorNote error={scans.error} retry={scans.reload} />}
      <Panel flush className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line-2 px-4 py-2.5" role="group" aria-label="Show on map">
          {(["STOP", "CHECK", "GENUINE"] as Verdict[]).map((v) => (
            <label key={v} className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={show[v]} onChange={() => setShow({ ...show, [v]: !show[v] })} className="accent-accent" />
              <VerdictMark verdict={v} size={14} />
              <span className="num text-ink-2">{located.filter((s) => s.verdict === v).length}</span>
            </label>
          ))}
          <span className="ml-auto text-sm text-ink-2">{(scans.data?.length ?? 0) - located.length} scans without a location are not shown</span>
        </div>
        <ScanMap scans={visible} regions={regions.data ?? []} />
      </Panel>
    </>
  )
}

function ScanMap({ scans, regions }: { scans: Scan[]; regions: Region[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | undefined>(undefined)
  const layer = useRef<L.LayerGroup | undefined>(undefined)
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { center: UGANDA, zoom: 7, minZoom: 5, scrollWheelZoom: false })
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = undefined
    }
  }, [])

  useEffect(() => {
    const g = layer.current
    if (!g || !map.current) return
    g.clearLayers()
    for (const r of regions) {
      L.circle([r.center.lat, r.center.lng], { radius: r.radiusKm * 1000, color: "#0f5c47", weight: 1, opacity: 0.35, fillOpacity: 0.04, interactive: false }).addTo(g)
      L.marker([r.center.lat, r.center.lng], {
        interactive: false,
        icon: L.divIcon({ className: "", html: `<span style="font:500 11px var(--font-sans);color:#3f4448;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff">${r.name}</span>`, iconAnchor: [-11, 7] }),
      }).addTo(g)
    }
    for (const s of scans) {
      L.circleMarker([s.lat!, s.lng!], { radius: s.verdict === "GENUINE" ? 5 : 8, color: "#fff", weight: 1.5, fillColor: verdictColor(s.verdict), fillOpacity: 0.9 })
        .bindTooltip(`<strong>${s.verdict}</strong> · ${s.batchCode ?? "unknown code"}<br>${timeAgo(s.scannedAt)}`, { direction: "top" })
        .addTo(g)
    }
    if (!fitted.current && scans.length) {
      map.current.fitBounds(L.latLngBounds(scans.map((s) => [s.lat!, s.lng!] as L.LatLngTuple)).pad(0.3), { maxZoom: 10 })
      fitted.current = true
    }
  }, [scans, regions])

  return <div ref={el} className="h-[560px] w-full" role="region" aria-label="Map of scans" />
}
