import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { api } from "../lib/api"
import { parseDial } from "../lib/ussd"
import { renderApp } from "../test-utils"
import { Ussd } from "./Ussd"

const con = (message: string) => ({ type: "CON" as const, message, wire: `CON ${message}` })
const end = (message: string) => ({ type: "END" as const, message, wire: `END ${message}` })

afterEach(() => vi.restoreAllMocks())

describe("parseDial", () => {
  it.each([
    ["*284#", []],
    ["*284*123456789012#", ["123456789012"]],
    ["*284*1*2#", ["1", "2"]],
    [" *284# ", []],
  ])("reads %s", (dial, inputs) => expect(parseDial(dial)).toEqual(inputs))

  it.each(["284", "*284", "*999#", "*284*1", "#284#", ""])("rejects %j", (dial) => expect(parseDial(dial)).toBeNull())
})

describe("USSD simulator", () => {
  const call = () => fireEvent.click(screen.getByRole("button", { name: "Call" }))
  // The handset screen only: the "what was sent" log repeats the same text.
  const onScreen = (text: string) => waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text))

  it("opens the menu when Call is pressed", async () => {
    const run = vi.spyOn(api, "ussd").mockResolvedValue(con("ScanUganda\n1. Check a product\n2. Report a product"))
    renderApp(<Ussd />)
    call()
    await onScreen("1. Check a product")
    expect(run).toHaveBeenCalledWith("")
    expect(screen.getByText("Session open")).toBeInTheDocument()
  })

  it("sends the whole chain of inputs each time, as an aggregator does", async () => {
    const run = vi.spyOn(api, "ussd")
      .mockResolvedValueOnce(con("ScanUganda\n1. Check a product"))
      .mockResolvedValueOnce(con("Enter the 12-digit code"))
      .mockResolvedValueOnce(end("GENUINE. Safe to buy."))
    renderApp(<Ussd />)
    call()
    await onScreen("ScanUganda")
    for (const [reply, expectedChain] of [["1", "1"], ["0", "1*0"]] as const) {
      fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: reply } })
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await waitFor(() => expect(run).toHaveBeenLastCalledWith(expectedChain))
    }
    await onScreen("GENUINE. Safe to buy.")
    expect(screen.getByText("Session ended")).toBeInTheDocument()
    expect(screen.queryByLabelText("Your reply")).not.toBeInTheDocument()
  })

  it("supports dialling straight to a code, and shows what was exchanged", async () => {
    const run = vi.spyOn(api, "ussd").mockResolvedValue(con("Where are you?\n1. Entebbe"))
    renderApp(<Ussd />)
    fireEvent.change(screen.getByLabelText("Dial"), { target: { value: "*284*123456789012#" } })
    call()
    await onScreen("Where are you?")
    expect(run).toHaveBeenCalledWith("123456789012")
    const log = within(screen.getByRole("list")) // the "what was sent" log (the help panel shows the same dial string)
    expect(log.getByText("*284*123456789012#")).toBeInTheDocument()
    expect(log.getByText(/^CON Where are you\?/)).toBeInTheDocument()
  })

  it("explains a dial string it does not understand, without calling the server", () => {
    const run = vi.spyOn(api, "ussd")
    renderApp(<Ussd />)
    fireEvent.change(screen.getByLabelText("Dial"), { target: { value: "hello" } })
    call()
    expect(screen.getByRole("alert")).toHaveTextContent("Dial *284#")
    expect(run).not.toHaveBeenCalled()
  })

  it("can start a new session after one ends", async () => {
    vi.spyOn(api, "ussd").mockResolvedValue(end("Thank you."))
    renderApp(<Ussd />)
    call()
    fireEvent.click(await screen.findByRole("button", { name: "Start a new session" }))
    expect(screen.getByText("Press Call to start a session.")).toBeInTheDocument()
  })

  it("shows a server error instead of failing silently", async () => {
    const { ApiError } = await import("../lib/api")
    vi.spyOn(api, "ussd").mockRejectedValue(new ApiError(0, "NETWORK", "Cannot reach the server."))
    renderApp(<Ussd />)
    call()
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server.")
  })
})
