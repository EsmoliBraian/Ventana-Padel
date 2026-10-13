import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
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

// Lo que devuelve addReservation cuando la base rechaza la reserva porque el
// horario ya esta tomado, por otra reserva (23505) o por un turno fijo (23P01).
export const SLOT_TAKEN_MESSAGE = 'Ese horario ya está ocupado. Elegí otro.'

function isSlotTaken(error: { code?: string } | null): boolean {
  return error?.code === '23505' || error?.code === '23P01'
}

// Quien esta mirando. El panel ('owner') lee la tabla completa de su complejo.
// El sitio publico ('public') solo pregunta que horarios estan ocupados: no
// recibe nombres, precios ni estados.
export type ReservationsScope = 'owner' | 'public'

interface BusySlotRow {
  court_id: string
  date: string
  time: string
}

// Un horario ocupado, con la forma de una reserva para que la grilla publica
// lo trate igual. Lo unico real es cancha, dia y hora.
function fromBusySlot(row: BusySlotRow): Reservation {
  return {
    id: `${row.court_id}-${row.date}-${row.time}`,
    courtId: row.court_id,
    date: row.date,
    time: row.time,
    players: 0,
    status: 'confirmado',
    createdVia: 'user',
    priceTotal: 0,
  }
}

// Cada cuanto el sitio publico vuelve a preguntar los horarios ocupados, por
// si el aviso en vivo no llega (sin conexion, cupo de conexiones lleno).
const PUBLIC_REFRESH_MS = 30_000
// Espera desde el ultimo aviso antes de consultar: una tanda de cambios
// seguidos termina en una sola consulta.
const LIVE_DEBOUNCE_MS = 300

interface ReservationsState {
  reservations: Reservation[]
  loading: boolean
  scope: ReservationsScope
  fetchReservations: (scope?: ReservationsScope) => Promise<void>
  subscribeToChanges: () => () => void
  addReservation: (reservation: Omit<Reservation, 'id'>) => Promise<string | null>
  updateStatus: (id: string, status: ReservationStatus) => Promise<void>
  deleteReservation: (id: string) => Promise<void>
}

// El sitio publico no puede leer la tabla, asi que no recibe sus cambios.
// Escucha el canal del complejo, donde la base avisa "hubo un cambio" sin
// ningun dato (migracion 028), y con cada aviso vuelve a pedir los horarios
// ocupados. Si el canal no conecta, el visitante no ve ningun error: queda
// la consulta periodica.
function subscribePublic(venueId: string, get: () => ReservationsState): () => void {
  const refresh = () => {
    get().fetchReservations()
    useFixedSlotsStore.getState().fetchFixedSlots('public')
  }
  let debounce: ReturnType<typeof setTimeout> | undefined
  const onNotice = () => {
    clearTimeout(debounce)
    debounce = setTimeout(refresh, LIVE_DEBOUNCE_MS)
  }
  let joined = false
  const channel = supabase
    .channel(`venue:${venueId}`, { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, onNotice)
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      // Al reconectar pudo haberse perdido algun aviso: se consulta todo.
      if (joined) refresh()
      joined = true
    })
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') refresh()
  }
  const timer = setInterval(refreshWhenVisible, PUBLIC_REFRESH_MS)
  document.addEventListener('visibilitychange', refreshWhenVisible)
  window.addEventListener('online', refresh)
  return () => {
    supabase.removeChannel(channel)
    clearTimeout(debounce)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
    window.removeEventListener('online', refresh)
  }
}

export const useReservationsStore = create<ReservationsState>()((set, get) => ({
  reservations: [],
  loading: false,
  scope: 'owner',
  fetchReservations: async (requested) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    const scope = requested ?? get().scope
    set({ loading: true, scope })
    if (scope === 'public') {
      const busy = await supabase.rpc('busy_slots', { p_venue_id: venueId })
      if (!busy.error && busy.data) {
        set({ reservations: (busy.data as BusySlotRow[]).map(fromBusySlot), loading: false })
        return
      }
      // Sin la migracion 027 esa funcion no existe y la tabla todavia se
      // puede leer: se sigue como antes. Ante cualquier otro error se deja
      // la grilla como estaba, para no mostrar libre lo que esta ocupado.
      if (busy.error?.code !== 'PGRST202') {
        set({ loading: false })
        return
      }
    }
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
    if (get().scope === 'public') return subscribePublic(venueId, get)
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
    const row = {
      venue_id: venueId,
      court_id: reservation.courtId,
      date: reservation.date,
      time: reservation.time,
      players: reservation.players,
      status: reservation.status,
      customer_name: reservation.customerName ?? null,
      created_via: reservation.createdVia,
      price_total: reservation.priceTotal,
    }
    if (get().scope === 'public') {
      // El publico guarda la reserva pero no puede leerla de vuelta: se
      // vuelven a pedir los horarios ocupados.
      const { error } = await supabase.from('reservations').insert(row)
      if (isSlotTaken(error)) {
        get().fetchReservations()
        return SLOT_TAKEN_MESSAGE
      }
      if (error) return error.message
      await get().fetchReservations()
      return null
    }
    const { data, error } = await supabase.from('reservations').insert(row).select().single()
    if (isSlotTaken(error)) {
      // Alguien lo tomo mientras tanto: se refresca la grilla.
      get().fetchReservations()
      return SLOT_TAKEN_MESSAGE
    }
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
