import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { DEFAULT_RANKING_POINTS, bestInstance } from '@/lib/ranking'
import type { RankingEntry, RankingInstance } from '@/types'

interface RankingEntryRow {
  id: string
  category_id: string
  player_name: string
  total_points: number
  best_instance: RankingInstance
}

function fromRow(row: RankingEntryRow): RankingEntry {
  return {
    id: row.id,
    categoryId: row.category_id,
    playerName: row.player_name,
    totalPoints: row.total_points,
    bestInstance: row.best_instance,
  }
}

interface RankingState {
  points: Record<RankingInstance, number>
  entries: RankingEntry[]
  loading: boolean
  fetchPoints: () => Promise<void>
  updatePoints: (points: Record<RankingInstance, number>) => Promise<string | null>
  fetchEntries: () => Promise<void>
  addResult: (
    categoryId: string,
    playerName: string,
    instance: RankingInstance,
  ) => Promise<string | null>
  updateEntry: (
    id: string,
    patch: { playerName?: string; totalPoints?: number; bestInstance?: RankingInstance },
  ) => Promise<string | null>
  deleteEntry: (id: string) => Promise<string | null>
}

export const useRankingStore = create<RankingState>()((set, get) => ({
  points: { ...DEFAULT_RANKING_POINTS },
  entries: [],
  loading: false,
  fetchPoints: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    const { data, error } = await supabase
      .from('ranking_points')
      .select('instance, points')
      .eq('venue_id', venueId)
    if (error) return

    if (!data || data.length === 0) {
      const seedRows = Object.entries(DEFAULT_RANKING_POINTS).map(([instance, points]) => ({
        venue_id: venueId,
        instance,
        points,
      }))
      const { data: seeded, error: seedError } = await supabase
        .from('ranking_points')
        .insert(seedRows)
        .select('instance, points')
      if (seedError || !seeded) return
      const seededPoints = { ...DEFAULT_RANKING_POINTS }
      for (const row of seeded) seededPoints[row.instance as RankingInstance] = row.points
      set({ points: seededPoints })
      return
    }

    const points = { ...DEFAULT_RANKING_POINTS }
    for (const row of data) points[row.instance as RankingInstance] = row.points
    set({ points })
  },
  updatePoints: async (points) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    for (const [instance, value] of Object.entries(points)) {
      const { error } = await supabase
        .from('ranking_points')
        .update({ points: value })
        .eq('venue_id', venueId)
        .eq('instance', instance)
      if (error) return error.message
    }
    set({ points })
    return null
  },
  fetchEntries: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('ranking_entries')
      .select('id, category_id, player_name, total_points, best_instance')
      .eq('venue_id', venueId)
    if (!error && data) set({ entries: data.map(fromRow) })
    set({ loading: false })
  },
  addResult: async (categoryId, playerName, instance) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const awardedPoints = get().points[instance]
    const existing = get().entries.find(
      (e) => e.categoryId === categoryId && e.playerName === playerName,
    )

    if (existing) {
      const newTotal = existing.totalPoints + awardedPoints
      const newBest = bestInstance(existing.bestInstance, instance)
      const { error } = await supabase
        .from('ranking_entries')
        .update({ total_points: newTotal, best_instance: newBest })
        .eq('id', existing.id)
      if (error) return error.message
      set({
        entries: get().entries.map((e) =>
          e.id === existing.id ? { ...e, totalPoints: newTotal, bestInstance: newBest } : e,
        ),
      })
      return null
    }

    const { data, error } = await supabase
      .from('ranking_entries')
      .insert({
        venue_id: venueId,
        category_id: categoryId,
        player_name: playerName,
        total_points: awardedPoints,
        best_instance: instance,
      })
      .select('id, category_id, player_name, total_points, best_instance')
      .single()
    if (error || !data) return error?.message ?? 'No se pudo cargar el resultado.'
    set({ entries: [...get().entries, fromRow(data)] })
    return null
  },
  updateEntry: async (id, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.playerName !== undefined) row.player_name = patch.playerName
    if (patch.totalPoints !== undefined) row.total_points = patch.totalPoints
    if (patch.bestInstance !== undefined) row.best_instance = patch.bestInstance

    const { error } = await supabase.from('ranking_entries').update(row).eq('id', id)
    if (error) return error.message
    set({
      entries: get().entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
    return null
  },
  deleteEntry: async (id) => {
    const { error } = await supabase.from('ranking_entries').delete().eq('id', id)
    if (error) return error.message
    set({ entries: get().entries.filter((e) => e.id !== id) })
    return null
  },
}))
