import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { deleteImage } from '@/lib/storage'
import { useSettingsStore } from '@/store/settingsStore'
import type { Ad, AdFormat, AdInput, AdLinkType, OwnerAd } from '@/types'

interface AdRow {
  id: string
  business_name: string
  image_url: string
  mobile_image_url: string | null
  caption: string
  link_type: AdLinkType | null
  link_value: string | null
  format: AdFormat
  placement: string
  starts_on: string
  ends_on: string | null
  active: boolean
}

interface OwnerAdRow extends AdRow {
  ad_billing: { monthly_amount: number; next_payment_on: string | null } | { monthly_amount: number; next_payment_on: string | null }[] | null
  ad_stats: { views: number; clicks: number }[] | null
}

function fromRow(row: AdRow): Ad {
  return {
    id: row.id,
    businessName: row.business_name,
    imageUrl: row.image_url,
    mobileImageUrl: row.mobile_image_url ?? undefined,
    caption: row.caption,
    linkType: row.link_type ?? undefined,
    linkValue: row.link_value ?? undefined,
    format: row.format,
    placement: row.placement,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    active: row.active,
  }
}

function fromOwnerRow(row: OwnerAdRow): OwnerAd {
  const billing = Array.isArray(row.ad_billing) ? row.ad_billing[0] : row.ad_billing
  const stats = row.ad_stats ?? []
  return {
    ...fromRow(row),
    monthlyAmount: billing?.monthly_amount ?? 0,
    nextPaymentOn: billing?.next_payment_on ?? undefined,
    views: stats.reduce((sum, s) => sum + s.views, 0),
    clicks: stats.reduce((sum, s) => sum + s.clicks, 0),
  }
}

function toRow(input: AdInput) {
  return {
    business_name: input.businessName.trim(),
    image_url: input.imageUrl,
    mobile_image_url: input.format === 'banner' ? (input.mobileImageUrl ?? null) : null,
    caption: input.caption.trim(),
    link_type: input.linkType && input.linkValue ? input.linkType : null,
    link_value: input.linkType && input.linkValue ? input.linkValue : null,
    format: input.format,
    placement: input.placement,
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    active: input.active,
  }
}

function adErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === '23514') {
    if (error.message.includes('ads_link_check')) return 'El enlace no tiene el formato correcto.'
    if (error.message.includes('ads_dates_check')) return 'La fecha "hasta" no puede ser anterior a la fecha "desde".'
    if (error.message.includes('business_name')) return 'El nombre del comercio va de 1 a 80 caracteres.'
    if (error.message.includes('caption')) return 'El texto corto admite hasta 140 caracteres.'
  }
  return error.message
}

const OWNER_SELECT = '*, ad_billing(monthly_amount, next_payment_on), ad_stats(views, clicks)'

interface AdsState {
  // Sitio publico: lo que ve cualquier visitante (activos y vigentes).
  visibleAds: Ad[]
  // Panel: todos los anuncios del complejo, con cobro y resultados.
  ads: OwnerAd[]
  fetchVisibleAds: () => Promise<void>
  fetchAds: () => Promise<void>
  addAd: (input: AdInput) => Promise<string | null>
  updateAd: (id: string, input: AdInput) => Promise<string | null>
  setActive: (id: string, active: boolean) => Promise<string | null>
  deleteAd: (id: string) => Promise<string | null>
  trackEvent: (adId: string, kind: 'view' | 'click') => void
}

export const useAdsStore = create<AdsState>()((set, get) => {
  async function saveBilling(adId: string, venueId: string, input: AdInput): Promise<string | null> {
    const { error } = await supabase.from('ad_billing').upsert({
      ad_id: adId,
      venue_id: venueId,
      monthly_amount: input.monthlyAmount,
      next_payment_on: input.nextPaymentOn ?? null,
    })
    return error ? error.message : null
  }

  return {
    visibleAds: [],
    ads: [],
    // El sitio consulta siempre por visible_ads(): aplica activo y vigencia
    // en la propia consulta, haya o no sesion. Asi el dueño ve en su sitio
    // exactamente lo mismo que el publico (un anuncio pausado no aparece).
    fetchVisibleAds: async () => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return
      const { data, error } = await supabase.rpc('visible_ads', { p_venue_id: venueId })
      // Sin la migracion 021 la funcion no existe: el sitio sigue sin anuncios.
      set({ visibleAds: !error && data ? (data as AdRow[]).map(fromRow) : [] })
    },
    fetchAds: async () => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return
      const { data, error } = await supabase
        .from('ads')
        .select(OWNER_SELECT)
        .eq('venue_id', venueId)
        .order('created_at')
      set({ ads: !error && data ? (data as OwnerAdRow[]).map(fromOwnerRow) : [] })
    },
    addAd: async (input) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return 'No hay complejo activo.'
      const { data, error } = await supabase
        .from('ads')
        .insert({ venue_id: venueId, ...toRow(input) })
        .select('id')
        .single()
      if (error || !data) return error ? adErrorMessage(error) : 'No se pudo crear el anuncio.'
      const billingError = await saveBilling(data.id, venueId, input)
      await get().fetchAds()
      return billingError
    },
    updateAd: async (id, input) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return 'No hay complejo activo.'
      const previous = get().ads.find((a) => a.id === id)
      const row = toRow(input)
      const { error } = await supabase.from('ads').update(row).eq('id', id)
      if (error) return adErrorMessage(error)
      const billingError = await saveBilling(id, venueId, input)
      // Imagenes reemplazadas: se borran del almacenamiento.
      if (previous) {
        if (previous.imageUrl !== row.image_url) deleteImage(previous.imageUrl).catch(() => {})
        if (previous.mobileImageUrl && previous.mobileImageUrl !== row.mobile_image_url) {
          deleteImage(previous.mobileImageUrl).catch(() => {})
        }
      }
      await get().fetchAds()
      return billingError
    },
    setActive: async (id, active) => {
      const { error } = await supabase.from('ads').update({ active }).eq('id', id)
      if (error) return adErrorMessage(error)
      set({ ads: get().ads.map((a) => (a.id === id ? { ...a, active } : a)) })
      return null
    },
    deleteAd: async (id) => {
      const ad = get().ads.find((a) => a.id === id)
      const { error } = await supabase.from('ads').delete().eq('id', id)
      if (error) return error.message
      set({ ads: get().ads.filter((a) => a.id !== id) })
      // deleteImage ignora lo que no esta en el almacenamiento (por ejemplo,
      // las imagenes del demo, que estan escritas en la propia base).
      if (ad) {
        deleteImage(ad.imageUrl).catch(() => {})
        if (ad.mobileImageUrl) deleteImage(ad.mobileImageUrl).catch(() => {})
      }
      return null
    },
    // Suma una vista o un clic. La base decide si cuenta (una por visitante,
    // por anuncio, por dia). Es accesorio: si falla, no se avisa a nadie.
    trackEvent: (adId, kind) => {
      supabase.rpc('track_ad_event', { p_ad_id: adId, p_kind: kind }).then(
        () => {},
        () => {},
      )
    },
  }
})
