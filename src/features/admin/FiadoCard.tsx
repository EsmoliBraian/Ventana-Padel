import { useMemo, useState } from 'react'
import { useSalesStore } from '@/store/salesStore'
import { useProductsStore } from '@/store/productsStore'
import { formatCurrency } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'
import { PaymentLinesEditor } from '@/components/admin/PaymentLinesEditor'
import { linesTotal, type PaymentLine } from '@/lib/payments'
import { usePaymentMethodsStore } from '@/store/paymentMethodsStore'
import type { Sale, SaleItem } from '@/types'

function productName(products: { id: string; name: string }[], productId: string) {
  return products.find((p) => p.id === productId)?.name ?? productId
}

function CobrarModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const settleSale = useSalesStore((s) => s.settleSale)
  const products = useProductsStore((s) => s.products)
  const methods = usePaymentMethodsStore((s) => s.methods)

  const [lines, setLines] = useState<PaymentLine[]>([
    { method: methods[0]?.name ?? '', amount: String(sale.total) },
  ])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const paid = linesTotal(lines)

  async function handleConfirm() {
    if (paid !== sale.total) {
      setError(`Los pagos tienen que sumar ${formatCurrency(sale.total)}.`)
      return
    }
    setSaving(true)
    const settleError = await settleSale(
      sale.id,
      lines.map((line) => ({ method: line.method, amount: Number(line.amount) || 0 })),
    )
    setSaving(false)
    if (settleError) {
      setError(settleError)
      return
    }
    onClose()
  }

  return (
    <Modal title="Cobrar deuda" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-medium text-gray-100">{sale.customerName}</p>
        <p className="text-xs text-gray-500">
          {sale.items.map((item) => `${item.qty}x ${productName(products, item.productId)}`).join(', ')}
        </p>
        <p className="text-lg font-semibold text-gray-50">{formatCurrency(sale.total)}</p>

        <PaymentLinesEditor lines={lines} methods={methods} onChange={setLines} />
        <p className="text-xs text-gray-500">
          Cargado: {formatCurrency(paid)} de {formatCurrency(sale.total)}
        </p>

        <ErrorText error={error} />

        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="w-full rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Confirmar cobro'}
        </button>
      </div>
    </Modal>
  )
}

function EditarProductosModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const products = useProductsStore((s) => s.products)
  const updateSaleItems = useSalesStore((s) => s.updateSaleItems)

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const item of sale.items) initial[item.productId] = item.qty
    return initial
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cartProducts = products.filter((p) => (quantities[p.id] ?? 0) > 0)
  const visibleProducts = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, searchQuery])

  function handleQtyChange(productId: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] ?? 0) + delta),
    }))
  }

  async function handleSave() {
    const items: SaleItem[] = cartProducts.map((p) => ({
      productId: p.id,
      qty: quantities[p.id],
      unitPrice: p.price,
    }))
    setSaving(true)
    const saveError = await updateSaleItems(sale.id, items)
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onClose()
  }

  return (
    <Modal title="Editar productos" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-medium text-gray-100">{sale.customerName}</p>

        <div className="relative">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
          />
          {visibleProducts.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 shadow-lg">
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    handleQtyChange(p.id, 1)
                    setSearchQuery('')
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                >
                  <span>{p.name}</span>
                  <span className="text-gray-500">{formatCurrency(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {cartProducts.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {p.name} <span className="text-gray-500">{formatCurrency(p.price)}</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQtyChange(p.id, -1)}
                  className="h-6 w-6 rounded bg-gray-800 text-gray-300"
                >
                  -
                </button>
                <span className="w-4 text-center text-gray-100">{quantities[p.id]}</span>
                <button
                  type="button"
                  onClick={() => handleQtyChange(p.id, 1)}
                  className="h-6 w-6 rounded bg-gray-800 text-gray-300"
                >
                  +
                </button>
              </div>
            </div>
          ))}
          {cartProducts.length === 0 && (
            <p className="text-sm text-gray-500">Sin productos. Busca uno para agregarlo.</p>
          )}
        </div>

        <ErrorText error={error} />

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </Modal>
  )
}

export function FiadoCard() {
  const sales = useSalesStore((s) => s.sales)
  const products = useProductsStore((s) => s.products)
  const deleteSale = useSalesStore((s) => s.deleteSale)
  const [cobrarSale, setCobrarSale] = useState<Sale | null>(null)
  const [editSale, setEditSale] = useState<Sale | null>(null)
  const [confirmCancelSale, setConfirmCancelSale] = useState<Sale | null>(null)

  const pendingSales = useMemo(
    () =>
      sales
        .filter((s) => s.paymentStatus === 'adeuda')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sales],
  )

  async function handleCancelarDeuda() {
    if (!confirmCancelSale) return
    await deleteSale(confirmCancelSale.id)
    setConfirmCancelSale(null)
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-sm font-medium text-gray-300">Fiado</p>

      <div className="space-y-2">
        {pendingSales.map((sale) => (
          <div key={sale.id} className="rounded-lg border border-gray-800 p-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-100">{sale.customerName}</span>
              <span className="text-gray-100">{formatCurrency(sale.total)}</span>
            </div>
            <p className="text-xs text-gray-500">
              {sale.items
                .map((item) => `${item.qty}x ${productName(products, item.productId)}`)
                .join(', ')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCobrarSale(sale)}
                className="text-xs text-primary-500 hover:underline"
              >
                Cobrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancelSale(sale)}
                className="text-xs text-danger hover:underline"
              >
                Cancelar deuda
              </button>
            </div>
            <button
              type="button"
              onClick={() => setEditSale(sale)}
              className="mt-2 w-full rounded-lg border border-gray-700 py-1 text-xs text-gray-300 hover:bg-gray-800"
            >
              Editar productos
            </button>
          </div>
        ))}
        {pendingSales.length === 0 && (
          <p className="text-sm text-gray-500">No hay fiado pendiente.</p>
        )}
      </div>

      {cobrarSale && <CobrarModal sale={cobrarSale} onClose={() => setCobrarSale(null)} />}
      {editSale && <EditarProductosModal sale={editSale} onClose={() => setEditSale(null)} />}
      {confirmCancelSale && (
        <ConfirmDialog
          title="Cancelar deuda"
          message={`¿Cancelar la deuda de ${confirmCancelSale.customerName ?? 'este cliente'}? Esta accion no se puede deshacer.`}
          confirmLabel="Cancelar deuda"
          onConfirm={handleCancelarDeuda}
          onCancel={() => setConfirmCancelSale(null)}
        />
      )}
    </div>
  )
}
