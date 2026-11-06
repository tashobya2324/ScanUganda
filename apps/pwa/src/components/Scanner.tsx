import { parsePayload } from "@scanuganda/core"
import { useEffect, useRef, useState } from "react"

export type CameraState = "starting" | "running" | "denied" | "insecure" | "unsupported"

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
declare global {
  interface Window {
    BarcodeDetector?: { new (opts?: { formats: string[] }): BarcodeDetectorLike }
  }
}

/**
 * Live camera QR reader. Calls `onCode` once with a ScanUganda payload, or
 * `onForeign` (rate-limited) when it sees a QR that is not ours, e.g. a
 * website link, so the shopper is told why nothing happened.
 */
export function Scanner({ onCode, onForeign, onState }: { onCode: (payload: string) => void; onForeign: () => void; onState: (s: CameraState) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [, setTick] = useState(0)
  const cb = useRef({ onCode, onForeign, onState })
  cb.current = { onCode, onForeign, onState }

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    let raf = 0
    let lastForeign = 0
    let lastForeignValue = ""

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return cb.current.onState("insecure")
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false })
      } catch (e) {
        const name = (e as DOMException).name
        return cb.current.onState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported")
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())
      const el = video.current
      if (!el) return
      el.srcObject = stream
      await el.play().catch(() => {})
      cb.current.onState("running")

      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null
      const jsQR = native ? null : (await import("jsqr")).default
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d", { willReadFrequently: true })

      const handle = (value: string): boolean => {
        if (parsePayload(value)) {
          cb.current.onCode(value.trim())
          return true
        }
        const now = Date.now()
        if (value !== lastForeignValue || now - lastForeign > 3000) {
          lastForeign = now
          lastForeignValue = value
          cb.current.onForeign()
        }
        return false
      }

      let busy = false
      const loop = async () => {
        if (stopped) return
        if (!busy && el.readyState >= 2 && el.videoWidth > 0) {
          busy = true
          try {
            let value: string | undefined
            if (native) {
              value = (await native.detect(el))[0]?.rawValue
            } else if (ctx && jsQR) {
              // Downscale: decoding a 1280px frame on a cheap phone is slow and unnecessary.
              const scale = Math.min(1, 640 / el.videoWidth)
              canvas.width = Math.round(el.videoWidth * scale)
              canvas.height = Math.round(el.videoHeight * scale)
              ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              value = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data
            }
            if (value && handle(value)) return // found ours: stop scanning
          } catch {
            // a bad frame: try the next one
          } finally {
            busy = false
          }
        }
        raf = window.setTimeout(loop, 120) // ~8 frames/s is plenty and spares the battery
      }
      void loop()
    }

    void start()
    setTick(1)
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" aria-label="Camera view" />
}
