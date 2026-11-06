import { useState, type FormEvent } from "react"
import { useLocation } from "react-router"
import { Banner, Button, Page, TopBar } from "../components/ui"
import { useT } from "../i18n"
import { ApiError, api } from "../lib/api"
import { getPosition } from "../lib/geo"
import { useOnline } from "../lib/net"

const field = "w-full rounded-control border border-line bg-surface px-4 py-3 text-base placeholder:text-ink-2/50 focus-visible:border-accent"

export function Report() {
  const { t } = useT()
  const online = useOnline()
  const scanId = (useLocation().state as { scanId?: string } | null)?.scanId
  const [description, setDescription] = useState("")
  const [shop, setShop] = useState("")
  const [contact, setContact] = useState("")
  const [withLocation, setWithLocation] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (description.trim().length < 10) return setError(t("report.tooShort"))
    setBusy(true)
    setError(undefined)
    try {
      const position = withLocation ? await getPosition() : undefined
      await api.report({
        description: description.trim(),
        shopName: shop.trim() || undefined,
        contact: contact.trim() || undefined,
        position,
        scanId,
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError && err.unreachable ? t("report.offline") : t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Page>
        <TopBar title={t("report.title")} back={false} />
        <main className="space-y-5 px-5 pt-8">
          <Banner tone="info" role="status">{t("report.thanks")}</Banner>
          <Button onClick={() => { setSent(false); setDescription("") }}>{t("report.another")}</Button>
        </main>
      </Page>
    )
  }

  return (
    <Page>
      <TopBar title={t("report.title")} back={false} />
      <form onSubmit={submit} className="space-y-5 px-5 pt-5" noValidate>
        <p className="text-ink-2">{t("report.lead")}</p>
        <div>
          <label htmlFor="what" className="mb-1.5 block text-sm font-medium">{t("report.what")}</label>
          <textarea id="what" rows={5} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="what-hint" className={field} />
          <p id="what-hint" className="mt-1.5 text-sm text-ink-2">{t("report.whatHint")}</p>
        </div>
        <div>
          <label htmlFor="shop" className="mb-1.5 block text-sm font-medium">{t("report.shop")}</label>
          <input id="shop" value={shop} onChange={(e) => setShop(e.target.value)} maxLength={200} className={field} />
        </div>
        <div>
          <label htmlFor="contact" className="mb-1.5 block text-sm font-medium">{t("report.contact")}</label>
          <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} aria-describedby="contact-hint" className={field} />
          <p id="contact-hint" className="mt-1.5 text-sm text-ink-2">{t("report.contactHint")}</p>
        </div>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} className="h-5 w-5 accent-accent" />
          {t("report.location")}
        </label>
        {!online && <Banner tone="warn" icon="offline">{t("report.offline")}</Banner>}
        {error && <Banner tone="bad" role="alert">{error}</Banner>}
        <Button variant="primary" type="submit" disabled={busy}>{busy ? t("report.sending") : t("report.send")}</Button>
      </form>
    </Page>
  )
}
