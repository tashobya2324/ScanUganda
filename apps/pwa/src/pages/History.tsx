import { useEffect, useState } from "react"
import { Page, TopBar } from "../components/ui"
import { useT } from "../i18n"
import { useDataVersion } from "../lib/bus"
import { db, type ScanRecord } from "../lib/db"
import { HistoryRow } from "./Home"

export function History() {
  const { t } = useT()
  const version = useDataVersion()
  const [rows, setRows] = useState<ScanRecord[] | undefined>()

  useEffect(() => {
    let live = true
    void db.historyAll().then((r) => live && setRows(r))
    return () => { live = false }
  }, [version])

  return (
    <Page>
      <TopBar title={t("history.title")} back={false} />
      <main className="px-5 pt-4">
        {rows && rows.length === 0 && <p className="rounded-control border border-dashed border-line px-4 py-8 text-center text-ink-2">{t("history.empty")}</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-line-2 overflow-hidden rounded-panel border border-line bg-surface">
            {rows.map((r) => <HistoryRow key={r.id} r={r} />)}
          </ul>
        )}
      </main>
    </Page>
  )
}
