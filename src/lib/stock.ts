import type { Product, StockMovementType } from '@/types'

export type StockStatus = 'untracked' | 'ok' | 'low' | 'out'

// Estado del stock de un producto. "low" es cuando llego al minimo de alerta
// (o lo paso); sin minimo cargado solo se avisa cuando no queda nada.
export function stockStatus(product: Pick<Product, 'trackStock' | 'stock' | 'stockMin'>): StockStatus {
  if (!product.trackStock) return 'untracked'
  if (product.stock <= 0) return 'out'
  if (product.stockMin !== undefined && product.stock <= product.stockMin) return 'low'
  return 'ok'
}

export function needsRestock(product: Pick<Product, 'trackStock' | 'stock' | 'stockMin'>): boolean {
  const status = stockStatus(product)
  return status === 'low' || status === 'out'
}

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  inicial: 'Stock inicial',
  entrada: 'Entrada (compra)',
  venta: 'Venta',
  devolucion: 'Reingreso por venta anulada o editada',
  merma: 'Salida (merma)',
  ajuste: 'Ajuste por conteo',
}
