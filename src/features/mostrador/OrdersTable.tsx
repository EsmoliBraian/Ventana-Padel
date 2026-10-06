import { formatCurrency } from '@/lib/format'
import { formatOpenedAt, isFromPreviousDay, orderNumberLabel } from '@/lib/orders'
import type { Sale } from '@/types'

function StatusCell({ sale }: { sale: Sale }) {
  if (sale.status === 'en_curso') {
    return (
      <span className="whitespace-nowrap rounded border border-mo-open px-2 py-0.5 text-xs font-medium text-mo-open">
        En curso
      </span>
    )
  }
  if (sale.paymentStatus === 'adeuda') {
    return <span className="whitespace-nowrap text-xs font-medium text-mo-pending">Fiado</span>
  }
  return <span className="whitespace-nowrap text-xs font-medium text-mo-closed">Cerrada</span>
}

interface OrdersTableProps {
  title: string
  orders: Sale[]
  selectedId: string | null
  emptyText: string
  ownerHeader: string
  ownerLabel: (sale: Sale) => string
  onSelect: (saleId: string) => void
}

// Tabla compacta de pedidos. Cada fila lleva una franja de color segun su
// estado y la seleccionada queda resaltada.
export function OrdersTable({ title, orders, selectedId, emptyText, ownerHeader, ownerLabel, onSelect }: OrdersTableProps) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-mo-text">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-mo-border bg-mo-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mo-border text-left text-xs text-mo-muted">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Hora inicio</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">{ownerHeader}</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((sale) => {
              const selected = sale.id === selectedId
              return (
                <tr
                  key={sale.id}
                  onClick={() => onSelect(sale.id)}
                  aria-selected={selected}
                  className={`cursor-pointer border-b border-mo-border last:border-0 ${
                    selected ? 'bg-mo-accent/20' : 'hover:bg-mo-surface-alt'
                  }`}
                >
                  <td
                    className={`border-l-4 px-3 py-2.5 font-bold text-mo-text ${
                      sale.status === 'en_curso' ? 'border-mo-open' : 'border-mo-closed'
                    }`}
                  >
                    <button type="button" onClick={() => onSelect(sale.id)} className="font-bold">
                      {orderNumberLabel(sale)}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-mo-text">
                    {formatOpenedAt(sale)}
                    {sale.status === 'en_curso' && isFromPreviousDay(sale) && (
                      <span className="ml-2 rounded-full bg-mo-pending/20 px-2 py-0.5 text-xs font-medium text-mo-pending">
                        Día anterior
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusCell sale={sale} />
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-mo-text">{ownerLabel(sale)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-mo-text">
                    {formatCurrency(sale.total)}
                  </td>
                </tr>
              )
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-mo-muted">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
