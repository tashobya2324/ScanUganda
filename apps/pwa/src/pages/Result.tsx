import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Banner, Button, Icon, VERDICT_BG, VERDICT_HEX, VerdictShape, type MarkVerdict } from "../components/ui"
import { formatDate, useT, type StringKey } from "../i18n"
import { db, type ScanRecord } from "../lib/db"
import { useDataVersion } from "../lib/bus"

export function Result() {
  const { id = "" } = useParams()
  const { t } = useT()
  const nav = useNavigate()
  const version = useDataVersion() // re-reads if a sync changes this record while it is open
  const [record, setRecord] = useState<ScanRecord | null | undefined>()

  useEffect(() => {
    let live = true
    void db.historyGet(id).then((r) => live && setRecord(r ?? null))
    return () => { live = false }
  }, [id, version])

  if (record === undefined) return <div className="min-h-dvh bg-bg" aria-busy="true" />
  if (record === null) {
    return (
      <div className="mx-auto min-h-dvh max-w-md space-y-4 bg-bg px-6 pt-20">
        <p>{t("result.notFound")}</p>
        <Button variant="primary" onClick={() => nav("/", { replace: true })}>{t("result.scanAnother")}</Button>
      </div>
    )
  }

  const verdict: MarkVerdict = record.verdict ?? "PENDING"
  const rejected = record.status === "rejected"
  const key = (part: "word" | "title" | "body") => `verdict.${verdict}.${part}` as StringKey
  const p = record.product

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <section className={`${rejected ? "bg-pending" : VERDICT_BG[verdict]} relative px-6 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-white`}>
        <div className="flex h-12 items-center justify-between">
          <Link to="/" aria-label={t("common.close")} className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full active:bg-white/15"><Icon name="close" /></Link>
          <span className="text-sm font-medium opacity-90">{new Date(record.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="pop"><VerdictShape verdict={rejected ? "PENDING" : verdict} size={104} fill="#fff" ink={VERDICT_HEX[rejected ? "PENDING" : verdict]} /></div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] opacity-90">{rejected ? "" : t(key("word"))}</p>
          <h1 role="status" className="rise mt-1 text-3xl font-semibold">{rejected ? t("result.rejected") : t(key("title"))}</h1>
          <p className="rise mt-2 max-w-xs text-white/90" style={{ animationDelay: "80ms" }}>{rejected ? record.reasons[0]?.message : t(key("body"))}</p>
        </div>
      </section>

      <section className="flex-1 space-y-5 px-5 pb-40 pt-6">
        {record.status === "offline" && <Banner tone="warn" icon="offline">{t("result.offlineNote")}</Banner>}

        {record.reasons.length > 0 && !rejected && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">{t("result.why")}</h2>
            <ul className="space-y-2">
              {record.reasons.map((r, i) => (
                <li key={i} className="rounded-control border border-line bg-surface px-4 py-3">{r.message}</li>
              ))}
            </ul>
          </div>
        )}

        {p && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">{t("result.product")}</h2>
            <div className="rounded-panel border border-line bg-surface p-4">
              <div className="text-lg font-semibold">{p.productName}</div>
              <div className="text-ink-2">{p.packSize}</div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact k={t("result.maker")} v={p.manufacturer} />
                <Fact k={t("result.batch")} v={p.batchCode} mono />
                <Fact k={t("result.made")} v={formatDate(p.manufacturedAt)} />
                <Fact k={t("result.expires")} v={formatDate(p.expiresAt)} />
              </dl>
            </div>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md space-y-2 border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button variant="primary" onClick={() => nav("/scan", { replace: true })}><Icon name="scan" /> {t("result.scanAnother")}</Button>
        {!rejected && record.verdict !== "GENUINE" && <Button onClick={() => nav("/report", { state: { scanId: record.serverScanId } })}>{t("result.report")}</Button>}
      </div>
    </div>
  )
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-ink-2">{k}</dt>
      <dd className={`font-medium ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  )
}
