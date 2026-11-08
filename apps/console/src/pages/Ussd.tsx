import { useRef, useState, type FormEvent } from "react"
import { Button, ErrorNote, Input, PageHeader, Panel } from "../components/ui"
import { api, type ApiError } from "../lib/api"
import { SERVICE_CODE, parseDial } from "../lib/ussd"

interface Screen {
  type: "CON" | "END"
  message: string
}
interface Exchange {
  sent: string
  reply: Screen
}

/**
 * Runs the real USSD menu through the staff-only simulator endpoint, with the
 * same chain-of-inputs protocol the aggregator uses, so what works here works
 * from a phone. Scans made here are real records (channel USSD).
 */
export function Ussd() {
  const [dial, setDial] = useState(`*${SERVICE_CODE}#`)
  const [chain, setChain] = useState<string[]>([])
  const [screen, setScreen] = useState<Screen>()
  const [log, setLog] = useState<Exchange[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ended = screen?.type === "END"
  const active = !!screen && !ended

  async function run(nextChain: string[], sent: string) {
    setBusy(true)
    setError(undefined)
    try {
      const reply = await api.ussd(nextChain.join("*"))
      setChain(nextChain)
      setScreen(reply)
      setLog((l) => [...l, { sent, reply }])
    } catch (e) {
      setError((e as ApiError).message)
    } finally {
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  function call(e: FormEvent) {
    e.preventDefault()
    const inputs = parseDial(dial)
    if (!inputs) return setError(`Dial *${SERVICE_CODE}# to open the menu, or *${SERVICE_CODE}*123456789012# to check a code directly.`)
    setLog([])
    void run(inputs, dial.trim())
  }

  function send(e: FormEvent) {
    e.preventDefault()
    if (!active || input === "") return
    const value = input
    setInput("")
    void run([...chain, value], value)
  }

  function reset() {
    setScreen(undefined)
    setChain([])
    setLog([])
    setError(undefined)
  }

  return (
    <>
      <PageHeader
        title="USSD simulator"
        subtitle="Try the menu feature-phone users get, without a phone or an aggregator account. It runs the real menu and records real scans."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          <Panel title="Handset">
            <form onSubmit={call} className="flex gap-2">
              <Input aria-label="Dial" value={dial} onChange={(e) => setDial(e.target.value)} className="font-mono" disabled={active} />
              <Button variant="primary" type="submit" disabled={busy || active} className="shrink-0">Call</Button>
            </form>

            <div className="mt-4 rounded-control border border-line bg-bg p-4">
              <div role="status" aria-live="polite" className="min-h-40 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {screen ? screen.message : <span className="text-ink-2">Press Call to start a session.</span>}
              </div>
              {screen && (
                <div className="mt-3 flex items-center justify-between text-xs text-ink-2">
                  <span className="num">{screen.message.length} / 160 characters</span>
                  <span>{ended ? "Session ended" : "Session open"}</span>
                </div>
              )}
            </div>

            {active && (
              <form onSubmit={send} className="mt-4 flex gap-2">
                <Input ref={inputRef} aria-label="Your reply" inputMode="numeric" autoComplete="off" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a reply" className="font-mono" />
                <Button variant="primary" type="submit" disabled={busy || input === ""} className="shrink-0">Send</Button>
              </form>
            )}
            {(ended || (screen && active)) && (
              <button onClick={reset} className="mt-3 text-sm text-accent underline-offset-2 hover:underline">
                {ended ? "Start a new session" : "End session"}
              </button>
            )}
            {error && <div className="mt-4"><ErrorNote error={error} /></div>}
          </Panel>

          <Panel title="Dial strings">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-mono font-medium">*{SERVICE_CODE}#</dt>
                <dd className="text-ink-2">Opens the menu.</dd>
              </div>
              <div>
                <dt className="font-mono font-medium">*{SERVICE_CODE}*123456789012#</dt>
                <dd className="text-ink-2">Skips the menu and goes straight to a code, then asks where you are.</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-ink-2">
              You need a real 12-digit code: generate some on a batch page (they are shown once), or use the demo codes in <span className="font-mono">apps/api/data/demo-codes.json</span>.
            </p>
          </Panel>
        </div>

        <Panel title="What was sent" className="self-start">
          {log.length === 0 ? (
            <p className="text-ink-2">Each step shows what the phone sent and what the server answered. The aggregator sends the whole chain of inputs every time, joined by <span className="font-mono">*</span>.</p>
          ) : (
            <ol className="space-y-4">
              {log.map((x, i) => (
                <li key={i}>
                  <div className="text-xs text-ink-2">Phone sent</div>
                  <div className="font-mono text-sm font-medium">{x.sent}</div>
                  <div className="mt-2 text-xs text-ink-2">Server replied</div>
                  <pre className="whitespace-pre-wrap rounded-control bg-bg px-3 py-2 font-mono text-sm">{`${x.reply.type} ${x.reply.message}`}</pre>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  )
}
