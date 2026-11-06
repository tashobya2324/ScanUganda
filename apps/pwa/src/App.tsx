import { useEffect } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { startAutoSync } from "./lib/sync"
import { History } from "./pages/History"
import { Home } from "./pages/Home"
import { Manual } from "./pages/Manual"
import { Report } from "./pages/Report"
import { Result } from "./pages/Result"
import { Scan } from "./pages/Scan"
import { Settings } from "./pages/Settings"

export function App() {
  useEffect(() => startAutoSync(), [])
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="scan" element={<Scan />} />
        <Route path="type" element={<Manual />} />
        <Route path="result/:id" element={<Result />} />
        <Route path="history" element={<History />} />
        <Route path="report" element={<Report />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
