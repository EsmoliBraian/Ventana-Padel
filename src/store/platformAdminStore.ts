import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import type { PlanStatus } from '@/types'

export interface AdminVenue {
  id: string
  slug: string
  venueName: string
  createdAt: string
  planStatus: PlanStatus
  trialEndsAt?: string
  isDemo: boolean
  ownerName?: string
  ownerWhatsapp?: string
  ownerEmail?: string
  reservationsCount: number
  lastActivityAt?: string
  // Cobro (migracion 024). Sin la migracion, o si nunca se activo, no vienen.
  paidSince?: string
  priceFrozenUntil?: string // YYYY-MM-DD, ultimo dia con el precio congelado
}

interface AdminVenueRow {
  venue_id: string
  slug: string | null
  venue_name: string
  created_at: string
  plan_status: PlanStatus
  trial_ends_at: string | null
  is_demo: boolean
  owner_name: string | null
  owner_whatsapp: string | null
  owner_email: string | null
  reservations_count: number
  last_activity_at: string | null
  paid_since?: string | null
  price_frozen_until?: string | null
}

function fromRow(row: AdminVenueRow): AdminVenue {
  return {
    id: row.venue_id,
    slug: row.slug ?? '',
    venueName: row.venue_name,
    createdAt: row.created_at,
    planStatus: row.plan_status,
    trialEndsAt: row.trial_ends_at ?? undefined,
    isDemo: row.is_demo,
    ownerName: row.owner_name ?? undefined,
    ownerWhatsapp: row.owner_whatsapp ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    reservationsCount: Number(row.reservations_count),
    lastActivityAt: row.last_activity_at ?? undefined,
    paidSince: row.paid_since ?? undefined,
    priceFrozenUntil: row.price_frozen_until ?? undefined,
  }
}

interface PlatformAdminState {
  // null mientras todavia no se sabe si el usuario es administrador.
  isAdmin: boolean | null
  venues: AdminVenue[]
  loading: boolean
  checkAdmin: (userId: string) => Promise<void>
  fetchVenues: () => Promise<string | null>
  activateVenue: (venueId: string) => Promise<string | null>
  extendTrial: (venueId: string, days: number) => Promise<string | null>
  suspendVenue: (venueId: string) => Promise<string | null>
  reset: () => void
}

// Vista de superadministrador: todo pasa por funciones de la base
// (admin_list_venues, admin_set_plan) que solo responden a quien esta en
// platform_admins. La app no decide quien es administrador.
export const usePlatformAdminStore = create<PlatformAdminState>()((set, get) => ({
  isAdmin: null,
  venues: [],
  loading: false,
  checkAdmin: async (userId) => {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    set({ isAdmin: !error && !!data })
  },
  fetchVenues: async () => {
    set({ loading: true })
    const { data, error } = await supabase.rpc('admin_list_venues')
    set({ loading: false })
    if (error || !data) return error?.message ?? 'No se pudo cargar la lista de complejos.'
    set({ venues: (data as AdminVenueRow[]).map(fromRow) })
    return null
  },
  activateVenue: async (venueId) => {
    const { error } = await supabase.rpc('admin_set_plan', {
      p_venue_id: venueId,
      p_action: 'activate',
    })
    if (error) return error.message
    return get().fetchVenues()
  },
  extendTrial: async (venueId, days) => {
    const { error } = await supabase.rpc('admin_set_plan', {
      p_venue_id: venueId,
      p_action: 'extend',
      p_days: days,
    })
    if (error) return error.message
    return get().fetchVenues()
  },
  suspendVenue: async (venueId) => {
    const { error } = await supabase.rpc('admin_set_plan', {
      p_venue_id: venueId,
      p_action: 'suspend',
    })
    if (error) return error.message
    return get().fetchVenues()
  },
  reset: () => set({ isAdmin: null, venues: [], loading: false }),
}))
