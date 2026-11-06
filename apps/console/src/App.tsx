import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { Layout } from "./components/Layout"
import { AuthProvider, useAuth } from "./lib/auth"
import { Alerts } from "./pages/Alerts"
import { BatchDetail } from "./pages/BatchDetail"
import { Batches } from "./pages/Batches"
import { Feed } from "./pages/Feed"
import { Login } from "./pages/Login"
import { MapPage } from "./pages/MapPage"
import { Overview } from "./pages/Overview"
import { Team } from "./pages/Team"

function RequireAuth() {
  const { user } = useAuth()
  return user ? <Layout /> : <Navigate to="/login" replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { can } = useAuth()
  return can("admin") ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route index element={<Overview />} />
            <Route path="batches" element={<Batches />} />
            <Route path="batches/:id" element={<BatchDetail />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="feed" element={<Feed />} />
            <Route path="map" element={<MapPage />} />
            <Route path="team" element={<AdminOnly><Team /></AdminOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
