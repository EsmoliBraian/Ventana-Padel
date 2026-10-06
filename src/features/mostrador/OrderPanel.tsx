import { useMemo, useState } from 'react'
import { useSalesStore } from '@/store/salesStore'
import { useProductsStore } from '@/store/productsStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'
import { formatCurrency } from '@/lib/format'
import { methodLabel, salePaymentLines } from '@/lib/payments'
import {
  discountAmount,
  formatOpenedAt,
  isFromPreviousDay,
  orderNumberLabel,
  orderWithCourtFee,
  turnoLabel,
  type Turno,
} from '@/lib/orders'
import { ProductPickerModal } from './ProductPickerModal'
import { CloseOrderModal } from './CloseOrderModal'
import type { Sale, SaleDiscount } from '@/types'

// Producto agregado pero todavia sin confirmar: vive solo en esta pantalla.
export interface PendingItem {
  key: string
  productId: string
  qty: number
  unitPrice: string
  comment: string
}

interface OrderPanelProps {
  sale: Sale
  turno?: Turno
  turnoOrders: Sale[] // los pedidos del mismo turno (incluye este)
  pending: PendingItem[]
  onPendingChange: (items: PendingItem[]) => void
  onBack: () => void
  onVoided: () => void
}

let pendingSeq = 0

