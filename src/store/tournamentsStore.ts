import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { deleteImage } from '@/lib/storage'
import type { Tournament } from '@/types'

interface TournamentRow {
  id: string
  name: string
  date: string
  description: string
  image_url: string | null
  published: boolean
}

function fromRow(row: TournamentRow): Tournament {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    published: row.published,
  }
}

interface TournamentsState {
  tournaments: Tournament[]
  loading: boolean
  fetchTournaments: () => Promise<void>
  addTournament: (tournament: Omit<Tournament, 'id'>) => Promise<string | null>
  updateTournament: (id: string, patch: Partial<Omit<Tournament, 'id'>>) => Promise<string | null>
  deleteTournament: (id: string) => Promise<string | null>
}

export const useTournamentsStore = create<TournamentsState>()((set, get) => ({
  tournaments: [],
  loading: false,
  fetchTournaments: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('venue_id', venueId)
      .order('date')
    if (!error && data) set({ tournaments: data.map(fromRow) })
    set({ loading: false })
  },
  addTournament: async (tournament) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        venue_id: venueId,
        name: tournament.name,
        date: tournament.date,
        description: tournament.description,
        image_url: tournament.imageUrl ?? null,
        published: tournament.published,
      })
      .select()
      .single()
    if (error) return error.message
    set({ tournaments: [...get().tournaments, fromRow(data)] })
    return null
  },
  updateTournament: async (id, patch) => {
    const previous = get().tournaments.find((t) => t.id === id)
    const row: Partial<TournamentRow> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.date !== undefined) row.date = patch.date
    if (patch.description !== undefined) row.description = patch.description
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl ?? null
    if (patch.published !== undefined) row.published = patch.published

    const { error } = await supabase.from('tournaments').update(row).eq('id', id)
    if (error) return error.message
    set({
      tournaments: get().tournaments.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
    if (patch.imageUrl !== undefined && previous?.imageUrl && previous.imageUrl !== patch.imageUrl) {
      deleteImage(previous.imageUrl).catch(() => {})
    }
    return null
  },
  deleteTournament: async (id) => {
    const tournament = get().tournaments.find((t) => t.id === id)
    const { error } = await supabase.from('tournaments').delete().eq('id', id)
    if (error) return error.message
    set({ tournaments: get().tournaments.filter((t) => t.id !== id) })
    if (tournament?.imageUrl) deleteImage(tournament.imageUrl).catch(() => {})
    return null
  },
}))
