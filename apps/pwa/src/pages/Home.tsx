import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { InstallCard } from "../components/Install"
import { Banner, Button, Icon, Page, VerdictBadge } from "../components/ui"
import { timeAgo, useT } from "../i18n"
import { useDataVersion } from "../lib/bus"
import { db, type ScanRecord } from "../lib/db"
import { useOnline, useSyncState } from "../lib/net"
import { STALE_AFTER_MS } from "../lib/sync"

export function Home() {
  const { t } = useT()
  const nav = useNavigate()
  const online = useOnline()
  const { cache, queued, ready } = useSyncState()
  const version = useDataVersion()
  const [recent, setRecent] = useState<ScanRecord[]>([])

  useEffect(() => {
    let live = true
    void db.historyAll(20).then((r) => live && setRecent(r))
    return () => { live = false }
  }, [version])

  const worsened = recent.filter((r) => r.worsened)
  const staleDays = cache && Date.now() - cache.syncedAt > STALE_AFTER_MS ? Math.floor((Date.now() - cache.syncedAt) / 86_400_000) : 0

  return (
    <Page>
      <header className="rounded-b-[28px] bg-accent px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-accent-ink">
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="30" height="30" className="rounded-lg bg-white p-0.5" />
          <span className="flex-1 text-lg font-semibold">ScanUganda</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium" role="status">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-[#7ee2b0]" : "bg-[#ffd08a]"}`} />
            {online ? t("status.online") : t("status.offlineShort")}
          </span>
        </div>
        <div className="mt-6 space-y-1.5">
          <h1 className="text-3xl font-semibold">{t("home.title")}</h1>
          <p className="max-w-xs text-white/80">{t("home.lead")}</p>
        </div>
        <div className="mt-5 space-y-3">
          <Button onClick={() => nav("/scan")} className="min-h-14 border-0 text-lg text-accent"><Icon name="scan" size={24} /> {t("home.scan")}</Button>
          <Button variant="ghost" onClick={() => nav("/type")} className="text-white active:bg-white/10"><Icon name="keyboard" /> {t("home.type")}</Button>
        </div>
      </header>

      <main className="space-y-6 px-5 pb-6 pt-5">
        <InstallCard />

        <div className="space-y-3">
          {!online && <Banner tone="warn" icon="offline" role="status">{t("status.offline")}</Banner>}
          {queued > 0 && <Banner role="status">{t("status.waiting", { n: queued })}</Banner>}
          {ready && !cache && online && <Banner>{t("status.noList")}</Banner>}
          {ready && !cache && !online && <Banner tone="warn">{t("status.noList")}</Banner>}
          {staleDays > 0 && <Banner tone="warn">{t("status.stale", { days: staleDays })}</Banner>}
        </div>

        {worsened.length > 0 && (
          <section aria-labelledby="attn">
            <h2 id="attn" className="mb-2 text-sm font-semibold text-stop">{t("home.attention")}</h2>
            <ul className="space-y-2">
              {worsened.map((r) => (
                <li key={r.id}>
                  <Link to={`/result/${r.id}`} className="block rounded-control border border-stop/30 bg-stop-soft px-4 py-3 text-stop">
                    {t("home.worsened", { item: r.product ? `${r.product.productName} (${r.label})` : r.label })}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="recent">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="recent" className="text-sm font-semibold text-ink-2">{t("home.recent")}</h2>
            {recent.length > 0 && <Link to="/history" className="text-sm font-medium text-accent">{t("home.seeAll")}</Link>}
          </div>
          {recent.length === 0 ? (
            <p className="rounded-control border border-dashed border-line px-4 py-6 text-center text-ink-2">{t("home.empty")}</p>
          ) : (
            <ul className="divide-y divide-line-2 overflow-hidden rounded-panel border border-line bg-surface">
              {recent.slice(0, 3).map((r) => <HistoryRow key={r.id} r={r} />)}
            </ul>
          )}
        </section>
      </main>
    </Page>
  )
}

export function HistoryRow({ r }: { r: ScanRecord }) {
  const { t } = useT()
  return (
    <li>
      <Link to={`/result/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-line-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{r.product?.productName ?? r.label}</div>
          <div className="num text-sm text-ink-2">
            {timeAgo(t, r.at)}
            {r.status === "offline" && <> · {t("history.offline")}</>}
            {r.status === "waiting" && <> · {t("history.waiting")}</>}
          </div>
        </div>
        <VerdictBadge verdict={r.verdict ?? "PENDING"} />
        <span className="text-ink-2"><Icon name="chevron" size={18} /></span>
      </Link>
    </li>
  )
}
