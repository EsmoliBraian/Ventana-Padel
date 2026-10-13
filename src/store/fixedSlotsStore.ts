import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { ReservationsScope } from '@/store/reservationsStore'
import type { FixedSlot } from '@/types'

interface FixedSlotRow {
  id: string
  court_id: string
  weekday: number
  time: string
  customer_name: string
}

function fromRow(row: FixedSlotRow): FixedSlot {
  return {
    id: row.id,
    courtId: row.court_id,
    weekday: row.weekday,
    time: row.time,
    customerName: row.customer_name,
  }
}

interface FixedSlotsState {
  fixedSlots: FixedSlot[]
  loading: boolean
  fetchFixedSlots: (scope?: ReservationsScope) => Promise<void>
  addFixedSlot: (slot: Omit<FixedSlot, 'id'>) => Promise<string | null>
  deleteFixedSlot: (id: string) => Promise<string | null>
}

export const useFixedSlotsStore = create<FixedSlotsState>()((set, get) => ({
  fixedSlots: [],
  loading: false,
  fetchFixedSlots: async (scope = 'owner') => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    if (scope === 'public') {
      // El sitio publico solo necesita saber que horarios estan tomados, sin
      // el nombre del cliente.
      const busy = await supabase.rpc('busy_fixed_slots', { p_venue_id: venueId })
      if (!busy.error && busy.data) {
        set({
          fixedSlots: (busy.data as Omit<FixedSlotRow, 'customer_name'>[]).map((r) => fromRow({ ...r, customer_name: '' })),
          loading: false,
        })
        return
      }
      // Sin la migracion 027 esa funcion no existe y la tabla todavia se
      // puede leer: se sigue como antes. Ante cualquier otro error se deja
      // la grilla como estaba.
      if (busy.error?.code !== 'PGRST202') {
        set({ loading: false })
        return
      }
    }
    const { data, error } = await supabase
      .from('fixed_slots')
      .select('*')
      .eq('venue_id', venueId)
      .order('weekday')
      .order('time')
    if (!error && data) set({ fixedSlots: data.map(fromRow) })
    set({ loading: false })
  },
  addFixedSlot: async (slot) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('fixed_slots')
      .insert({
        venue_id: venueId,
        court_id: slot.courtId,
        weekday: slot.weekday,
        time: slot.time,
        customer_name: slot.customerName,
      })
      .select()
      .single()
    if (error) {
      // 23505: ya hay un turno fijo ahi. El choque con una reserva (23P01)
      // trae su propio mensaje, con la fecha.
      return error.code === '23505' ? 'Ya hay un turno fijo en esa cancha, día y horario.' : error.message
    }
    set({ fixedSlots: [...get().fixedSlots, fromRow(data)] })
    return null
  },
  deleteFixedSlot: async (id) => {
    const { error } = await supabase.from('fixed_slots').delete().eq('id', id)
    if (error) return error.message
    set({ fixedSlots: get().fixedSlots.filter((s) => s.id !== id) })
    return null
  },
}))
