import { useEffect, useState } from 'react'
import { useProductsStore } from '@/store/productsStore'
import { Modal } from '@/components/Modal'
import { ErrorText } from '@/components/ErrorText'
import { StockBadge } from '@/components/admin/StockBadge'
import { STOCK_MOVEMENT_LABELS } from '@/lib/stock'
import type { Product, StockMovement } from '@/types'

type ManualKind = 'entrada' | 'merma' | 'ajuste'

const KIND_OPTIONS: { id: ManualKind; label: string; help: string; qtyLabel: string }[] = [
  {
    id: 'entrada',
    label: 'Entrada',
    help: 'Mercadería que entra por una compra.',
    qtyLabel: 'Cantidad que entra',
  },
  {
    id: 'merma',
    label: 'Salida',
    help: 'Rotura, vencimiento o consumo interno. Las ventas se descuentan solas.',
    qtyLabel: 'Cantidad que sale',
  },
  {
    id: 'ajuste',
    label: 'Conteo',
    help: 'Contaste la mercadería y querés corregir el número.',
    qtyLabel: 'Cantidad real que hay',
  },
]

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Stock de un producto: existencia actual, carga de entradas, salidas y
// conteos, y el registro de movimientos (las ventas aparecen solas).
export function StockModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const product = useProductsStore((s) => s.products.find((p) => p.id === productId)) as Product | undefined
  const addStockMovement = useProductsStore((s) => s.addStockMovement)
  const fetchStockMovements = useProductsStore((s) => s.fetchStockMovements)

  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [kind, setKind] = useState<ManualKind>('entrada')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchStockMovements(productId).then(setMovements)
  }, [fetchStockMovements, productId])

  if (!product) return null

  const option = KIND_OPTIONS.find((o) => o.id === kind) ?? KIND_OPTIONS[0]
  const amount = Number(qty)
  const validAmount = qty.trim() !== '' && Number.isInteger(amount) && (kind === 'ajuste' ? amount >= 0 : amount > 0)

  async function handleSave() {
    if (!product || !validAmount) return
    // El registro guarda la diferencia: positivo si entra, negativo si sale.
    let delta = amount
    if (kind === 'merma') delta = -amount
    if (kind === 'ajuste') delta = amount - product.stock
    if (delta === 0) {
      setError('El stock ya es ese número, no hay nada que corregir.')
      return
    }
    setSaving(true)
    const saveError = await addStockMovement(product.id, kind, delta, note.trim())
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setError(null)
    setQty('')
    setNote('')
    setMovements(await fetchStockMovements(product.id))
  }

  return (
    <Modal title={`Stock de ${product.name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-925 px-3 py-2">
          <div>
            <p className="text-xs text-gray-500">Stock actual</p>
            <p className="text-2xl font-semibold text-gray-50">{product.stock}</p>
          </div>
          <div className="text-right">
            <StockBadge product={product} />
            <p className="mt-1 text-xs text-gray-500">
              {product.stockMin !== undefined ? `Aviso cuando quedan ${product.stockMin} o menos` : 'Sin mínimo de aviso'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-gray-200">Registrar movimiento</p>
          <div className="grid grid-cols-3 gap-2">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setKind(o.id)
                  setError(null)
                }}
                className={`rounded-lg border py-1.5 text-xs font-medium ${
                  kind === o.id
                    ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                    : 'border-gray-800 text-gray-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{option.help}</p>
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <label className="block text-xs text-gray-400">
              {option.qtyLabel}
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Nota (opcional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Proveedor, motivo..."
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
              />
            </label>
          </div>
          <ErrorText error={error} />
          <button
            type="button"
            onClick={handleSave}
            disabled={!validAmount || saving}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>

        <div>
          <p className="mb-2 font-medium text-gray-200">Movimientos</p>
          {movements === null && <p className="text-xs text-gray-500">Cargando...</p>}
          {movements !== null && movements.length === 0 && (
            <p className="text-xs text-gray-500">Todavía no hay movimientos.</p>
          )}
          {movements !== null && movements.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-925 px-3 py-1.5 text-xs">
                  <span className="min-w-0 text-gray-300">
                    {STOCK_MOVEMENT_LABELS[m.type]}
                    {m.note && <span className="text-gray-500"> · {m.note}</span>}
                    <span className="block text-gray-500">{formatWhen(m.createdAt)}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${m.qty > 0 ? 'text-success' : 'text-danger'}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
