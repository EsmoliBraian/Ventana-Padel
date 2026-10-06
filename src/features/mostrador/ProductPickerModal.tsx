import { useMemo, useState } from 'react'
import { useProductsStore } from '@/store/productsStore'
import { useCategoriesStore } from '@/store/categoriesStore'
import { formatCurrency } from '@/lib/format'
import { stockStatus } from '@/lib/stock'

const ALL = '__todas__'
const NONE = '__sin_categoria__'

interface ProductPickerModalProps {
  onClose: () => void
  onAdd: (productIds: string[]) => void
}

// Ventana para adicionar productos solo con el mouse: categorias a la
// izquierda, productos de la categoria a la derecha. Se marcan varios y se
// agregan todos juntos con Continuar.
export function ProductPickerModal({ onClose, onAdd }: ProductPickerModalProps) {
  const products = useProductsStore((s) => s.products)
  const categories = useCategoriesStore((s) => s.categories)
  const [categoryId, setCategoryId] = useState(ALL)
  const [selected, setSelected] = useState<string[]>([])

  const hasUncategorized = products.some((p) => !p.categoryId)
  const visible = useMemo(() => {
    if (categoryId === ALL) return products
    if (categoryId === NONE) return products.filter((p) => !p.categoryId)
    return products.filter((p) => p.categoryId === categoryId)
  }, [products, categoryId])

  function toggle(productId: string) {
    setSelected((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]))
  }

  const tabs = [
    { id: ALL, name: 'Todos' },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    ...(hasUncategorized ? [{ id: NONE, name: 'Sin categoría' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div
        role="dialog"
        aria-label="Adicionar productos"
        className="flex h-full max-h-[36rem] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-mo-border bg-mo-surface"
      >
        <div className="flex items-center justify-between bg-mo-header px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mo-text">Adicionar</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-xl leading-none text-mo-muted hover:text-mo-text">
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Categorías"
            className="flex shrink-0 gap-1 overflow-x-auto bg-mo-surface-alt p-2 sm:w-48 sm:flex-col sm:gap-0 sm:overflow-y-auto sm:p-0"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryId(tab.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-left text-sm sm:rounded-none sm:py-3 ${
                  categoryId === tab.id
                    ? 'bg-mo-accent font-semibold text-mo-accent-contrast'
                    : 'text-mo-text hover:bg-mo-header/60'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>

          <ul className="min-h-0 flex-1 divide-y divide-mo-border overflow-y-auto">
            {visible.map((p) => {
              const isSelected = selected.includes(p.id)
              const status = stockStatus(p)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm ${
                      isSelected ? 'bg-mo-accent/15' : 'hover:bg-mo-surface-alt'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                        isSelected
                          ? 'border-mo-accent bg-mo-accent text-mo-accent-contrast'
                          : 'border-mo-muted text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 text-mo-text">
                      {p.name}
                      {status === 'out' && <span className="ml-2 text-xs font-medium text-mo-danger">Sin stock</span>}
                      {status === 'low' && (
                        <span className="ml-2 text-xs font-medium text-mo-pending">Quedan {p.stock}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-mo-text">{formatCurrency(p.price)}</span>
                  </button>
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className="px-4 py-6 text-sm text-mo-muted">No hay productos en esta categoría.</li>
            )}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-mo-border bg-mo-surface-alt px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-mo-border px-5 py-2 text-sm text-mo-text hover:bg-mo-header/60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onAdd(selected)}
            disabled={selected.length === 0}
            className="rounded-lg bg-mo-accent px-5 py-2 text-sm font-semibold text-mo-accent-contrast hover:opacity-90 disabled:opacity-40"
          >
            Continuar{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
