import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { deleteImage } from '@/lib/storage'
import type { Settings } from '@/types'

interface SettingsRow {
  id: string
  owner_id: string | null
  slug: string | null
  venue_name: string
  whatsapp_phone: string
  logo_url: string | null
  slot_duration_minutes: number
  open_hour: number
  close_hour: number
  about: string
  address: string
  instagram_url: string | null
}

function fromRow(row: SettingsRow): Settings {
  return {
    id: row.id,
    ownerId: row.owner_id ?? '',
    slug: row.slug ?? '',
    venueName: row.venue_name,
    whatsappPhone: row.whatsapp_phone,
    logoUrl: row.logo_url ?? undefined,
    slotDurationMinutes: row.slot_duration_minutes,
    openHour: row.open_hour,
    closeHour: row.close_hour,
    about: row.about,
    address: row.address,
    instagramUrl: row.instagram_url ?? undefined,
  }
}

interface CreateVenueInput {
  ownerId: string
  slug: string
  venueName: string
  whatsappPhone: string
}

interface SettingsState {
  id: string | null
  ownerId: string | null
  slug: string | null
  venueName: string
  whatsappPhone: string
  logoUrl?: string
  slotDurationMinutes: number
  openHour: number
  closeHour: number
  about: string
  address: string
  instagramUrl?: string
  loading: boolean
  venueChecked: boolean
  fetchSettingsForOwner: (ownerId: string) => Promise<void>
  fetchSettingsBySlug: (slug: string) => Promise<boolean>
  createVenue: (input: CreateVenueInput) => Promise<string | null>
  updateSettings: (patch: Partial<Settings>) => Promise<string | null>
  reset: () => void
}

const defaultState = {
  id: null as string | null,
  ownerId: null as string | null,
  slug: null as string | null,
  venueName: '',
  whatsappPhone: '',
  logoUrl: undefined as string | undefined,
  slotDurationMinutes: 60,
  openHour: 8,
  closeHour: 23,
  about: '',
  address: '',
  instagramUrl: undefined as string | undefined,
  loading: false,
  venueChecked: false,
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...defaultState,
  fetchSettingsForOwner: async (ownerId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (!error && data) {
      set({ ...fromRow(data), venueChecked: true, loading: false })
    } else {
      set({ venueChecked: true, loading: false })
    }
  },
  fetchSettingsBySlug: async (slug) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (!error && data) {
      set({ ...fromRow(data), venueChecked: true, loading: false })
      return true
    }
    set({ venueChecked: true, loading: false })
    return false
  },
  createVenue: async (input) => {
    const { data, error } = await supabase
      .from('settings')
      .insert({
        owner_id: input.ownerId,
        slug: input.slug,
        venue_name: input.venueName,
        whatsapp_phone: input.whatsappPhone,
      })
      .select()
      .single()
    if (error || !data) return error?.message ?? 'No se pudo crear el club.'
    set({ ...fromRow(data), venueChecked: true })
    return null
  },
  updateSettings: async (patch) => {
    const { id, logoUrl: previousLogoUrl } = get()
    if (!id) return 'No se encontro la configuracion.'
    const row: Partial<SettingsRow> = {}
    if (patch.venueName !== undefined) row.venue_name = patch.venueName
    if (patch.whatsappPhone !== undefined) row.whatsapp_phone = patch.whatsappPhone
    if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl ?? null
    if (patch.slotDurationMinutes !== undefined) row.slot_duration_minutes = patch.slotDurationMinutes
    if (patch.openHour !== undefined) row.open_hour = patch.openHour
    if (patch.closeHour !== undefined) row.close_hour = patch.closeHour
    if (patch.about !== undefined) row.about = patch.about
    if (patch.address !== undefined) row.address = patch.address
    if (patch.instagramUrl !== undefined) row.instagram_url = patch.instagramUrl ?? null

    const { error } = await supabase.from('settings').update(row).eq('id', id)
    if (error) return error.message
    set({ ...patch })
    if (patch.logoUrl !== undefined && previousLogoUrl && previousLogoUrl !== patch.logoUrl) {
      deleteImage(previousLogoUrl).catch(() => {})
    }
    return null
  },
  reset: () => set({ ...defaultState }),
}))
