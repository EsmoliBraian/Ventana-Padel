import { useEffect, useRef, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useTournamentsStore } from '@/store/tournamentsStore'
import { useSlidesStore } from '@/store/slidesStore'
import { useClosedDatesStore } from '@/store/closedDatesStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export function PublicLayout() {
  const { slug } = useParams()
  const [status, setStatus] = useState<'loading' | 'found' | 'not-found'>('loading')
  const unsubscribeRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    useSettingsStore.getState().reset()

    useSettingsStore
      .getState()
      .fetchSettingsBySlug(slug ?? '')
      .then((found) => {
        if (cancelled) return
        if (!found) {
          setStatus('not-found')
          return
        }
        Promise.all([
          useCourtsStore.getState().fetchCourts(),
          useReservationsStore.getState().fetchReservations(),
          useTournamentsStore.getState().fetchTournaments(),
          useSlidesStore.getState().fetchSlides(),
          useClosedDatesStore.getState().fetchClosedDates(),
          useFixedSlotsStore.getState().fetchFixedSlots(),
          useRankingCategoriesStore.getState().fetchCategories(),
          useRankingStore.getState().fetchEntries(),
        ]).then(() => {
          if (cancelled) return
          unsubscribeRef.current = useReservationsStore.getState().subscribeToChanges()
          document.title = useSettingsStore.getState().venueName
          setStatus('found')
        })
      })

    return () => {
      cancelled = true
      unsubscribeRef.current()
      unsubscribeRef.current = () => {}
    }
  }, [slug])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Cargando...
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg text-gray-200">No encontramos este complejo</p>
        <p className="text-sm">Revisá que el link esté bien escrito.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  )
}
