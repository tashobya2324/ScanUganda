import { useState } from "react"
import { useT, type StringKey } from "../i18n"
import { installPlatform, isStandalone, useInstall } from "../lib/net"
import { Button, Icon } from "./ui"

/**
 * "Download the app" card. Where the browser offers a real install prompt (Chrome, Edge, Samsung
 * Internet) the button installs in one tap; elsewhere (iPhone Safari, Firefox) it shows the steps.
 * Hidden once the app runs from the home screen.
 */
export function InstallCard({ dark = false }: { dark?: boolean }) {
  const { t } = useT()
  const install = useInstall()
  const [steps, setSteps] = useState(false)
  if (isStandalone()) return null

  const platform = installPlatform()
  const count = platform === "other" ? 2 : 3

  return (
    <section
      aria-labelledby="install-title"
      className={`rounded-panel p-4 ${dark ? "bg-white/10 text-white ring-1 ring-white/15" : "border border-line bg-surface"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dark ? "bg-white text-accent" : "bg-accent text-accent-ink"}`}>
          <Icon name="download" size={24} />
        </span>
        <div className="min-w-0">
          <h2 id="install-title" className="text-base font-semibold">{t("install.title")}</h2>
          <p className={`text-sm ${dark ? "text-white/80" : "text-ink-2"}`}>{t("install.lead")}</p>
        </div>
      </div>

      <Button
        variant={dark ? "secondary" : "primary"}
        className="mt-3"
        onClick={() => (install ? void install.prompt() : setSteps((s) => !s))}
        aria-expanded={install ? undefined : steps}
      >
        <Icon name="download" size={20} /> {t("install.button")}
      </Button>

      {!install && steps && (
        <ol className={`mt-3 list-decimal space-y-1.5 pl-5 text-sm ${dark ? "text-white/90" : "text-ink"}`}>
          {Array.from({ length: count }, (_, i) => (
            <li key={i}>{t(`install.${platform}.${i + 1}` as StringKey)}</li>
          ))}
        </ol>
      )}
      {install && (
        <button onClick={() => setSteps((s) => !s)} className={`mt-2 w-full text-center text-sm underline underline-offset-2 ${dark ? "text-white/80" : "text-ink-2"}`}>
          {t("install.how")}
        </button>
      )}
      {install && steps && (
        <ol className={`mt-2 list-decimal space-y-1.5 pl-5 text-sm ${dark ? "text-white/90" : "text-ink"}`}>
          {Array.from({ length: count }, (_, i) => (
            <li key={i}>{t(`install.${platform}.${i + 1}` as StringKey)}</li>
          ))}
        </ol>
      )}
    </section>
  )
}
