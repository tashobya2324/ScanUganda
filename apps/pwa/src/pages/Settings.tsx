import { useState, type ReactNode } from "react"
import { Banner, Button, Page, TopBar } from "../components/ui"
import { timeAgo, useT } from "../i18n"
import { notifyChange } from "../lib/bus"
import { db } from "../lib/db"
import { useInstall, useSyncState } from "../lib/net"
import { setPrefs, usePrefs } from "../lib/prefs"
import { refreshCache } from "../lib/sync"

function Row({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {help && <div className="text-sm text-ink-2">{help}</div>}
      </div>
      {children}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  )
}

export function Settings() {
  const { t } = useT()
  const prefs = usePrefs()
  const { cache, queued } = useSyncState()
  const install = useInstall()
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<string>()

  async function update() {
    setUpdating(true)
    setMessage(undefined)
    const r = await refreshCache().catch(() => "offline" as const)
    setMessage(r === "updated" ? t("settings.updatedOk") : t("settings.updateFail"))
    setUpdating(false)
  }

  async function clear() {
    await db.historyClear()
    notifyChange()
    setMessage(t("history.cleared"))
  }

  return (
    <Page>
      <TopBar title={t("settings.title")} back={false} />
      <main className="space-y-6 px-5 pt-4">
        <div className="divide-y divide-line-2 overflow-hidden rounded-panel border border-line bg-surface">
          <Row title={t("settings.language")}>
            <select aria-label={t("settings.language")} value={prefs.lang} onChange={(e) => setPrefs({ lang: e.target.value as "en" | "lg" })} className="h-11 rounded-control border border-line bg-surface px-3">
              <option value="en">English</option>
              <option value="lg">Luganda</option>
            </select>
          </Row>
          <Row title={t("settings.location")} help={t("settings.locationHelp")}>
            <Switch on={prefs.shareLocation} onChange={(v) => setPrefs({ shareLocation: v })} label={t("settings.location")} />
          </Row>
          <Row title={t("settings.shop")} help={t("settings.shopHelp")}>
            <Switch on={prefs.role === "retailer"} onChange={(v) => setPrefs({ role: v ? "retailer" : "consumer" })} label={t("settings.shop")} />
          </Row>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">{t("settings.offline")}</h2>
          <div className="space-y-3 rounded-panel border border-line bg-surface p-4">
            <p className="num">{cache ? t("settings.updated", { when: timeAgo(t, cache.syncedAt) }) : t("settings.never")}</p>
            {queued > 0 && <p className="text-sm text-ink-2">{t("status.waiting", { n: queued })}</p>}
            <Button onClick={update} disabled={updating}>{updating ? t("settings.updating") : t("settings.update")}</Button>
          </div>
        </section>

        {install && (
          <section className="space-y-2 rounded-panel border border-line bg-surface p-4">
            <p className="text-sm text-ink-2">{t("settings.installHelp")}</p>
            <Button variant="primary" onClick={() => void install.prompt()}>{t("settings.install")}</Button>
          </section>
        )}

        {message && <Banner role="status">{message}</Banner>}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-2">{t("settings.privacy")}</h2>
          <p className="text-sm text-ink-2">{t("settings.privacyBody")}</p>
        </section>

        <Button variant="ghost" onClick={clear} className="text-stop">{t("history.clear")}</Button>
        <p className="pb-4 text-center text-sm text-ink-2">{t("settings.version", { v: "0.1.0" })}</p>
      </main>
    </Page>
  )
}
