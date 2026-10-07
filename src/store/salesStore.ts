import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import { useProductsStore } from '@/store/productsStore'
import type { PaymentStatus, Sale, SaleDiscount, SaleItem, SalePayment, SaleStatus } from '@/types'
import { toDateKey } from '@/lib/format'

interface SaleItemRow {
  id?: string
  product_id: string
  qty: number
  unit_price: number
  comment?: string | null
}

interface SalePaymentRow {
  method: string
  amount: number
}

// Las columnas marcadas como opcionales son de la migracion 020 (Mostrador);
// pueden faltar si todavia no se corrio.
interface SaleRow {
  id: string
  date: string
  total: number
  payment_method: string | null
  payment_status: PaymentStatus
  customer_name: string | null
  reservation_id: string | null
  status?: SaleStatus
  order_number?: number | null
  created_at?: string | null
  closed_at?: string | null
  cantinero?: string | null
  comment?: string | null
  fixed_slot_id?: string | null
  court_fee?: number | null
  discount_type?: SaleDiscount['type'] | null
  discount_value?: number | null
  discount_reason?: string | null
  sale_items: SaleItemRow[]
  sale_payments: SalePaymentRow[]
}

function fromRow(row: SaleRow): Sale {
  return {
    id: row.id,
    number: row.order_number ?? undefined,
    status: row.status ?? 'cerrada',
    date: row.date,
    createdAt: row.created_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    customerName: row.customer_name ?? undefined,
    reservationId: row.reservation_id ?? undefined,
    fixedSlotId: row.fixed_slot_id ?? undefined,
    cantinero: row.cantinero ?? undefined,
    comment: row.comment ?? '',
    courtFee: row.court_fee ?? null,
    discount:
      row.discount_type && (row.discount_value ?? 0) > 0
        ? { type: row.discount_type, value: row.discount_value ?? 0, reason: row.discount_reason ?? '' }
        : undefined,
    items: row.sale_items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      qty: item.qty,
      unitPrice: item.unit_price,
      comment: item.comment ?? '',
    })),
    payments: row.sale_payments.map((p) => ({ method: p.method, amount: p.amount })),
  }
}

const SALE_SELECT = '*, sale_items(*), sale_payments(*)'

// La base descuenta (o devuelve) stock cuando cambian los items de una
// venta, asi que despues de tocarlos se vuelven a leer los productos.
function refreshStock() {
  if (useProductsStore.getState().products.some((p) => p.trackStock)) {
    useProductsStore.getState().fetchProducts()
  }
}

function orderErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === '23505' && error.message.includes('court_fee')) {
    return 'La cancha de este turno ya está cargada en otro pedido.'
  }
  return error.message
}

export interface NewOrderInput {
  reservationId?: string
  fixedSlotId?: string
  customerName?: string
  cantinero?: string
  comment?: string
}

interface SalesState {
  sales: Sale[]
  loading: boolean
  fetchSales: () => Promise<void>
  subscribeToChanges: () => () => void
  // --- Mostrador: pedidos ---
  createOrder: (input: NewOrderInput) => Promise<{ id: string | null; error: string | null }>
  confirmItems: (saleId: string, items: SaleItem[]) => Promise<string | null>
  removeItem: (saleId: string, itemId: string) => Promise<string | null>
  setCourtFee: (saleId: string, courtFee: number) => Promise<string | null>
  setDiscount: (saleId: string, discount: SaleDiscount | null) => Promise<string | null>
  closeOrder: (saleId: string, payments: SalePayment[], fiadoName?: string) => Promise<string | null>
  voidOrder: (saleId: string) => Promise<string | null>
  // --- Fiado ---
  settleSale: (id: string, payments: SalePayment[]) => Promise<string | null>
  deleteSale: (id: string) => Promise<string | null>
  updateSaleItems: (id: string, items: SaleItem[]) => Promise<string | null>
}

