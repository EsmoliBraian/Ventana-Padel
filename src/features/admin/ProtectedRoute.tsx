import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminAuthStore } from '@/store/adminAuthStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useProductsStore } from '@/store/productsStore'
import { useSalesStore } from '@/store/salesStore'
import { useTournamentsStore } from '@/store/tournamentsStore'
import { useSlidesStore } from '@/store/slidesStore'
import { useClosedDatesStore } from '@/store/closedDatesStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { useCategoriesStore } from '@/store/categoriesStore'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import { usePaymentMethodsStore } from '@/store/paymentMethodsStore'

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Cargando...
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const authInitialized = useAdminAuthStore((s) => s.initialized)
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const userId = useAdminAuthStore((s) => s.session?.user.id)
  const venueId = useSettingsStore((s) => s.id)

  const [venueResolved, setVenueResolved] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    setVenueResolved(false)
    useSettingsStore
      .getState()
      .fetchSettingsForOwner(userId)
      .then(() => setVenueResolved(true))
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!venueResolved || !venueId) return
    setHydrated(false)
    Promise.all([
      useCourtsStore.getState().fetchCourts(),
      useReservationsStore.getState().fetchReservations(),
      useProductsStore.getState().fetchProducts(),
      useSalesStore.getState().fetchSales(),
      useTournamentsStore.getState().fetchTournaments(),
      useSlidesStore.getState().fetchSlides(),
      useClosedDatesStore.getState().fetchClosedDates(),
      useFixedSlotsStore.getState().fetchFixedSlots(),
      useCategoriesStore.getState().fetchCategories(),
      useRankingCategoriesStore.getState().fetchCategories(),
      useRankingStore.getState().fetchPoints(),
      useRankingStore.getState().fetchEntries(),
      usePaymentMethodsStore.getState().fetchMethods(),
    ]).then(() => setHydrated(true))

    const unsubscribeReservations = useReservationsStore.getState().subscribeToChanges()
    // Pedidos del Mostrador: se actualizan solos entre dispositivos.
    const unsubscribeSales = useSalesStore.getState().subscribeToChanges()
    return () => {
      unsubscribeReservations()
      unsubscribeSales()
    }
  }, [venueResolved, venueId])

  if (!authInitialized) return <AdminFallback />
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  if (!venueResolved) return <AdminFallback />
  if (!venueId) return <Navigate to="/admin/setup" replace />
  if (!hydrated) return <AdminFallback />

  return <>{children}</>
}
