import { stockStatus } from '@/lib/stock'
import type { Product } from '@/types'

// Etiqueta de stock de un producto. No muestra nada si el producto no lleva
// control de stock.
export function StockBadge({ product }: { product: Product }) {
  const status = stockStatus(product)
  if (status === 'untracked') return null

  if (status === 'out') {
    return (
      <span className="whitespace-nowrap rounded-full border border-danger-border/40 bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
        Sin stock
      </span>
    )
  }
  if (status === 'low') {
    return (
      <span className="whitespace-nowrap rounded-full border border-warning-border/40 bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
        Stock bajo: {product.stock}
      </span>
    )
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
      Stock: {product.stock}
    </span>
  )
}
