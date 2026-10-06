import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsStore } from '@/store/settingsStore'
import type { Product } from '@/types'

interface ProductRow {
  id: string
  name: string
  description: string
  category_id: string | null
  price: number
}

function fromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id ?? undefined,
    price: row.price,
  }
}

interface ProductsState {
  products: Product[]
  loading: boolean
  fetchProducts: () => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<string | null>
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => Promise<string | null>
  deleteProduct: (id: string) => Promise<string | null>
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
      .select('id, name, description, category_id, price')
      .eq('venue_id', venueId)
      .order('name')
    if (!error && data) set({ products: data.map(fromRow) })
    set({ loading: false })
  },
  addProduct: async (product) => {
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
      })
      .select()
      .single()
    if (error) return error.message
    set({ products: [...get().products, fromRow(data)] })
    return null
  },
  updateProduct: async (id, patch) => {
    const row: Partial<ProductRow> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.description !== undefined) row.description = patch.description
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId ?? null
    if (patch.price !== undefined) row.price = patch.price

    const { error } = await supabase.from('products').update(row).eq('id', id)
    if (error) return error.message
    set({ products: get().products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
    return null
  },
  deleteProduct: async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) return error.message
    set({ products: get().products.filter((p) => p.id !== id) })
    return null
  },
}))
