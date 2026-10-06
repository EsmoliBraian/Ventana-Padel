import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { Product, ProductInput, StockMovement, StockMovementType } from '@/types'

interface ProductRow {
  id: string
  name: string
  description: string
  category_id: string | null
  price: number
  // Columnas de la migracion 019; pueden faltar si todavia no se corrio.
  sku?: string | null
  track_stock?: boolean
  stock?: number
  stock_min?: number | null
}

interface StockMovementRow {
  id: string
  product_id: string
  type: StockMovementType
  qty: number
  note: string
  created_at: string
}

function fromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id ?? undefined,
    price: row.price,
    sku: row.sku ?? undefined,
    trackStock: row.track_stock ?? false,
    stock: row.stock ?? 0,
    stockMin: row.stock_min ?? undefined,
  }
}

function productErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === '23505' && error.message.includes('sku')) {
    return 'Ya hay otro producto con ese código.'
  }
  return error.message
}

interface ProductsState {
  products: Product[]
  loading: boolean
  fetchProducts: () => Promise<void>
  addProduct: (product: ProductInput, initialStock?: number) => Promise<string | null>
  updateProduct: (id: string, patch: Partial<ProductInput>) => Promise<string | null>
  deleteProduct: (id: string) => Promise<string | null>
  addStockMovement: (
    productId: string,
    type: 'inicial' | 'entrada' | 'merma' | 'ajuste',
    qty: number,
    note: string,
  ) => Promise<string | null>
  fetchStockMovements: (productId: string) => Promise<StockMovement[]>
}

export const useProductsStore = create<ProductsState>()((set, get) => ({
  products: [],
  loading: false,
  fetchProducts: async () => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('venue_id', venueId)
      .order('name')
    if (!error && data) set({ products: data.map(fromRow) })
    set({ loading: false })
  },
  addProduct: async (product, initialStock = 0) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { data, error } = await supabase
      .from('products')
      .insert({
        venue_id: venueId,
        name: product.name,
        description: product.description,
        category_id: product.categoryId ?? null,
        price: product.price,
        // Los datos de stock viajan solo si se usan.
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.trackStock ? { track_stock: true, stock_min: product.stockMin ?? null } : {}),
      })
      .select()
      .single()
    if (error) return productErrorMessage(error)
    set({ products: [...get().products, fromRow(data)] })
    if (product.trackStock && initialStock > 0) {
      return get().addStockMovement(data.id, 'inicial', initialStock, '')
    }
    return null
  },
  updateProduct: async (id, patch) => {
    const row: Partial<ProductRow> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.description !== undefined) row.description = patch.description
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId ?? null
    if (patch.price !== undefined) row.price = patch.price
    if ('sku' in patch) row.sku = patch.sku || null
    if (patch.trackStock !== undefined) row.track_stock = patch.trackStock
    if ('stockMin' in patch) row.stock_min = patch.stockMin ?? null

    const { error } = await supabase.from('products').update(row).eq('id', id)
    if (error) return productErrorMessage(error)
    set({ products: get().products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
    return null
  },
  deleteProduct: async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) return error.message
    set({ products: get().products.filter((p) => p.id !== id) })
    return null
  },
  // qty con signo: positivo entra, negativo sale. La base actualiza el stock
  // del producto con cada movimiento; aca se refleja el mismo cambio.
  addStockMovement: async (productId, type, qty, note) => {
    const venueId = useSettingsStore.getState().id
    if (!venueId) return 'No hay complejo activo.'
    const { error } = await supabase
      .from('stock_movements')
      .insert({ venue_id: venueId, product_id: productId, type, qty, note })
    if (error) return error.message
    set({
      products: get().products.map((p) => (p.id === productId ? { ...p, stock: p.stock + qty } : p)),
    })
    return null
  },
  fetchStockMovements: async (productId) => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, product_id, type, qty, note, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    return (data as StockMovementRow[]).map((row) => ({
      id: row.id,
      productId: row.product_id,
      type: row.type,
      qty: row.qty,
      note: row.note,
      createdAt: row.created_at,
    }))
  },
}))
