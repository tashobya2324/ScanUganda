import { fireEvent, render, screen } from "@testing-library/react"
import { Route, Routes } from "react-router"
import { renderApp } from "../test-utils"
import { Layout } from "./Layout"
import { TrendChart } from "./TrendChart"
import { Modal, VerdictMark } from "./ui"

describe("VerdictMark", () => {
  it.each([
    ["GENUINE", "Genuine"],
    ["CHECK", "Check"],
    ["STOP", "Stop"],
  ] as const)("%s says its word, not just its colour", (v, word) => {
    render(<VerdictMark verdict={v} />)
    expect(screen.getByText(word)).toBeInTheDocument()
  })

  it("keeps the word available to screen readers when the label is hidden", () => {
    render(<VerdictMark verdict="STOP" label={false} />)
    expect(screen.getByText("Stop")).toHaveClass("sr-only")
  })
})

describe("Modal", () => {
  it("closes on Escape and exposes a labelled dialog", () => {
    const onClose = vi.fn()
    render(
      <Modal title="New batch" onClose={onClose}>
        <input aria-label="x" />
      </Modal>,
    )
    expect(screen.getByRole("dialog", { name: "New batch" })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })
})

describe("TrendChart", () => {
  it("describes itself with the week's total", () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, GENUINE: i, CHECK: 1, STOP: 0 }))
    render(<TrendChart daily={daily} />)
    expect(screen.getByRole("img")).toHaveAccessibleName("Scans per day for the last 7 days, 28 in total")
  })
})

describe("Layout navigation by role", () => {
  const nav = (role: "admin" | "manufacturer" | "inspector") => {
    renderApp(
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>home</p>} />
        </Route>
      </Routes>,
      { role },
    )
    return screen.getAllByRole("link").map((l) => l.textContent)
  }

  it("only administrators see Team", () => {
    expect(nav("admin")).toContain("Team")
  })
  it("manufacturers do not", () => {
    expect(nav("manufacturer")).not.toContain("Team")
  })
  it("everyone sees the core pages", () => {
    expect(nav("inspector")).toEqual(expect.arrayContaining(["Overview", "Batches", "Alerts", "Live scans", "Map"]))
  })
})
