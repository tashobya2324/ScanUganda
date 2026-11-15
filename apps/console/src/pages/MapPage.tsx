import L from "leaflet"
import { useEffect, useRef, useState } from "react"
import { Button, ErrorNote, PageHeader, Panel, VerdictMark, cx, verdictColor } from "../components/ui"
import { api } from "../lib/api"
import { timeAgo } from "../lib/format"
import { useLoad } from "../lib/hooks"
import type { Region, Scan, Verdict } from "../lib/types"

const UGANDA: L.LatLngTuple = [1.37, 32.29]
type View = "markers" | "heat" | "both"
const VIEWS: { id: View; label: string }[] = [
  { id: "markers", label: "Markers" },
  { id: "heat", label: "Heatmap" },
  { id: "both", label: "Both" },
]

export function MapPage() {
  const scans = useLoad(() => api.scans({ limit: 500 }), [], 10_000)
  const regions = useLoad(api.regions)
  const [show, setShow] = useState<Record<Verdict, boolean>>({ GENUINE: true, CHECK: true, STOP: true })
  const [view, setView] = useState<View>("markers")
  const [full, setFull] = useState(false)
  const shell = useRef<HTMLDivElement>(null)
  const located = (scans.data ?? []).filter((s) => s.lat !== null && s.lng !== null)
  const visible = located.filter((s) => show[s.verdict])

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === shell.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen?.()
  }

  return (
    <>
      <PageHeader title="Map" subtitle="Where products are being checked. Switch the map style, view a heatmap of where checks (and risky ones) cluster, or go full screen." />
      {scans.error && <ErrorNote error={scans.error} retry={scans.reload} />}
      <div ref={shell} className={cx("bg-bg", full && "flex h-screen flex-col")}>
        <Panel flush className={cx("overflow-hidden shadow-float", full && "flex min-h-0 flex-1 flex-col rounded-none border-0")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-2 px-4 py-2.5" role="group" aria-label="Show on map">
            {(["STOP", "CHECK", "GENUINE"] as Verdict[]).map((v) => (
              <label key={v} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={show[v]} onChange={() => setShow({ ...show, [v]: !show[v] })} className="accent-accent" />
                <VerdictMark verdict={v} size={14} />
                <span className="num text-ink-2">{located.filter((s) => s.verdict === v).length}</span>
              </label>
            ))}
            <div className="inline-flex overflow-hidden rounded-control border border-line text-sm" role="radiogroup" aria-label="Map view">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={view === v.id}
                  onClick={() => setView(v.id)}
                  className={cx("px-3 py-1.5 font-medium transition-colors", view === v.id ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 hover:bg-line-2")}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="ml-auto hidden text-sm text-ink-2 md:inline">{(scans.data?.length ?? 0) - located.length} scans without a location are not shown</span>
            <Button onClick={toggleFull}>{full ? "Exit full screen" : "Full screen"}</Button>
          </div>
          <ScanMap scans={visible} regions={regions.data ?? []} view={view} full={full} />
        </Panel>
      </div>
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

/* ---------- heatmap: a small canvas layer, no extra library ---------- */

interface HeatPoint {
  lat: number
  lng: number
  w: number
}

/** Genuine checks show where products are used; check and stop pull the heat towards red. */
const WEIGHT: Record<Verdict, number> = { GENUINE: 0.25, CHECK: 0.6, STOP: 1 }

function palette(): Uint8ClampedArray {
  const c = document.createElement("canvas")
  c.width = 1
  c.height = 256
  const g = c.getContext("2d")!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, "rgba(254,243,199,0)")
  grad.addColorStop(0.2, "rgba(253,224,71,0.55)")
  grad.addColorStop(0.45, "rgba(245,158,11,0.8)")
  grad.addColorStop(0.7, "rgba(220,38,38,0.9)")
  grad.addColorStop(1, "rgba(127,29,29,0.95)")
  g.fillStyle = grad
  g.fillRect(0, 0, 1, 256)
  return g.getImageData(0, 0, 1, 256).data
}

function heatLayer(points: HeatPoint[]): L.Layer {
  const colors = palette()
  let map: L.Map | undefined
  const canvas = document.createElement("canvas")
  canvas.className = "leaflet-heat-layer"
  canvas.style.pointerEvents = "none"

  const draw = () => {
    if (!map) return
    const size = map.getSize()
    canvas.width = size.x
    canvas.height = size.y
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))
    const radius = 20 + Math.max(0, map.getZoom() - 6) * 5
    const blur = document.createElement("canvas")
    blur.width = size.x
    blur.height = size.y
    const bg = blur.getContext("2d")!
    const stamp = document.createElement("canvas")
    stamp.width = stamp.height = radius * 2
    const sg = stamp.getContext("2d")!
    const grad = sg.createRadialGradient(radius, radius, 0, radius, radius, radius)
    grad.addColorStop(0, "rgba(0,0,0,1)")
    grad.addColorStop(1, "rgba(0,0,0,0)")
    sg.fillStyle = grad
    sg.fillRect(0, 0, radius * 2, radius * 2)
    for (const p of points) {
      const pt = map.latLngToContainerPoint([p.lat, p.lng])
      if (pt.x < -radius || pt.y < -radius || pt.x > size.x + radius || pt.y > size.y + radius) continue
      bg.globalAlpha = 0.05 + p.w * 0.13
      bg.drawImage(stamp, pt.x - radius, pt.y - radius)
    }
    const img = bg.getImageData(0, 0, size.x, size.y)
    const d = img.data
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i]!
      if (!a) continue
      const j = Math.min(255, a) * 4
      d[i - 3] = colors[j]!
      d[i - 2] = colors[j + 1]!
      d[i - 1] = colors[j + 2]!
      d[i] = colors[j + 3]!
    }
    canvas.getContext("2d")!.putImageData(img, 0, 0)
  }

  const layer = L.Layer.extend({
    onAdd(m: L.Map) {
      map = m
      m.getPanes().overlayPane.appendChild(canvas)
      m.on("moveend zoomend resize", draw)
      draw()
      return this
    },
    onRemove(m: L.Map) {
      m.off("moveend zoomend resize", draw)
      canvas.remove()
      map = undefined
      return this
    },
  })
  return new layer()
}

