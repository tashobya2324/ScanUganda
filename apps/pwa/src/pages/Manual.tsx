import { formatLookupCode, isValidLookupCode, normalizeLookupCode } from "@scanuganda/core"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Banner, Button, Page, TopBar } from "../components/ui"
import { useT } from "../i18n"
import { ApiError } from "../lib/api"
import { InputError, checkScan } from "../lib/scan"

export function Manual() {
  const { t } = useT()
  const nav = useNavigate()
  const [raw, setRaw] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const digits = normalizeLookupCode(raw).replace(/\D/g, "").slice(0, 12)
  const complete = digits.length === 12

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!complete) return
    if (!isValidLookupCode(digits)) return setError(t("manual.invalid")) // the check digit catches typos before any request
    setBusy(true)
    setError(undefined)
    try {
      const record = await checkScan({ code: digits })
      nav(`/result/${record.id}`, { replace: true })
    } catch (err) {
      setBusy(false)
      setError(err instanceof InputError ? t("manual.invalid") : err instanceof ApiError && err.status === 429 ? t("common.rateLimited") : t("common.error"))
    }
  }

  return (
    <Page nav={false}>
      <TopBar title={t("manual.title")} back="/" />
      <form onSubmit={submit} className="space-y-5 px-5 pt-6" noValidate>
        <p className="text-ink-2">{t("manual.help")}</p>
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">{t("manual.label")}</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="0000 0000 0000"
            value={formatLookupCode(digits)}
            onChange={(e) => { setRaw(e.target.value); setError(undefined) }}
            aria-invalid={!!error}
            aria-describedby="code-help"
            className={`num h-16 w-full rounded-control border bg-surface px-4 text-center font-mono text-2xl tracking-widest placeholder:text-ink-2/40 focus-visible:border-accent ${error ? "border-stop" : "border-line"}`}
          />
          <p id="code-help" className="mt-2 text-sm text-ink-2">{t("manual.incomplete", { n: digits.length })}</p>
        </div>
        {error && <Banner tone="bad" role="alert">{error}</Banner>}
        <Button variant="primary" type="submit" disabled={!complete || busy}>{busy ? t("checking.title") : t("manual.check")}</Button>
      </form>
    </Page>
  )
}