export const useSalesStore = create<SalesState>()((set, get) => {
  // Vuelve a leer un pedido despues de cambiarlo: el total lo calcula la base.
  async function reloadSale(id: string): Promise<string | null> {
    const { data, error } = await supabase.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle()
    if (error) return error.message
    if (!data) {
      set({ sales: get().sales.filter((s) => s.id !== id) })
      return null
    }
    const sale = fromRow(data as SaleRow)
    const exists = get().sales.some((s) => s.id === id)
    set({ sales: exists ? get().sales.map((s) => (s.id === id ? sale : s)) : [...get().sales, sale] })
    return null
  }

  return {
    sales: [],
    loading: false,
    fetchSales: async () => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return
      set({ loading: true })
      const { data, error } = await supabase
        .from('sales')
        .select(SALE_SELECT)
        .eq('venue_id', venueId)
        .order('date')
      if (!error && data) set({ sales: (data as SaleRow[]).map(fromRow) })
      set({ loading: false })
    },
    // Tiempo real: cuando otro dispositivo del complejo crea, modifica o
    // cierra un pedido, se vuelve a leer la lista. No se filtra por complejo
    // porque los avisos de borrado no traen ese dato; igual cada uno recibe y
    // lee solo lo que RLS le permite.
    subscribeToChanges: () => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return () => {}
      let timer: ReturnType<typeof setTimeout> | null = null
      const refresh = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          get().fetchSales()
          refreshStock()
        }, 250)
      }
      const channel = supabase
        .channel(`mostrador-${venueId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, refresh)
        .subscribe()
      return () => {
        if (timer) clearTimeout(timer)
        supabase.removeChannel(channel)
      }
    },
    createOrder: async (input) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return { id: null, error: 'No hay complejo activo.' }
      const { data, error } = await supabase
        .from('sales')
        .insert({
          venue_id: venueId,
          date: toDateKey(new Date()),
          total: 0,
          status: 'en_curso',
          payment_status: 'pendiente',
          payment_method: null,
          court_fee: 0,
          reservation_id: input.reservationId ?? null,
          fixed_slot_id: input.fixedSlotId ?? null,
          customer_name: input.customerName?.trim() || null,
          cantinero: input.cantinero?.trim() || null,
          comment: input.comment?.trim() ?? '',
        })
        .select(SALE_SELECT)
        .single()
      if (error || !data) return { id: null, error: error?.message ?? 'No se pudo crear el pedido.' }
      const sale = fromRow(data as SaleRow)
      set({ sales: [...get().sales.filter((s) => s.id !== sale.id), sale] })
      return { id: sale.id, error: null }
    },
    // Confirmar suma lineas nuevas, nunca reemplaza las que hay: dos
    // dispositivos cargando al mismo pedido no se pisan. El stock se
    // descuenta aca (lo hace la base al insertar cada linea).
    confirmItems: async (saleId, items) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return 'No hay complejo activo.'
      if (items.length === 0) return null
      const { error } = await supabase.from('sale_items').insert(
        items.map((item) => ({
          venue_id: venueId,
          sale_id: saleId,
          product_id: item.productId,
          qty: item.qty,
          unit_price: item.unitPrice,
          comment: item.comment ?? '',
        })),
      )
      if (error) return error.message
      refreshStock()
      return reloadSale(saleId)
    },
    removeItem: async (saleId, itemId) => {
      const { error } = await supabase.from('sale_items').delete().eq('id', itemId)
      if (error) return error.message
      refreshStock()
      return reloadSale(saleId)
    },
    setCourtFee: async (saleId, courtFee) => {
      const { error } = await supabase
        .from('sales')
        .update({ court_fee: courtFee })
        .eq('id', saleId)
        .eq('status', 'en_curso')
      if (error) return orderErrorMessage(error)
      return reloadSale(saleId)
    },
    setDiscount: async (saleId, discount) => {
      const { error } = await supabase
        .from('sales')
        .update({
          discount_type: discount?.type ?? null,
          discount_value: discount?.value ?? 0,
          discount_reason: discount?.reason ?? '',
        })
        .eq('id', saleId)
        .eq('status', 'en_curso')
      if (error) return error.message
      return reloadSale(saleId)
    },
    // El cierre lo hace la base en un solo paso (close_order): valida que los
    // pagos cubran el total y que nadie lo haya cerrado antes.
    closeOrder: async (saleId, payments, fiadoName) => {
      const { error } = await supabase.rpc('close_order', {
        p_sale_id: saleId,
        p_payments: payments,
        p_fiado_name: fiadoName ?? null,
        p_date: toDateKey(new Date()),
      })
      if (error) {
        await reloadSale(saleId)
        return error.message
      }
      return reloadSale(saleId)
    },
    // Anular borra el pedido; la base devuelve al stock lo que estaba
    // confirmado. Solo pedidos en curso.
    voidOrder: async (saleId) => {
      const { data, error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)
        .eq('status', 'en_curso')
        .select('id')
      if (error) return error.message
      if (!data || data.length === 0) {
        await reloadSale(saleId)
        return 'Este pedido ya no está en curso.'
      }
      set({ sales: get().sales.filter((s) => s.id !== saleId) })
      refreshStock()
      return null
    },
    // Cobrar un fiado: registra las lineas de pago y lo marca pagado.
    settleSale: async (id, payments) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return 'No hay complejo activo.'
      const lines = payments.filter((p) => p.amount > 0 && p.method.trim() !== '')
      if (lines.length === 0) return 'Cargá al menos un pago.'
      const paymentMethod = lines.length === 1 ? lines[0].method : 'mixto'

      const { error: paymentsError } = await supabase.from('sale_payments').insert(
        lines.map((p) => ({ venue_id: venueId, sale_id: id, method: p.method, amount: p.amount })),
      )
      if (paymentsError) return paymentsError.message

      const { error } = await supabase
        .from('sales')
        .update({ payment_status: 'pagado', payment_method: paymentMethod })
        .eq('id', id)
      if (error) return error.message
      return reloadSale(id)
    },
    deleteSale: async (id) => {
      const { error } = await supabase.from('sales').delete().eq('id', id)
      if (error) return error.message
      set({ sales: get().sales.filter((s) => s.id !== id) })
      refreshStock()
      return null
    },
    // Edicion de los productos de una venta ya cerrada (fiado): reemplaza las
    // lineas y conserva lo que no eran productos (cancha, descuento).
    updateSaleItems: async (id, items) => {
      const venueId = useSettingsStore.getState().id
      if (!venueId) return 'No hay complejo activo.'
      const sale = get().sales.find((s) => s.id === id)
      if (!sale) return 'No se encontró la venta.'

      const currentItemsTotal = sale.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
      const extraFee = sale.total - currentItemsTotal
      const newTotal = Math.max(
        0,
        items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) + extraFee,
      )

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

      refreshStock()
      return reloadSale(id)
    },
  }
})
