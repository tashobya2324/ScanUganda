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
      <PageHeader title="Map" subtitle="Where products are being checked. Soft circles are each area's sale zone; dots are scans. Click the map to zoom with the scroll wheel." />
      {scans.error && <ErrorNote error={scans.error} retry={scans.reload} />}
      <Panel flush className="overflow-hidden shadow-float">
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

const LEGEND: { v: Verdict; label: string }[] = [
  { v: "GENUINE", label: "Genuine" },
  { v: "CHECK", label: "Check" },
  { v: "STOP", label: "Stop" },
]

function dot(verdict: Verdict) {
  const size = verdict === "GENUINE" ? 20 : verdict === "CHECK" ? 26 : 32
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="map-dot${verdict === "STOP" ? " pulse" : ""}" style="--dot:${verdictColor(verdict)}"></span>`,
  })
}

function ScanMap({ scans, regions }: { scans: Scan[]; regions: Region[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | undefined>(undefined)
  const layer = useRef<L.LayerGroup | undefined>(undefined)
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, {
      center: UGANDA,
      zoom: 7,
      minZoom: 6,
      maxZoom: 16,
      maxBounds: [[-3.2, 28.0], [5.2, 36.5]],
      maxBoundsViscosity: 0.8,
      scrollWheelZoom: false,
      zoomControl: false,
    })
    L.control.zoom({ position: "topright" }).addTo(m)
    // Scroll wheel zooms only after the map is clicked, so scrolling the page never gets stuck on it.
    m.on("click", () => m.scrollWheelZoom.enable())
    m.on("mouseout", () => m.scrollWheelZoom.disable())
    // Esri's light grey canvas: a quiet basemap that needs no API key, with place names on top.
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas"
    L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16,
      attribution: "Tiles © Esri · Esri, HERE, Garmin, © OpenStreetMap contributors",
    }).addTo(m)
    L.tileLayer(`${esri}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = undefined
    }
  }, [])

  useEffect(() => {
    const g = layer.current
    if (!g || !map.current) return
    g.clearLayers()
    for (const r of regions) {
      L.circle([r.center.lat, r.center.lng], { radius: r.radiusKm * 1000, color: "#0f5c47", weight: 1.25, opacity: 0.45, dashArray: "5 6", fillColor: "#0f5c47", fillOpacity: 0.06, interactive: false }).addTo(g)
      L.marker([r.center.lat, r.center.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "", html: `<span class="map-region-label">${r.name}</span>`, iconAnchor: [-6, 24] }),
      }).addTo(g)
    }
    // Draw the common GENUINE dots first so STOP and CHECK sit on top.
    const order: Verdict[] = ["GENUINE", "CHECK", "STOP"]
    for (const s of [...scans].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict))) {
      L.marker([s.lat!, s.lng!], { icon: dot(s.verdict), riseOnHover: true, keyboard: false })
        .bindTooltip(`<strong style="color:${verdictColor(s.verdict)}">${s.verdict}</strong> · ${s.batchCode ?? "unknown code"}<br><span style="color:#5b6168">${timeAgo(s.scannedAt)}</span>`, { direction: "top", offset: [0, -8], className: "scan-tip" })
        .addTo(g)
    }
    if (!fitted.current && scans.length) {
      map.current.fitBounds(L.latLngBounds(scans.map((s) => [s.lat!, s.lng!] as L.LatLngTuple)).pad(0.3), { maxZoom: 10 })
      fitted.current = true
    }
  }, [scans, regions])

  return (
    <div className="relative">
      <div ref={el} className="h-[min(640px,calc(100dvh-280px))] min-h-[420px] w-full" role="region" aria-label="Map of scans" />
      <ul className="pointer-events-none absolute bottom-6 left-3 z-[500] flex gap-3 rounded-control bg-surface/90 px-3 py-2 text-xs shadow-float backdrop-blur" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.v} className="inline-flex items-center gap-1.5 font-medium text-ink-2">
            <span className="inline-block size-2.5 rounded-full" style={{ background: verdictColor(l.v) }} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
