import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RootPage } from '@/features/booking/RootPage'
import { PublicLayout } from '@/features/booking/PublicLayout'
import { LandingPage } from '@/features/booking/LandingPage'
import { BookingFlowPage } from '@/features/booking/BookingFlowPage'
import { TorneosPage } from '@/features/booking/TorneosPage'
import { RankingPage } from '@/features/booking/RankingPage'
import { BlogPage } from '@/features/booking/BlogPage'
import { BlogPostPage } from '@/features/booking/BlogPostPage'
import { ProtectedRoute } from '@/features/admin/ProtectedRoute'
import { useAdminAuthStore } from '@/store/adminAuthStore'

const AdminLoginPage = lazy(() =>
  import('@/features/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })),
)
const AdminSignupPage = lazy(() =>
  import('@/features/admin/AdminSignupPage').then((m) => ({ default: m.AdminSignupPage })),
)
const AdminLayout = lazy(() =>
  import('@/features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
)
const Dashboard = lazy(() =>
  import('@/features/admin/Dashboard').then((m) => ({ default: m.Dashboard })),
)
const Reservas = lazy(() =>
  import('@/features/admin/Reservas').then((m) => ({ default: m.Reservas })),
)
const Horarios = lazy(() =>
  import('@/features/admin/Horarios').then((m) => ({ default: m.Horarios })),
)
const Slides = lazy(() => import('@/features/admin/Slides').then((m) => ({ default: m.Slides })))
const Torneos = lazy(() =>
  import('@/features/admin/Torneos').then((m) => ({ default: m.Torneos })),
)
const Ranking = lazy(() =>
  import('@/features/admin/Ranking').then((m) => ({ default: m.Ranking })),
)
const Productos = lazy(() =>
  import('@/features/admin/Productos').then((m) => ({ default: m.Productos })),
)
const VentasDelDia = lazy(() =>
  import('@/features/admin/VentasDelDia').then((m) => ({ default: m.VentasDelDia })),
)
const Metricas = lazy(() =>
  import('@/features/admin/Metricas').then((m) => ({ default: m.Metricas })),
)
const Configuracion = lazy(() =>
  import('@/features/admin/Configuracion').then((m) => ({ default: m.Configuracion })),
)

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Cargando...
    </div>
  )
}

function App() {
  useEffect(() => {
    useAdminAuthStore.getState().init()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<AdminFallback />}>
        <Routes>
          <Route path="/" element={<RootPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/signup" element={<AdminSignupPage />} />
          <Route path="/admin/setup" element={<AdminSignupPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="horarios" element={<Horarios />} />
            <Route path="slides" element={<Slides />} />
            <Route path="torneos" element={<Torneos />} />
            <Route path="ranking" element={<Ranking />} />
            <Route path="productos" element={<Productos />} />
            <Route path="ventas" element={<VentasDelDia />} />
            <Route path="metricas" element={<Metricas />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          {/* Sitio publico de cada complejo. Va al final: las rutas fijas de
              arriba (/admin/...) tienen prioridad sobre /:slug. */}
          <Route path="/:slug" element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="reservar" element={<BookingFlowPage />} />
            <Route path="torneos" element={<TorneosPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="blog/:id" element={<BlogPostPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
