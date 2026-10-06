import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { RankingCategory } from '@/types'

interface RankingCategoryRow {
  id: string
  name: string
  description?: string | null
}

function fromRow(row: RankingCategoryRow): RankingCategory {
  return { id: row.id, name: row.name, description: row.description ?? '' }
}

interface RankingCategoriesState {
  categories: RankingCategory[]
  loading: boolean
  fetchCategories: () => Promise<void>
  addCategory: (name: string) => Promise<string | null>
  updateCategory: (id: string, name: string) => Promise<string | null>
  deleteCategory: (id: string) => Promise<string | null>
}

export const useRankingCategoriesStore = create<RankingCategoriesState>()((set, get) => ({
  categories: [],
  loading: false,
  fetchCategories: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('ranking_categories')
      .select('*')
      .eq('venue_id', venueId)
      .order('name')
    if (!error && data) set({ categories: data.map(fromRow) })
    set({ loading: false })
  },
  addCategory: async (name) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('ranking_categories')
      .insert({ name, venue_id: venueId })
      .select('*')
      .single()
    if (error) return error.message
    set({
      categories: [...get().categories, fromRow(data)].sort((a, b) => a.name.localeCompare(b.name)),
    })
    return null
  },
  updateCategory: async (id, name) => {
    const { error } = await supabase.from('ranking_categories').update({ name }).eq('id', id)
    if (error) return error.message
    set({
      categories: get()
        .categories.map((c) => (c.id === id ? { ...c, name } : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
    return null
  },
  deleteCategory: async (id) => {
    const { error } = await supabase.from('ranking_categories').delete().eq('id', id)
    if (error) return error.message
    set({ categories: get().categories.filter((c) => c.id !== id) })
    return null
  },
}))
