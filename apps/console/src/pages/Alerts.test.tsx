import { fireEvent, screen, waitFor } from "@testing-library/react"
import { ApiError, api } from "../lib/api"
import type { Alert } from "../lib/types"
import { renderApp } from "../test-utils"
import { Alerts } from "./Alerts"

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1",
  scanId: "s1",
  batchId: "b1",
  batchCode: "PS-2408-17",
  productName: "Premium White Sugar",
  type: "IMPOSSIBLE_TRAVEL",
  priority: "high",
  status: "open",
  message: "Same unit scanned 300 km apart in 2 minutes.",
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now(),
  assignedTo: null,
  ...over,
})

afterEach(() => vi.restoreAllMocks())

describe("Alerts", () => {
  it("lists open alerts with a human label and the product", async () => {
    vi.spyOn(api, "alerts").mockResolvedValue([alert()])
    renderApp(<Alerts />)
    expect(await screen.findByText("Impossible travel")).toBeInTheDocument()
    expect(screen.getByText(/Premium White Sugar/)).toBeInTheDocument()
    expect(screen.getByText("PS-2408-17")).toBeInTheDocument()
  })

  it("Take it assigns the alert to the signed-in user and starts investigating", async () => {
    vi.spyOn(api, "alerts").mockResolvedValue([alert()])
    const update = vi.spyOn(api, "updateAlert").mockResolvedValue(alert({ status: "investigating" }))
    renderApp(<Alerts />)
    fireEvent.click(await screen.findByRole("button", { name: "Take it" }))
    await waitFor(() => expect(update).toHaveBeenCalledWith("a1", "investigating", "u-me"))
  })

  it("resolving does not reassign", async () => {
    vi.spyOn(api, "alerts").mockResolvedValue([alert()])
    const update = vi.spyOn(api, "updateAlert").mockResolvedValue(alert({ status: "resolved" }))
    renderApp(<Alerts />)
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }))
    await waitFor(() => expect(update).toHaveBeenCalledWith("a1", "resolved", undefined))
  })

  it("explains an empty inbox", async () => {
    vi.spyOn(api, "alerts").mockResolvedValue([])
    renderApp(<Alerts />)
    expect(await screen.findByText("No open alerts")).toBeInTheDocument()
  })

  it("shows the error and a retry when loading fails", async () => {
    vi.spyOn(api, "alerts").mockRejectedValue(new ApiError(0, "NETWORK", "Cannot reach the server."))
    renderApp(<Alerts />)
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
