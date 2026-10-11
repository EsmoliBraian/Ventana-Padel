import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { callFunction } from '@/lib/deposits'
import { useSettingsStore } from '@/store/settingsStore'
import type { Deposit, DepositPayment, MpConnection } from '@/types'

interface DepositRow {
  id: string
  reservation_id: string | null
  court_name: string
  date: string
  time: string
  price_total: number
  amount: number
  status: Deposit['status']
  expires_at: string
  mp_payment_id: number | null
  paid_at: string | null
  refund_reason: Deposit['refundReason'] | null
}

interface PaymentRow {
  mp_payment_id: number
  deposit_id: string
  amount: number
  paid_at: string
  status: DepositPayment['status']
  refund_reason: DepositPayment['refundReason'] | null
  refunded_at: string | null
}

interface ContactRow {
  reservation_id: string
  name: string
  whatsapp: string
}

interface DepositsState {
  // false si la base todavia no tiene la migracion 025: el panel no muestra
  // nada de la seña y todo sigue como siempre.
  available: boolean
  connection: MpConnection | null
  deposits: Deposit[]
  payments: DepositPayment[]
  fetchAll: () => Promise<void>
  subscribeToChanges: () => () => void
  connect: () => Promise<string | null>
  disconnect: () => Promise<string | null>
  markRefunded: (paymentId: number) => Promise<string | null>
  reset: () => void
}

// Señas con Mercado Pago, del lado del panel. Las credenciales nunca llegan
// aca: de la conexion solo se conoce el nombre de la cuenta y su estado.
export const useDepositsStore = create<DepositsState>()((set, get) => ({
  available: false,
  connection: null,
  deposits: [],
  payments: [],
  fetchAll: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    const conn = await supabase.rpc('my_mp_connection')
    if (conn.error) {
      set({ available: false, connection: null, deposits: [], payments: [] })
      return
    }
    const [deposits, payments, contacts] = await Promise.all([
      supabase.from('reservation_deposits').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(500),
      supabase.from('deposit_payments').select('*').eq('venue_id', venueId).order('paid_at', { ascending: false }).limit(500),
      supabase.from('reservation_contacts').select('reservation_id, name, whatsapp').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(500),
    ])
    const contactByReservation = new Map(((contacts.data ?? []) as ContactRow[]).map((c) => [c.reservation_id, c]))
    const connRow = (conn.data as { status: MpConnection['status']; account_label: string; connected_at: string; last_error: string | null }[] | null)?.[0]
    set({
      available: true,
      connection: connRow
        ? { status: connRow.status, accountLabel: connRow.account_label, connectedAt: connRow.connected_at, lastError: connRow.last_error ?? undefined }
        : null,
      deposits: ((deposits.data ?? []) as DepositRow[]).map((d) => {
        const contact = d.reservation_id ? contactByReservation.get(d.reservation_id) : undefined
        return {
          id: d.id,
          reservationId: d.reservation_id ?? undefined,
          courtName: d.court_name,
          date: d.date,
          time: d.time,
          priceTotal: Number(d.price_total),
          amount: Number(d.amount),
          status: d.status,
          expiresAt: d.expires_at,
          paymentId: d.mp_payment_id ?? undefined,
          paidAt: d.paid_at ?? undefined,
          refundReason: d.refund_reason ?? undefined,
          contactName: contact?.name,
          contactWhatsapp: contact?.whatsapp,
        }
      }),
      payments: ((payments.data ?? []) as PaymentRow[]).map((p) => ({
        paymentId: p.mp_payment_id,
        depositId: p.deposit_id,
        amount: Number(p.amount),
        paidAt: p.paid_at,
        status: p.status,
        refundReason: p.refund_reason ?? undefined,
        refundedAt: p.refunded_at ?? undefined,
      })),
    })
  },
  // Una seña que cambia (se paga, vence, queda a devolver) se ve al instante.
  subscribeToChanges: () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return () => {}
    const channel = supabase
      .channel(`deposits-changes-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_deposits', filter: `venue_id=eq.${venueId}` }, () => {
        get().fetchAll()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  },
  // Lleva al dueño a la autorizacion oficial de Mercado Pago.
  connect: async () => {
    const res = await callFunction<{ url?: string }>('mp-oauth-start', {}, true)
    if (!res.ok || !res.data.url) return res.data.message ?? 'No pudimos iniciar la conexión con Mercado Pago.'
    window.location.href = res.data.url
    return null
  },
  disconnect: async () => {
    const { error } = await supabase.rpc('disconnect_mp')
    if (error) return error.message
    useSettingsStore.setState({ depositEnabled: false })
    await get().fetchAll()
    return null
  },
  markRefunded: async (paymentId) => {
    const { error } = await supabase.rpc('mark_deposit_refunded', { p_payment_id: paymentId })
    if (error) return error.message
    await get().fetchAll()
    return null
  },
  reset: () => set({ available: false, connection: null, deposits: [], payments: [] }),
}))
