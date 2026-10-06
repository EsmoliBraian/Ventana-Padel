import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { PaymentMethod, PaymentStatus, Sale, SaleItem, SalePayment } from '@/types'
import { toDateKey } from '@/lib/format'

interface SaleItemRow {
  product_id: string
  qty: number
  unit_price: number
}

interface SalePaymentRow {
  method: SalePayment['method']
  amount: number
}

interface SaleRow {
  id: string
  date: string
  total: number
  payment_method: PaymentMethod | null
  payment_status: PaymentStatus
  customer_name: string | null
  reservation_id: string | null
  sale_items: SaleItemRow[]
  sale_payments: SalePaymentRow[]
}

function fromRow(row: SaleRow): Sale {
  return {
    id: row.id,
    date: row.date,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    customerName: row.customer_name ?? undefined,
    reservationId: row.reservation_id ?? undefined,
    items: row.sale_items.map((item) => ({
      productId: item.product_id,
      qty: item.qty,
      unitPrice: item.unit_price,
    })),
    payments: row.sale_payments.map((p) => ({ method: p.method, amount: p.amount })),
  }
}

interface SalesState {
  sales: Sale[]
  loading: boolean
  fetchSales: () => Promise<void>
  addSale: (
    items: SaleItem[],
    paymentMethod: PaymentMethod | null,
    payments: SalePayment[],
    reservationId?: string,
    customerName?: string,
    reservationFee?: number,
  ) => Promise<string | null>
  settleSale: (
    id: string,
    paymentMethod: PaymentMethod,
    payments: SalePayment[],
  ) => Promise<string | null>
  deleteSale: (id: string) => Promise<string | null>
  updateSaleItems: (id: string, items: SaleItem[]) => Promise<string | null>
}

export const useSalesStore = create<SalesState>()((set, get) => ({
  sales: [],
  loading: false,
  fetchSales: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*), sale_payments(*)')
      .eq('venue_id', venueId)
      .order('date')
    if (!error && data) set({ sales: data.map(fromRow) })
    set({ loading: false })
  },
  addSale: async (items, paymentMethod, payments, reservationId, customerName, reservationFee = 0) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const itemsTotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
    const total = itemsTotal + reservationFee
    const date = toDateKey(new Date())
    const paymentStatus: PaymentStatus = paymentMethod ? 'pagado' : 'adeuda'

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        venue_id: venueId,
        date,
        total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        customer_name: customerName ?? null,
        reservation_id: reservationId ?? null,
      })
      .select()
      .single()
    if (saleError || !sale) return saleError?.message ?? 'No se pudo registrar la venta.'

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('sale_items').insert(
        items.map((item) => ({
          venue_id: venueId,
          sale_id: sale.id,
          product_id: item.productId,
          qty: item.qty,
          unit_price: item.unitPrice,
        })),
      )
      if (itemsError) return itemsError.message
    }

    if (paymentMethod === 'mixto' && payments.length > 0) {
      const { error: paymentsError } = await supabase.from('sale_payments').insert(
        payments.map((p) => ({ venue_id: venueId, sale_id: sale.id, method: p.method, amount: p.amount })),
      )
      if (paymentsError) return paymentsError.message
    }

    set({
      sales: [
        ...get().sales,
        {
          id: sale.id,
          date,
          total,
          paymentMethod,
          paymentStatus,
          customerName,
          reservationId,
          items,
          payments: paymentMethod === 'mixto' ? payments : [],
        },
      ],
    })
    return null
  },
  settleSale: async (id, paymentMethod, payments) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { error } = await supabase
      .from('sales')
      .update({ payment_status: 'pagado', payment_method: paymentMethod })
      .eq('id', id)
    if (error) return error.message

    if (paymentMethod === 'mixto' && payments.length > 0) {
      const { error: paymentsError } = await supabase.from('sale_payments').insert(
        payments.map((p) => ({ venue_id: venueId, sale_id: id, method: p.method, amount: p.amount })),
      )
      if (paymentsError) return paymentsError.message
    }

    set({
      sales: get().sales.map((s) =>
        s.id === id
          ? {
              ...s,
              paymentStatus: 'pagado',
              paymentMethod,
              payments: paymentMethod === 'mixto' ? payments : [],
            }
          : s,
      ),
    })
    return null
  },
  deleteSale: async (id) => {
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) return error.message
    set({ sales: get().sales.filter((s) => s.id !== id) })
    return null
  },
  updateSaleItems: async (id, items) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const sale = get().sales.find((s) => s.id === id)
    if (!sale) return 'No se encontro la venta.'

    const currentItemsTotal = sale.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
    const extraFee = sale.total - currentItemsTotal
    const newTotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) + extraFee

    const { error: deleteError } = await supabase.from('sale_items').delete().eq('sale_id', id)
    if (deleteError) return deleteError.message

    if (items.length > 0) {
      const { error: insertError } = await supabase.from('sale_items').insert(
        items.map((item) => ({
          venue_id: venueId,
          sale_id: id,
          product_id: item.productId,
          qty: item.qty,
          unit_price: item.unitPrice,
        })),
      )
      if (insertError) return insertError.message
    }

    const { error: totalError } = await supabase.from('sales').update({ total: newTotal }).eq('id', id)
    if (totalError) return totalError.message

    set({
      sales: get().sales.map((s) => (s.id === id ? { ...s, items, total: newTotal } : s)),
    })
    return null
  },
}))
