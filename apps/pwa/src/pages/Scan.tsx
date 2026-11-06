import { useCallback, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { Banner, Button, Icon } from "../components/ui"
import { Scanner, type CameraState } from "../components/Scanner"
import { useT } from "../i18n"
import { ApiError } from "../lib/api"
import { InputError, checkScan } from "../lib/scan"

export function Scan() {
  const { t } = useT()
  const nav = useNavigate()
  const [camera, setCamera] = useState<CameraState>("starting")
  const [notice, setNotice] = useState<string>()
  const [checking, setChecking] = useState(false)
  const busy = useRef(false)

  const onCode = useCallback(
    async (payload: string) => {
      if (busy.current) return
      busy.current = true
      setChecking(true)
      // Browsers refuse to vibrate before the user has tapped anything on the page.
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(40)
      try {
        const record = await checkScan({ payload })
        nav(`/result/${record.id}`, { replace: true })
      } catch (e) {
        setChecking(false)
        busy.current = false
        setNotice(e instanceof InputError ? t("scan.notOurs") : e instanceof ApiError && e.status === 429 ? t("common.rateLimited") : t("common.error"))
      }
    },
    [nav, t],
  )

  const failed = camera === "denied" || camera === "insecure" || camera === "unsupported"

  return (
    <div className="fixed inset-0 mx-auto max-w-md overflow-hidden bg-black text-white">
      {!failed && <Scanner onCode={onCode} onForeign={() => setNotice(t("scan.notOurs"))} onState={setCamera} />}

      <header className="absolute inset-x-0 top-0 z-10 flex h-14 items-center px-2">
        <Link to="/" aria-label={t("common.close")} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 active:bg-black/60">
          <Icon name="close" />
        </Link>
      </header>

      {!failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
          <div className="viewfinder relative aspect-square w-[68%] rounded-3xl border-2 border-white/90">
            {camera === "running" && !checking && <div className="absolute inset-x-3 top-3 bottom-3 overflow-hidden"><div className="h-0.5 animate-[sweep_2.4s_ease-in-out_infinite] bg-white/80" style={{ height: 2 }} /></div>}
          </div>
          <p role="status" className="relative mt-8 text-center text-base font-medium drop-shadow">
            {checking ? t("checking.title") : camera === "starting" ? t("scan.starting") : t("scan.hint")}
          </p>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex flex-col justify-center gap-4 bg-bg px-6 text-ink">
          <h1 className="text-2xl font-semibold">{t("scan.denied.title")}</h1>
          <p className="text-ink-2">{camera === "denied" ? t("scan.denied.body") : camera === "insecure" ? t("scan.insecure") : t("scan.unsupported")}</p>
          <Button variant="primary" onClick={() => nav("/type", { replace: true })}><Icon name="keyboard" /> {t("scan.type")}</Button>
        </div>
      )}

      {notice && !failed && (
        <div className="absolute inset-x-4 bottom-28 z-10 text-ink">
          <Banner tone="warn" role="alert">{notice}</Banner>
        </div>
      )}

      {!failed && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button onClick={() => nav("/type", { replace: true })} className="border-white/30 bg-black/50 text-white backdrop-blur active:bg-black/70">
            <Icon name="keyboard" /> {t("scan.type")}
          </Button>
        </div>
      )}
    </div>
  )
}
