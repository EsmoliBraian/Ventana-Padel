import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { Reservation, ReservationStatus } from '@/types'

interface ReservationRow {
  id: string
  court_id: string
  date: string
  time: string
  players: number
  status: ReservationStatus
  customer_name: string | null
  created_via: 'user' | 'admin'
  price_total: number
}

function fromRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    courtId: row.court_id,
    date: row.date,
    time: row.time,
    players: row.players,
    status: row.status,
    customerName: row.customer_name ?? undefined,
    createdVia: row.created_via,
    priceTotal: row.price_total,
  }
}

interface ReservationsState {
  reservations: Reservation[]
  loading: boolean
  fetchReservations: () => Promise<void>
  subscribeToChanges: () => () => void
  addReservation: (reservation: Omit<Reservation, 'id'>) => Promise<string | null>
  updateStatus: (id: string, status: ReservationStatus) => Promise<void>
  deleteReservation: (id: string) => Promise<void>
}

export const useReservationsStore = create<ReservationsState>()((set, get) => ({
  reservations: [],
  loading: false,
  fetchReservations: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('venue_id', venueId)
      .order('date')
      .order('time')
    if (!error && data) set({ reservations: data.map(fromRow) })
    set({ loading: false })
  },
  subscribeToChanges: () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return () => {}
    const channel = supabase
      .channel(`reservations-changes-${venueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `venue_id=eq.${venueId}` },
        () => {
          get().fetchReservations()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  },
  addReservation: async (reservation) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        venue_id: venueId,
        court_id: reservation.courtId,
        date: reservation.date,
        time: reservation.time,
        players: reservation.players,
        status: reservation.status,
        customer_name: reservation.customerName ?? null,
        created_via: reservation.createdVia,
        price_total: reservation.priceTotal,
      })
      .select()
      .single()
    if (error || !data) return error?.message ?? 'No se pudo guardar la reserva.'
    set({ reservations: [...get().reservations, fromRow(data)] })
    return null
  },
  updateStatus: async (id, status) => {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', id)
    if (!error) {
      set({
        reservations: get().reservations.map((r) => (r.id === id ? { ...r, status } : r)),
      })
    }
  },
  deleteReservation: async (id) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id)
    if (!error) set({ reservations: get().reservations.filter((r) => r.id !== id) })
  },
}))