export function OrderPanel({ sale, turno, turnoOrders, pending, onPendingChange, onBack, onVoided }: OrderPanelProps) {
  const products = useProductsStore((s) => s.products)
  const confirmItems = useSalesStore((s) => s.confirmItems)
  const removeItem = useSalesStore((s) => s.removeItem)
  const setCourtFee = useSalesStore((s) => s.setCourtFee)
  const setDiscount = useSalesStore((s) => s.setDiscount)
  const voidOrder = useSalesStore((s) => s.voidOrder)

  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [discountReason, setDiscountReason] = useState('')
  const [discountType, setDiscountType] = useState<SaleDiscount['type']>('porcentaje')
  const [discountValue, setDiscountValue] = useState('')
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  // Productos sin confirmar con el campo de comentario desplegado.
  const [commentOpen, setCommentOpen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = sale.status === 'en_curso'
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase() === q).slice(0, 8)
  }, [products, search])

  function productName(productId: string) {
    return products.find((p) => p.id === productId)?.name ?? 'Producto'
  }

  function addProducts(productIds: string[]) {
    const next = [...pending]
    for (const productId of productIds) {
      const product = products.find((p) => p.id === productId)
      if (!product) continue
      const index = next.findIndex((item) => item.productId === productId && item.comment === '')
      if (index >= 0) next[index] = { ...next[index], qty: next[index].qty + 1 }
      else next.push({ key: `p${pendingSeq++}`, productId, qty: 1, unitPrice: String(product.price), comment: '' })
    }
    onPendingChange(next)
  }

  function updatePending(key: string, patch: Partial<PendingItem>) {
    onPendingChange(pending.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const pendingTotal = pending.reduce((sum, item) => sum + item.qty * (Number(item.unitPrice) || 0), 0)

  async function run(action: () => Promise<string | null>): Promise<boolean> {
    setBusy(true)
    const actionError = await action()
    setBusy(false)
    setError(actionError)
    return !actionError
  }

  async function handleConfirm() {
    const ok = await run(() =>
      confirmItems(
        sale.id,
        pending.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          unitPrice: Number(item.unitPrice) || 0,
          comment: item.comment.trim(),
        })),
      ),
    )
    if (ok) onPendingChange([])
  }

  async function handleApplyDiscount() {
    const value = Number(discountValue)
    if (!value || value <= 0 || (discountType === 'porcentaje' && value > 100)) {
      setError(discountType === 'porcentaje' ? 'El porcentaje va de 1 a 100.' : 'Escribí el monto del descuento.')
      return
    }
    const ok = await run(() => setDiscount(sale.id, { type: discountType, value, reason: discountReason.trim() }))
    if (ok) setShowDiscount(false)
  }

  async function handleVoid() {
    setConfirmingVoid(false)
    const ok = await run(() => voidOrder(sale.id))
    if (ok) {
      onPendingChange([])
      onVoided()
    }
  }

  // Cancha: se cobra una sola vez por turno. Se muestra en que pedido esta.
  const courtOrder = orderWithCourtFee(turnoOrders)
  const courtHere = (sale.courtFee ?? 0) > 0
  const discount = discountAmount(sale)
  const paymentLines = salePaymentLines(sale)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 bg-mo-accent px-4 py-3 text-mo-accent-contrast">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Volver a la lista" className="text-lg leading-none lg:hidden">
            ←
          </button>
          <h2 className="text-sm font-bold uppercase tracking-wide">Pedido {orderNumberLabel(sale)}</h2>
        </div>
        {open && (
          <button
            type="button"
            onClick={() => setConfirmingVoid(true)}
            className="rounded-lg border border-mo-accent-contrast/40 px-3 py-1 text-xs font-semibold hover:bg-mo-accent-contrast/10"
          >
            Anular
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 p-4 text-sm">
          <dt className="text-mo-muted">Hora inicio</dt>
          <dd className="font-semibold text-mo-text">
            {formatOpenedAt(sale)}
            {open && isFromPreviousDay(sale) && (
              <span className="ml-2 rounded-full bg-mo-pending/20 px-2 py-0.5 text-xs font-medium text-mo-pending">
                De un día anterior
              </span>
            )}
          </dd>
          <dt className="text-mo-muted">{turno ? 'Turno' : 'Cliente'}</dt>
          <dd className="text-mo-text">{turno ? turnoLabel(turno) : sale.customerName || 'Sin nombre'}</dd>
          {sale.cantinero && (
            <>
              <dt className="text-mo-muted">Cantinero</dt>
              <dd className="text-mo-text">{sale.cantinero}</dd>
            </>
          )}
          {sale.comment && (
            <>
              <dt className="text-mo-muted">Comentario</dt>
              <dd className="text-mo-text">{sale.comment}</dd>
            </>
          )}
          {!open && (
            <>
              <dt className="text-mo-muted">Estado</dt>
              <dd className={sale.paymentStatus === 'adeuda' ? 'text-mo-pending' : 'text-mo-closed'}>
                {sale.paymentStatus === 'adeuda' ? `Fiado a ${sale.customerName ?? ''}` : 'Cerrada'}
              </dd>
            </>
          )}
        </dl>

        {open && (
          <>
            <h3 className="bg-mo-header px-4 py-2 text-xs font-semibold uppercase tracking-wide text-mo-text">
              Adicionar
            </h3>
            <div className="relative bg-mo-surface-alt p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  aria-label="Elegir productos por categoría"
                  className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg bg-mo-accent text-lg font-bold text-mo-accent-contrast hover:opacity-90"
                >
                  +
                </button>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="min-w-0 flex-1 rounded-lg border border-mo-border bg-mo-surface px-3 py-2 text-sm text-mo-text"
                />
              </div>
              {matches.length > 0 && (
                <ul className="absolute left-3 right-3 z-10 mt-1 overflow-hidden rounded-lg border border-mo-border bg-mo-surface shadow-lg">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          addProducts([p.id])
                          setSearch('')
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-mo-text hover:bg-mo-header/60"
                      >
                        <span>{p.name}</span>
                        <span className="text-mo-muted">{formatCurrency(p.price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {pending.length > 0 && (
          <div className="border-l-4 border-mo-pending bg-mo-pending/10">
            <ul className="divide-y divide-mo-border">
              {pending.map((item) => (
                <li key={item.key} className="space-y-1 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => updatePending(item.key, { qty: Math.max(1, item.qty - 1) })}
                        aria-label={`Restar ${productName(item.productId)}`}
                        className="h-7 w-7 rounded-l-lg border border-mo-border bg-mo-surface text-mo-text"
                      >
                        −
                      </button>
                      <span className="flex h-7 w-8 items-center justify-center border-y border-mo-border bg-mo-surface text-mo-text">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updatePending(item.key, { qty: item.qty + 1 })}
                        aria-label={`Sumar ${productName(item.productId)}`}
                        className="h-7 w-7 rounded-r-lg border border-mo-border bg-mo-surface text-mo-text"
                      >
                        +
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 truncate font-medium text-mo-text">{productName(item.productId)}</span>
                    <span className="text-mo-muted">$</span>
                    <input
                      value={item.unitPrice}
                      onChange={(e) => updatePending(item.key, { unitPrice: e.target.value.replace(/\D/g, '') })}
                      inputMode="numeric"
                      aria-label={`Precio de ${productName(item.productId)}`}
                      className="w-20 rounded-lg border border-mo-border bg-mo-surface px-2 py-1 text-right text-sm text-mo-text"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCommentOpen((prev) =>
                          prev.includes(item.key) ? prev.filter((k) => k !== item.key) : [...prev, item.key],
                        )
                      }
                      aria-label={`Comentario de ${productName(item.productId)}`}
                      aria-expanded={commentOpen.includes(item.key)}
                      title={item.comment || 'Agregar comentario'}
                      className={`px-1 ${item.comment ? 'text-mo-accent' : 'text-mo-muted hover:text-mo-text'}`}
                    >
                      <i className={`${item.comment ? 'fa-solid' : 'fa-regular'} fa-comment`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPendingChange(pending.filter((p) => p.key !== item.key))}
                      aria-label={`Quitar ${productName(item.productId)}`}
                      className="px-1 text-mo-muted hover:text-mo-danger"
                    >
                      ×
                    </button>
                  </div>
                  {commentOpen.includes(item.key) && (
                    <input
                      autoFocus
                      value={item.comment}
                      onChange={(e) => updatePending(item.key, { comment: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setCommentOpen((prev) => prev.filter((k) => k !== item.key))
                      }}
                      placeholder="Comentario para este producto"
                      className="w-full rounded-lg border border-mo-border bg-mo-surface px-2 py-1 text-xs text-mo-text"
                    />
                  )}
                  {!commentOpen.includes(item.key) && item.comment && (
                    <p className="truncate pl-1 text-xs text-mo-muted">{item.comment}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="px-3 py-2 text-xs text-mo-muted">Total a confirmar: {formatCurrency(pendingTotal)}</p>
            <div className="flex justify-end gap-2 px-3 pb-3">
              <button
                type="button"
                onClick={() => onPendingChange([])}
                className="rounded-lg border border-mo-border bg-mo-surface px-4 py-1.5 text-sm text-mo-text hover:bg-mo-header/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="rounded-lg bg-mo-accent px-4 py-1.5 text-sm font-semibold text-mo-accent-contrast hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-mo-border border-y border-mo-border">
          {sale.items.map((item, i) => (
            <li key={item.id ?? i} className="flex items-start gap-3 border-l-4 border-mo-accent px-3 py-2 text-sm">
              <span className="w-5 font-semibold text-mo-text">{item.qty}</span>
              <span className="min-w-0 flex-1 font-medium text-mo-text">
                {productName(item.productId)}
                {item.comment && <span className="block text-xs font-normal text-mo-muted">{item.comment}</span>}
              </span>
              <span className="text-mo-text">{formatCurrency(item.qty * item.unitPrice)}</span>
              {open && item.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => removeItem(sale.id, item.id as string))}
                  aria-label={`Quitar ${productName(item.productId)} del pedido`}
                  className="px-1 text-mo-muted hover:text-mo-danger"
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {courtHere && (
            <li className="flex items-center gap-3 border-l-4 border-mo-accent px-3 py-2 text-sm">
              <span className="w-5 font-semibold text-mo-text">1</span>
              <span className="flex-1 font-medium text-mo-text">Cancha</span>
              <span className="text-mo-text">{formatCurrency(sale.courtFee ?? 0)}</span>
              {open && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setCourtFee(sale.id, 0))}
                  aria-label="Quitar la cancha de este pedido"
                  className="px-1 text-mo-muted hover:text-mo-danger"
                >
                  ×
                </button>
              )}
            </li>
          )}
          {sale.items.length === 0 && !courtHere && pending.length === 0 && (
            <li className="px-4 py-4 text-sm text-mo-muted">
              {open ? 'Todavía no hay productos. Sumalos con el + o con el buscador.' : 'Sin productos.'}
            </li>
          )}
        </ul>

        {open && turno && !courtHere && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
            {courtOrder ? (
              <span className="text-mo-muted">
                La cancha de este turno ya está cargada en el pedido {orderNumberLabel(courtOrder)}.
              </span>
            ) : !turno.canChargeCourt ? (
              <span className="text-mo-muted">El turno no está confirmado: la cancha no se puede sumar todavía.</span>
            ) : (
              <>
                <span className="text-mo-muted">La cancha ({formatCurrency(turno.courtPrice)}) todavía no está cargada.</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setCourtFee(sale.id, turno.courtPrice))}
                  className="rounded-lg border border-mo-border px-3 py-1 font-medium text-mo-text hover:bg-mo-header/60"
                >
                  Sumar cancha a este pedido
                </button>
              </>
            )}
          </div>
        )}

        {discount > 0 && (
          <div className="flex items-center justify-between px-4 py-2 text-sm text-mo-muted">
            <span>
              Descuento {sale.discount?.type === 'porcentaje' ? `${sale.discount.value}%` : ''}
              {sale.discount?.reason ? ` · ${sale.discount.reason}` : ''}
            </span>
            <span className="flex items-center gap-2">
              − {formatCurrency(discount)}
              {open && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setDiscount(sale.id, null))}
                  aria-label="Quitar descuento"
                  className="px-1 hover:text-mo-danger"
                >
                  ×
                </button>
              )}
            </span>
          </div>
        )}

        {showDiscount && open && (
          <div className="space-y-2 bg-mo-pending/10 p-4 text-sm">
            <label className="grid grid-cols-[6rem_1fr] items-center gap-2 text-mo-muted">
              Motivo
              <input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Sin motivo"
                className="rounded-lg border border-mo-border bg-mo-surface px-3 py-1.5 text-mo-text"
              />
            </label>
            <div className="grid grid-cols-[6rem_1fr] items-center gap-2 text-mo-muted">
              Tipo
              <div className="flex gap-4 text-mo-text">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={discountType === 'porcentaje'} onChange={() => setDiscountType('porcentaje')} />
                  Porcentual
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={discountType === 'fijo'} onChange={() => setDiscountType('fijo')} />
                  Fijo
                </label>
              </div>
            </div>
            <label className="grid grid-cols-[6rem_1fr] items-center gap-2 text-mo-muted">
              Valor
              <span className="flex items-center gap-2">
                <input
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder={discountType === 'porcentaje' ? 'Porcentaje' : 'Monto'}
                  className="min-w-0 flex-1 rounded-lg border border-mo-border bg-mo-surface px-3 py-1.5 text-right text-mo-text"
                />
                <span className="w-4 text-mo-text">{discountType === 'porcentaje' ? '%' : '$'}</span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDiscount(false)}
                className="rounded-lg border border-mo-border bg-mo-surface px-4 py-1.5 text-mo-text hover:bg-mo-header/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyDiscount}
                disabled={busy || discountValue === ''}
                className="rounded-lg bg-mo-accent px-4 py-1.5 font-semibold text-mo-accent-contrast hover:opacity-90 disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}

        <p className="flex items-center justify-between bg-mo-header px-4 py-3 text-lg font-semibold text-mo-text">
          Total: <span>{formatCurrency(sale.total)}</span>
        </p>

        {!open && paymentLines.length > 0 && (
          <ul className="space-y-1 px-4 py-3 text-sm text-mo-muted">
            {paymentLines.map((line, i) => (
              <li key={i} className="flex justify-between">
                {methodLabel(line.method)} <span>{formatCurrency(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="px-4 pt-2">
          <ErrorText error={error} />
        </div>

        {open && (
          <div className="p-4">
            {/* Los dos botones siempre en la misma fila; el aviso va debajo. */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setDiscountReason(sale.discount?.reason ?? '')
                  setDiscountType(sale.discount?.type ?? 'porcentaje')
                  setDiscountValue(sale.discount ? String(sale.discount.value) : '')
                  setError(null)
                  setShowDiscount(true)
                }}
                className="rounded-lg border border-mo-border px-4 py-2 text-sm text-mo-text hover:bg-mo-header/60"
              >
                % Aplicar descuento
              </button>
              <button
                type="button"
                onClick={() => setShowClose(true)}
                disabled={pending.length > 0}
                className="rounded-lg border border-transparent bg-mo-text px-5 py-2 text-sm font-semibold text-mo-bg hover:opacity-90 disabled:opacity-40"
              >
                Cerrar pedido
              </button>
            </div>
            {pending.length > 0 && (
              <p className="mt-2 text-right text-xs text-mo-muted">
                Confirmá o cancelá los productos resaltados para poder cerrar.
              </p>
            )}
          </div>
        )}
      </div>

      {showPicker && (
        <ProductPickerModal
          onClose={() => setShowPicker(false)}
          onAdd={(ids) => {
            addProducts(ids)
            setShowPicker(false)
          }}
        />
      )}
      {showClose && (
        <CloseOrderModal sale={sale} onClose={() => setShowClose(false)} onClosed={() => setShowClose(false)} />
      )}
      {confirmingVoid && (
        <ConfirmDialog
          title="Anular pedido"
          message={`¿Anular el pedido ${orderNumberLabel(sale)}? Se borra y el stock de lo que ya estaba confirmado vuelve a los productos. No se puede deshacer.`}
          confirmLabel="Anular pedido"
          onConfirm={handleVoid}
          onCancel={() => setConfirmingVoid(false)}
        />
      )}
    </div>
  )
}
