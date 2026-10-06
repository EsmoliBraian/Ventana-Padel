import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { Court, Sport } from '@/types'

interface CourtRow {
  id: string
  name: string
  price: number
  sport?: Sport
}

function fromRow(row: CourtRow): Court {
  return { id: row.id, name: row.name, price: row.price, sport: row.sport ?? 'padel' }
}

interface CourtsState {
  courts: Court[]
  loading: boolean
  fetchCourts: () => Promise<void>
  addCourt: (name: string, price: number, sport: Sport) => Promise<string | null>
  updateCourt: (id: string, patch: Partial<Omit<Court, 'id'>>) => Promise<string | null>
  deleteCourt: (id: string) => Promise<string | null>
}

export const useCourtsStore = create<CourtsState>()((set, get) => ({
  courts: [],
  loading: false,
  fetchCourts: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('venue_id', venueId)
      .order('name')
    if (!error && data) set({ courts: data.map(fromRow) })
    set({ loading: false })
  },
  addCourt: async (name, price, sport) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('courts')
      .insert({ name, price, sport, venue_id: venueId })
      .select('*')
      .single()
    if (error) return error.message
    set({ courts: [...get().courts, fromRow(data)] })
    useSettingsStore.getState().markOnboardingStep('courts')
    return null
  },
  updateCourt: async (id, patch) => {
    const row: { name?: string; price?: number; sport?: Sport } = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.price !== undefined) row.price = patch.price
    if (patch.sport !== undefined) row.sport = patch.sport

    const { error } = await supabase.from('courts').update(row).eq('id', id)
    if (error) return error.message
    set({ courts: get().courts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
    useSettingsStore.getState().markOnboardingStep('courts')
    return null
  },
  deleteCourt: async (id) => {
    const { error } = await supabase.from('courts').delete().eq('id', id)
    if (error) return error.message
    set({ courts: get().courts.filter((c) => c.id !== id) })
    return null
  },
}))
