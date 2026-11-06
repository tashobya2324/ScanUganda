import { generateLookupCode, formatLookupCode } from "@scanuganda/core"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { translate } from "./i18n"
import { api, ApiError } from "./lib/api"
import { db, type ScanRecord } from "./lib/db"
import { Home } from "./pages/Home"
import { Manual } from "./pages/Manual"
import { Result } from "./pages/Result"
import { freshDatabase, NOW, outcome } from "./test-utils"

vi.mock("./lib/geo", () => ({ getPosition: async () => undefined }))

beforeEach(freshDatabase)
afterEach(() => vi.restoreAllMocks())

const base: ScanRecord = { id: "r1", at: NOW, source: "qr", label: "QR · 1", status: "confirmed", verdict: "GENUINE", reasons: [], product: outcome("GENUINE").product, serverScanId: "s1" }
const renderAt = (path: string, ui: React.ReactElement, route = path) =>
  render(<MemoryRouter initialEntries={[route]}><Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter>)

describe("i18n", () => {
  it("fills slots and falls back to English when a key is not translated", () => {
    expect(translate("en", "status.waiting", { n: 3 })).toBe("3 waiting to be checked")
    expect(translate("lg", "verdict.STOP.title")).toBe("Do not buy or use")
  })
})

describe("Manual entry", () => {
  const type = (v: string) => fireEvent.change(screen.getByLabelText("12-digit code"), { target: { value: v } })

  it("groups digits in fours, strips letters, and enables Check only at 12 digits", () => {
    renderAt("/type", <Manual />)
    const button = screen.getByRole("button", { name: "Check code" })
    type("1234abc5678")
    expect(screen.getByLabelText("12-digit code")).toHaveValue("1234 5678")
    expect(button).toBeDisabled()
    expect(screen.getByText("8 of 12 digits")).toBeInTheDocument()
    type("123456789012")
    expect(button).toBeEnabled()
  })

  it("catches a typo with the check digit and never contacts the server", () => {
    const verify = vi.spyOn(api, "verify")
    renderAt("/type", <Manual />)
    const good = generateLookupCode()
    type(good.slice(0, 11) + String((Number(good[11]) + 1) % 10))
    fireEvent.click(screen.getByRole("button", { name: "Check code" }))
    expect(screen.getByRole("alert")).toHaveTextContent("does not look right")
    expect(verify).not.toHaveBeenCalled()
  })

  it("checks a valid code and goes to the result", async () => {
    vi.spyOn(api, "verify").mockResolvedValue(outcome("GENUINE") as never)
    renderAt("/type", <Manual />)
    type(formatLookupCode(generateLookupCode()))
    fireEvent.click(screen.getByRole("button", { name: "Check code" }))
    expect(await screen.findByText("elsewhere")).toBeInTheDocument() // navigated to /result/:id
    expect(await db.historyAll()).toHaveLength(1)
  })

  it("explains a rate limit in plain words", async () => {
    vi.spyOn(api, "verify").mockRejectedValue(new ApiError(429, "RATE_LIMITED", "x"))
    renderAt("/type", <Manual />)
    type(generateLookupCode())
    fireEvent.click(screen.getByRole("button", { name: "Check code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many checks")
  })
})

describe("Result screen", () => {
  const show = async (r: ScanRecord) => {
    await db.historyPut(r)
    renderAt("/result/:id", <Result />, `/result/${r.id}`)
  }

  it("GENUINE says the word, the title and shows the product", async () => {
    await show(base)
    expect(await screen.findByRole("status")).toHaveTextContent("Safe to buy")
    expect(screen.getByText("Genuine")).toBeInTheDocument()
    expect(screen.getByText("Premium White Sugar")).toBeInTheDocument()
    expect(screen.getByText("PS-2408-17")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument()
  })

  it("STOP lists why, and offers to report", async () => {
    await show({ ...base, verdict: "STOP", reasons: [{ code: "BATCH_RECALLED", message: "This batch was recalled: seal fault" }] })
    expect(await screen.findByRole("status")).toHaveTextContent("Do not buy or use")
    expect(screen.getByText("This batch was recalled: seal fault")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeInTheDocument()
  })

  it("an offline check says it was phone-only", async () => {
    await show({ ...base, status: "offline", verdict: "CHECK", product: null, reasons: [{ code: "OFFLINE_UNCONFIRMED", message: "Checked offline." }] })
    expect(await screen.findByText(/Checked on this phone only/)).toBeInTheDocument()
  })

  it("a typed code saved offline is 'Not checked yet', not a verdict", async () => {
    await show({ ...base, status: "waiting", verdict: null, product: null })
    expect(await screen.findByRole("status")).toHaveTextContent("Not checked yet")
    expect(screen.queryByText("Safe to buy")).not.toBeInTheDocument()
  })

  it("handles a record that no longer exists", async () => {
    renderAt("/result/:id", <Result />, "/result/missing")
    expect(await screen.findByText("That check is no longer on this phone.")).toBeInTheDocument()
  })
})

describe("Home", () => {
  it("shows an offline banner and the number of scans waiting", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    await db.queueAdd({ clientId: "q1", code: "1", scannedAt: NOW, scannerRole: "consumer" })
    renderAt("/", <Home />)
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument()
    expect(await screen.findByText("1 waiting to be checked")).toBeInTheDocument()
  })

  it("tells the user when a check made offline later turned out unsafe", async () => {
    await db.historyPut({ ...base, verdict: "STOP", worsened: true })
    renderAt("/", <Home />)
    expect(await screen.findByText(/has now been marked unsafe: Premium White Sugar/)).toBeInTheDocument()
  })

  it("starts with an empty history message and big scan actions", async () => {
    renderAt("/", <Home />)
    expect(await screen.findByText(/No checks yet/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Scan QR code/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: /Type a code instead/ })).toBeInTheDocument())
  })
})
