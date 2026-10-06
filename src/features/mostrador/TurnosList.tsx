import { formatCurrency, formatLongDate, fromDateKey, todayKey } from '@/lib/format'
import { orderNumberLabel, orderWithCourtFee, ordersOfTurno, type Turno } from '@/lib/orders'
import type { Sale } from '@/types'

interface TurnosListProps {
  turnos: Turno[]
  sales: Sale[]
  selectedId: string | null
  onSelect: (saleId: string) => void
  onNewOrder: (turnoKey: string) => void
}

// Pestaña Turnos: cada turno del dia con sus pedidos agrupados debajo, el
// total del turno y en que pedido esta cargada la cancha.
export function TurnosList({ turnos, sales, selectedId, onSelect, onNewOrder }: TurnosListProps) {
  const today = todayKey()

  if (turnos.length === 0) {
    return (
      <p className="rounded-lg border border-mo-border bg-mo-surface px-4 py-8 text-center text-sm text-mo-muted">
        No hay turnos para hoy. Las ventas sueltas se cargan en la pestaña Mostrador.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {turnos.map((turno) => {
        const orders = ordersOfTurno(turno, sales)
        const total = orders.reduce((sum, o) => sum + o.total, 0)
        const courtOrder = orderWithCourtFee(orders)
        const otherDay = turno.date !== undefined && turno.date !== today

        return (
          <section key={turno.key} className="overflow-hidden rounded-lg border border-mo-border bg-mo-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-mo-header px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-mo-text">
                  {turno.time} hs · {turno.courtName}
                  {turno.fixedSlotId && (
                    <span className="ml-2 rounded-full bg-mo-accent/20 px-2 py-0.5 text-xs font-medium text-mo-accent">
                      Turno fijo
                    </span>
                  )}
                  {otherDay && turno.date && (
                    <span className="ml-2 rounded-full bg-mo-pending/20 px-2 py-0.5 text-xs font-medium text-mo-pending">
                      {formatLongDate(fromDateKey(turno.date))}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-mo-muted">
                  {turno.customerName || 'Sin nombre'} ·{' '}
                  {courtOrder
                    ? `Cancha cargada en el pedido ${orderNumberLabel(courtOrder)}`
                    : `Cancha sin cargar (${formatCurrency(turno.courtPrice)})`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-bold text-mo-text">{formatCurrency(total)}</span>
                <button
                  type="button"
                  onClick={() => onNewOrder(turno.key)}
                  className="rounded-lg bg-mo-accent px-3 py-1 text-xs font-semibold text-mo-accent-contrast hover:opacity-90"
                >
                  + Pedido
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <p className="px-3 py-3 text-xs text-mo-muted">Sin pedidos todavía.</p>
            ) : (
              <ul className="divide-y divide-mo-border">
                {orders.map((order) => {
                  const selected = order.id === selectedId
                  return (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(order.id)}
                        aria-pressed={selected}
                        className={`flex w-full items-center gap-3 border-l-4 px-3 py-2 text-left text-sm ${
                          order.status === 'en_curso' ? 'border-mo-open' : 'border-mo-closed'
                        } ${selected ? 'bg-mo-accent/20' : 'hover:bg-mo-surface-alt'}`}
                      >
                        <span className="w-12 font-bold text-mo-text">{orderNumberLabel(order)}</span>
                        <span
                          className={`w-16 text-xs font-medium ${
                            order.status === 'en_curso'
                              ? 'text-mo-open'
                              : order.paymentStatus === 'adeuda'
                                ? 'text-mo-pending'
                                : 'text-mo-closed'
                          }`}
                        >
                          {order.status === 'en_curso' ? 'En curso' : order.paymentStatus === 'adeuda' ? 'Fiado' : 'Cerrada'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-mo-muted">
                          {order.items.reduce((sum, item) => sum + item.qty, 0)} productos
                          {(order.courtFee ?? 0) > 0 ? ' + cancha' : ''}
                          {order.paymentStatus === 'adeuda' && order.customerName ? ` · ${order.customerName}` : ''}
                        </span>
                        <span className="font-bold text-mo-text">{formatCurrency(order.total)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
