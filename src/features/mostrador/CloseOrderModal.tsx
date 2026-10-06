import { useState } from 'react'
import { useSalesStore } from '@/store/salesStore'
import { useProductsStore } from '@/store/productsStore'
import { usePaymentMethodsStore } from '@/store/paymentMethodsStore'
import { PaymentLinesEditor } from '@/components/admin/PaymentLinesEditor'
import { linesTotal, type PaymentLine } from '@/lib/payments'
import { ErrorText } from '@/components/ErrorText'
import { formatCurrency } from '@/lib/format'
import { discountAmount, itemsSubtotal, orderNumberLabel } from '@/lib/orders'
import type { Sale } from '@/types'

const SPLIT_OPTIONS = [2, 3, 4]

interface CloseOrderModalProps {
  sale: Sale
  onClose: () => void
  onClosed: () => void
}

// Cierre del pedido: a la izquierda lo consumido, a la derecha los pagos.
// Se cierra cuando los pagos cubren el total, o dejandolo entero como fiado.
export function CloseOrderModal({ sale, onClose, onClosed }: CloseOrderModalProps) {
  const closeOrder = useSalesStore((s) => s.closeOrder)
  const products = useProductsStore((s) => s.products)
  const methods = usePaymentMethodsStore((s) => s.methods)

  const firstMethod = methods[0]?.name ?? ''
  const [lines, setLines] = useState<PaymentLine[]>([{ method: firstMethod, amount: String(sale.total) }])
  const [fiado, setFiado] = useState(false)
  const [fiadoName, setFiadoName] = useState(sale.customerName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const paid = linesTotal(lines)
  const change = Math.max(0, paid - sale.total)
  const missing = Math.max(0, sale.total - paid)
  const discount = discountAmount(sale)
  const subtotal = itemsSubtotal(sale) + (sale.courtFee ?? 0)
  const canClose = fiado ? fiadoName.trim() !== '' : missing === 0

  function productName(productId: string) {
    return products.find((p) => p.id === productId)?.name ?? 'Producto'
  }

  // Division de cuenta: reparte el total en partes iguales, una linea por
  // persona; los montos y los medios se pueden ajustar despues.
  function splitEvenly(parts: number) {
    const base = Math.floor(sale.total / parts)
    const rest = sale.total - base * parts
    setLines(
      Array.from({ length: parts }, (_, i) => ({
        method: lines[i]?.method ?? firstMethod,
        amount: String(base + (i === 0 ? rest : 0)),
      })),
    )
  }

  async function handleClose() {
    setSaving(true)
    const closeError = fiado
      ? await closeOrder(sale.id, [], fiadoName.trim())
      : await closeOrder(
          sale.id,
          lines.map((line) => ({ method: line.method, amount: Number(line.amount) || 0 })),
        )
    setSaving(false)
    if (closeError) {
      setError(closeError)
      return
    }
    onClosed()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div
        role="dialog"
        aria-label={`Cerrar pedido ${orderNumberLabel(sale)}`}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-mo-border bg-mo-surface"
      >
        <div className="flex items-center justify-between bg-mo-header px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mo-text">
            Cerrar pedido {orderNumberLabel(sale)}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-xl leading-none text-mo-muted hover:text-mo-text">
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <section className="flex flex-col rounded-lg border border-mo-border">
            <h3 className="bg-mo-header/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-mo-text">
              Adiciones
            </h3>
            <ul className="flex-1 divide-y divide-mo-border text-sm">
              {sale.items.map((item, i) => (
                <li key={item.id ?? i} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 text-mo-muted">{item.qty}</span>
                  <span className="min-w-0 flex-1 text-mo-text">{productName(item.productId)}</span>
                  <span className="text-mo-text">{formatCurrency(item.qty * item.unitPrice)}</span>
                </li>
              ))}
              {(sale.courtFee ?? 0) > 0 && (
                <li className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 text-mo-muted">1</span>
                  <span className="flex-1 text-mo-text">Cancha</span>
                  <span className="text-mo-text">{formatCurrency(sale.courtFee ?? 0)}</span>
                </li>
              )}
              {sale.items.length === 0 && (sale.courtFee ?? 0) === 0 && (
                <li className="px-3 py-4 text-mo-muted">El pedido no tiene productos.</li>
              )}
            </ul>
            <div className="space-y-1 border-t border-mo-border px-3 py-2 text-sm">
              <p className="flex justify-between text-mo-muted">
                Subtotal <span>{formatCurrency(subtotal)}</span>
              </p>
              {discount > 0 && (
                <p className="flex justify-between text-mo-muted">
                  Descuento{sale.discount?.reason ? ` (${sale.discount.reason})` : ''}
                  <span>− {formatCurrency(discount)}</span>
                </p>
              )}
            </div>
            <p className="flex justify-between bg-mo-header px-3 py-2 text-base font-semibold text-mo-text">
              Total <span>{formatCurrency(sale.total)}</span>
            </p>
          </section>

          <section className="flex flex-col rounded-lg border border-mo-border">
            <h3 className="bg-mo-header/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-mo-text">
              Pago
            </h3>
            <div className="flex-1 space-y-3 p-3">
              <label className="flex items-center gap-2 text-sm text-mo-text">
                <input type="checkbox" checked={fiado} onChange={(e) => setFiado(e.target.checked)} />
                Dejar como fiado
              </label>

              {fiado ? (
                <label className="block text-xs text-mo-muted">
                  A nombre de
                  <input
                    value={fiadoName}
                    onChange={(e) => setFiadoName(e.target.value)}
                    placeholder="Quién se lo lleva fiado"
                    className="mt-1 w-full rounded-lg border border-mo-border bg-mo-surface-alt px-3 py-2 text-sm text-mo-text"
                  />
                  <span className="mt-1 block">
                    El pedido entero queda como deuda. Se cobra después desde Fiado, en el Dashboard.
                  </span>
                </label>
              ) : (
                <>
                  <PaymentLinesEditor lines={lines} methods={methods} onChange={setLines} />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-mo-muted">
                    Dividir en partes iguales:
                    {SPLIT_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => splitEvenly(n)}
                        className="rounded-lg border border-mo-border px-2.5 py-1 text-mo-text hover:bg-mo-header/60"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLines([{ method: lines[0]?.method ?? firstMethod, amount: String(sale.total) }])}
                      className="text-mo-accent hover:underline"
                    >
                      Un solo pago
                    </button>
                  </div>
                </>
              )}
            </div>
            {!fiado && (
              <p
                className={`flex justify-between px-3 py-2 text-sm font-semibold ${
                  missing > 0 ? 'bg-mo-danger/15 text-mo-danger' : 'bg-mo-header text-mo-text'
                }`}
              >
                {missing > 0 ? 'Falta' : 'Vuelto'}
                <span>{formatCurrency(missing > 0 ? missing : change)}</span>
              </p>
            )}
          </section>
        </div>

        <div className="border-t border-mo-border bg-mo-surface-alt px-5 py-3">
          <ErrorText error={error} />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-mo-border px-5 py-2 text-sm text-mo-text hover:bg-mo-header/60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={!canClose || saving}
              className="rounded-lg bg-mo-accent px-5 py-2 text-sm font-semibold text-mo-accent-contrast hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Cerrando...' : fiado ? 'Cerrar como fiado' : 'Cerrar pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