/* ---------- base maps ---------- */

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
const tiles = (path: string, maxZoom = 16) => L.tileLayer(`${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`, { maxZoom })
const ESRI_CREDIT = "Tiles © Esri · Esri, HERE, Garmin, © OpenStreetMap contributors"

function baseMaps(): Record<string, L.Layer> {
  return {
    Light: L.layerGroup([tiles("Canvas/World_Light_Gray_Base"), tiles("Canvas/World_Light_Gray_Reference")]),
    Streets: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }),
    Satellite: L.layerGroup([tiles("World_Imagery", 17), tiles("Reference/World_Boundaries_and_Places", 17)]),
    Terrain: tiles("World_Topo_Map"),
    Dark: L.layerGroup([tiles("Canvas/World_Dark_Gray_Base"), tiles("Canvas/World_Dark_Gray_Reference")]),
  }
}

function ScanMap({ scans, regions, view, full }: { scans: Scan[]; regions: Region[]; view: View; full: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | undefined>(undefined)
  const layer = useRef<L.LayerGroup | undefined>(undefined)
  const heat = useRef<L.Layer | undefined>(undefined)
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, {
      center: UGANDA,
      zoom: 7,
      minZoom: 6,
      maxZoom: 17,
      maxBounds: [[-3.2, 28.0], [5.2, 36.5]],
      maxBoundsViscosity: 0.8,
      scrollWheelZoom: false,
      zoomControl: false,
      zoomAnimation: false, // the heatmap canvas is redrawn after each zoom, so skip the animated zoom
      attributionControl: true,
    })
    m.attributionControl.addAttribution(ESRI_CREDIT + " · © OpenStreetMap")
    L.control.zoom({ position: "topright" }).addTo(m)
    const bases = baseMaps()
    bases.Light!.addTo(m)
    L.control.layers(bases, undefined, { position: "topright", collapsed: true }).addTo(m)
    // Scroll wheel zooms only after the map is clicked, so scrolling the page never gets stuck on it.
    m.on("click", () => m.scrollWheelZoom.enable())
    m.on("mouseout", () => m.scrollWheelZoom.disable())
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = undefined
      heat.current = undefined
    }
  }, [])

  // Full screen changes the size of the container.
  useEffect(() => {
    const id = setTimeout(() => map.current?.invalidateSize(), 60)
    return () => clearTimeout(id)
  }, [full])

  useEffect(() => {
    const g = layer.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    for (const r of regions) {
      L.circle([r.center.lat, r.center.lng], { radius: r.radiusKm * 1000, color: "#0f5c47", weight: 1.25, opacity: 0.45, dashArray: "5 6", fillColor: "#0f5c47", fillOpacity: 0.06, interactive: false }).addTo(g)
      L.marker([r.center.lat, r.center.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "", html: `<span class="map-region-label">${r.name}</span>`, iconAnchor: [-6, 24] }),
      }).addTo(g)
    }
    if (view !== "heat") {
      // Draw the common GENUINE dots first so STOP and CHECK sit on top.
      const order: Verdict[] = ["GENUINE", "CHECK", "STOP"]
      for (const s of [...scans].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict))) {
        L.marker([s.lat!, s.lng!], { icon: dot(s.verdict), riseOnHover: true, keyboard: false })
          .bindTooltip(`<strong style="color:${verdictColor(s.verdict)}">${s.verdict}</strong> · ${s.batchCode ?? "unknown code"}<br><span style="color:#5b6168">${timeAgo(s.scannedAt)}</span>`, { direction: "top", offset: [0, -8], className: "scan-tip" })
          .addTo(g)
      }
    }
    if (heat.current) m.removeLayer(heat.current)
    heat.current = undefined
    if (view !== "markers" && scans.length) {
      heat.current = heatLayer(scans.map((s) => ({ lat: s.lat!, lng: s.lng!, w: WEIGHT[s.verdict] }))).addTo(m)
    }
    if (!fitted.current && scans.length) {
      m.fitBounds(L.latLngBounds(scans.map((s) => [s.lat!, s.lng!] as L.LatLngTuple)).pad(0.3), { maxZoom: 10 })
      fitted.current = true
    }
  }, [scans, regions, view])

  return (
    <div className={cx("relative", full && "min-h-0 flex-1")}>
      <div ref={el} className={cx("w-full", full ? "h-full" : "h-[min(640px,calc(100dvh-280px))] min-h-[420px]")} role="region" aria-label="Map of scans" />
      <ul className="pointer-events-none absolute bottom-6 left-3 z-[500] flex flex-col gap-1.5 rounded-control bg-surface/90 px-3 py-2 text-xs shadow-float backdrop-blur" aria-label="Legend">
        {view === "heat" ? (
          <li className="flex items-center gap-2 font-medium text-ink-2">
            <span>Fewer</span>
            <span className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(90deg,#fde68a,#f59e0b,#dc2626,#7f1d1d)" }} />
            <span>More, riskier</span>
          </li>
        ) : (
          <li className="flex gap-3">
            {LEGEND.map((l) => (
              <span key={l.v} className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                <span className="inline-block size-2.5 rounded-full" style={{ background: verdictColor(l.v) }} />
                {l.label}
              </span>
            ))}
          </li>
        )}
      </ul>
    </div>
  )
}
