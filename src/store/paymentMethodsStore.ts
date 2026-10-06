import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { DEFAULT_PAYMENT_METHODS, methodKey } from '@/lib/payments'
import type { PaymentMethodOption } from '@/types'

interface PaymentMethodsState {
  methods: PaymentMethodOption[]
  fetchMethods: () => Promise<void>
  addMethod: (name: string) => Promise<string | null>
  deleteMethod: (id: string) => Promise<string | null>
}

// Medios de pago del complejo. Si la tabla todavia no existe (migracion 020
// sin correr) se usa la lista por defecto, sin poder editarla.
const FALLBACK: PaymentMethodOption[] = DEFAULT_PAYMENT_METHODS.map((name) => ({ id: `default-${name}`, name }))

export const usePaymentMethodsStore = create<PaymentMethodsState>()((set, get) => ({
  methods: FALLBACK,
  fetchMethods: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name, sort_order')
      .eq('venue_id', venueId)
      .order('sort_order')
      .order('name')
    if (error || !data || data.length === 0) {
      set({ methods: FALLBACK })
      return
    }
    set({ methods: data.map((row) => ({ id: row.id, name: row.name })) })
  },
  addMethod: async (name) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const clean = name.trim()
    if (!clean) return 'Escribí el nombre del medio de pago.'
    if (methodKey(clean) === 'mixto') return 'Ese nombre está reservado, elegí otro.'
    if (get().methods.some((m) => methodKey(m.name) === methodKey(clean))) {
      return 'Ya tenés un medio de pago con ese nombre.'
    }
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({ venue_id: venueId, name: clean, sort_order: get().methods.length + 1 })
      .select('id, name')
      .single()
    if (error) return error.message
    set({ methods: [...get().methods.filter((m) => !m.id.startsWith('default-')), data] })
    return null
  },
  // Borrar un medio no toca las ventas ya cobradas con el: guardan el nombre.
  deleteMethod: async (id) => {
    if (get().methods.length <= 1) return 'Tiene que quedar al menos un medio de pago.'
    const { error } = await supabase.from('payment_methods').delete().eq('id', id)
    if (error) return error.message
    set({ methods: get().methods.filter((m) => m.id !== id) })
    return null
  },
}))
