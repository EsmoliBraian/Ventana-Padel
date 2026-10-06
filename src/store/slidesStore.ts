import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { deleteImage } from '@/lib/storage'
import type { HeroSlide } from '@/types'

interface SlideRow {
  id: string
  image_url: string
  title: string
  subtitle: string
  body: string
  order: number
  published: boolean
}

function fromRow(row: SlideRow): HeroSlide {
  return {
    id: row.id,
    imageUrl: row.image_url,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    order: row.order,
    published: row.published,
  }
}

interface SlidesState {
  slides: HeroSlide[]
  loading: boolean
  fetchSlides: () => Promise<void>
  addSlide: (slide: Omit<HeroSlide, 'id'>) => Promise<string | null>
  updateSlide: (id: string, patch: Partial<Omit<HeroSlide, 'id'>>) => Promise<string | null>
  deleteSlide: (id: string) => Promise<string | null>
}

export const useSlidesStore = create<SlidesState>()((set, get) => ({
  slides: [],
  loading: false,
  fetchSlides: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('venue_id', venueId)
      .order('order')
    if (!error && data) set({ slides: data.map(fromRow) })
    set({ loading: false })
  },
  addSlide: async (slide) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('hero_slides')
      .insert({
        venue_id: venueId,
        image_url: slide.imageUrl,
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        order: slide.order,
        published: slide.published,
      })
      .select()
      .single()
    if (error) return error.message
    set({ slides: [...get().slides, fromRow(data)] })
    return null
  },
  updateSlide: async (id, patch) => {
    const previous = get().slides.find((s) => s.id === id)
    const row: Partial<SlideRow> = {}
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl
    if (patch.title !== undefined) row.title = patch.title
    if (patch.subtitle !== undefined) row.subtitle = patch.subtitle
    if (patch.body !== undefined) row.body = patch.body
    if (patch.order !== undefined) row.order = patch.order
    if (patch.published !== undefined) row.published = patch.published

    const { error } = await supabase.from('hero_slides').update(row).eq('id', id)
    if (error) return error.message
    set({ slides: get().slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
    if (patch.imageUrl !== undefined && previous?.imageUrl && previous.imageUrl !== patch.imageUrl) {
      deleteImage(previous.imageUrl).catch(() => {})
    }
    return null
  },
  deleteSlide: async (id) => {
    const slide = get().slides.find((s) => s.id === id)
    const { error } = await supabase.from('hero_slides').delete().eq('id', id)
    if (error) return error.message
    set({ slides: get().slides.filter((s) => s.id !== id) })
    if (slide?.imageUrl) deleteImage(slide.imageUrl).catch(() => {})
    return null
  },
}))
