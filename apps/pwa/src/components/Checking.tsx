import { useEffect, useState } from "react"
import { useT, type StringKey } from "../i18n"

const STEPS: StringKey[] = ["checking.step1", "checking.step2", "checking.step3", "checking.step4"]

/** The least time the loader stays up, so the answer feels checked, not flashed. */
export const MIN_CHECK_MS = 1300
export const pause = (ms = MIN_CHECK_MS) => new Promise<void>((r) => setTimeout(r, ms))

/** Full-screen loader shown while a code is being checked. */
export function Checking() {
  const { t } = useT()
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650)
    return () => clearInterval(id)
  }, [])

  return (
    <div role="status" aria-live="polite" className="rise fixed inset-0 z-50 mx-auto flex max-w-md flex-col items-center justify-center bg-gradient-to-b from-accent to-[#0a3d30] px-8 text-center text-white">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
        <span className="absolute inset-3 rounded-full border-2 border-white/15" />
        <span className="absolute inset-3 animate-spin rounded-full border-2 border-transparent border-t-white" style={{ animationDuration: "1s" }} />
        <svg width="64" height="64" viewBox="0 0 32 32" aria-hidden="true" className="relative">
          <path d="M9 12V9.5A.5.5 0 0 1 9.5 9H12M20 9h2.5a.5.5 0 0 1 .5.5V12M23 20v2.5a.5.5 0 0 1-.5.5H20M12 23H9.5a.5.5 0 0 1-.5-.5V20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <path d="m12.5 16 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="mt-10 text-2xl font-semibold">{t("checking.title")}</h1>
      <p key={step} className="rise mt-2 h-6 text-white/85">{t(STEPS[step]!)}</p>
      <div className="mt-8 flex gap-2" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-8 bg-white" : "w-3 bg-white/30"}`} />
        ))}
      </div>
    </div>
  )
}
