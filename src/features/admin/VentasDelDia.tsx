import { Fragment, useMemo, useState } from 'react'
import { useSalesStore } from '@/store/salesStore'
import { useProductsStore } from '@/store/productsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { formatCurrency, todayKey } from '@/lib/format'
import { methodLabel, salePaymentLines, salePaymentSummary, totalsByMethod } from '@/lib/payments'
import { usePaymentMethodsStore } from '@/store/paymentMethodsStore'
import type { Sale } from '@/types'

export function VentasDelDia() {
  const sales = useSalesStore((s) => s.sales)
  const products = useProductsStore((s) => s.products)
  const reservations = useReservationsStore((s) => s.reservations)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const today = todayKey()
  const paymentMethods = usePaymentMethodsStore((s) => s.methods)
  // Solo ventas cerradas: los pedidos en curso se ven en el Mostrador.
  const todaySales = useMemo(
    () => sales.filter((s) => s.date === today && s.status === 'cerrada'),
    [sales, today],
  )
  const paidSales = useMemo(
    () => todaySales.filter((s) => s.paymentStatus === 'pagado'),
    [todaySales],
  )

  const total = paidSales.reduce((sum, s) => sum + s.total, 0)
  // Por linea de pago: una venta cobrada con dos medios suma en los dos.
  const methodTotals = useMemo(
    () =>
      totalsByMethod(
        paidSales,
        paymentMethods.map((m) => m.name),
      ),
    [paidSales, paymentMethods],
  )

  const { groups, standalone } = useMemo(() => {
    const groupMap = new Map<string, Sale[]>()
    const standaloneSales: Sale[] = []
    for (const sale of todaySales) {
      if (sale.reservationId) {
        const list = groupMap.get(sale.reservationId) ?? []
        list.push(sale)
        groupMap.set(sale.reservationId, list)
      } else {
        standaloneSales.push(sale)
      }
    }
    return { groups: Array.from(groupMap.entries()), standalone: standaloneSales }
  }, [todaySales])

  function productName(productId: string) {
    return products.find((p) => p.id === productId)?.name ?? productId
  }

  function toggleExpanded(reservationId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(reservationId)) next.delete(reservationId)
      else next.add(reservationId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-50">Ventas del dia</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-400">Total del dia</p>
          <p className="mt-1 text-xl font-semibold text-gray-50">{formatCurrency(total)}</p>
        </div>
        {methodTotals.map((method) => (
          <div key={method.key} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm text-gray-400">{method.label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-50">{formatCurrency(method.total)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs font-semibold text-gray-400">
              <th className="p-4">Productos / Persona</th>
              <th className="p-4">Turno</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Metodo de pago</th>
              <th className="p-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([reservationId, groupSales]) => {
              const reservation = reservations.find((r) => r.id === reservationId)
              const combinedTotal = groupSales.reduce((sum, s) => sum + s.total, 0)
              const allPaid = groupSales.every((s) => s.paymentStatus === 'pagado')
              const anyAdeuda = groupSales.some((s) => s.paymentStatus === 'adeuda')
              const expanded = expandedIds.has(reservationId)

              return (
                <Fragment key={reservationId}>
                  <tr className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="p-4 text-gray-300">
                      Turno ({groupSales.length} persona{groupSales.length > 1 ? 's' : ''})
                    </td>
                    <td className="p-4 text-gray-300">
                      {reservation ? `${reservation.time}hs` : '-'}
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          allPaid
                            ? 'bg-success/20 text-success'
                            : anyAdeuda
                              ? 'bg-warning/20 text-warning'
                              : 'bg-gray-800 text-gray-400'
                        }`}
                      >
                        {allPaid ? 'Pagado' : anyAdeuda ? 'Con deuda' : 'Parcial'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-300">Varios</td>
                    <td className="p-4 text-gray-100">
                      {formatCurrency(combinedTotal)}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(reservationId)}
                        className="ml-2 text-xs text-primary-500 hover:underline"
                      >
                        {expanded ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                  </tr>
                  {expanded &&
                    groupSales.map((sale) => (
                      <tr key={sale.id} className="border-b border-gray-800 bg-gray-950/40 text-xs">
                        <td className="p-3 pl-6 text-gray-400">
                          {sale.customerName ?? 'Persona'} —{' '}
                          {sale.items.length > 0
                            ? sale.items
                                .map((item) => `${item.qty}x ${productName(item.productId)}`)
                                .join(', ')
                            : 'sin productos'}
                        </td>
                        <td className="p-3 text-gray-500">-</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              sale.paymentStatus === 'pagado'
                                ? 'bg-success/20 text-success'
                                : 'bg-warning/20 text-warning'
                            }`}
                          >
                            {sale.paymentStatus === 'pagado' ? 'Pagado' : 'Adeuda'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400">{salePaymentSummary(sale)}</td>
                        <td className="p-3 text-gray-300">{formatCurrency(sale.total)}</td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}

            {standalone.map((sale) => (
              <tr key={sale.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                <td className="p-4 text-gray-300">
                  {sale.items.length > 0
                    ? sale.items.map((item) => `${item.qty}x ${productName(item.productId)}`).join(', ')
                    : 'sin productos'}
                </td>
                <td className="p-4 text-gray-300">-</td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      sale.paymentStatus === 'pagado'
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/20 text-warning'
                    }`}
                  >
                    {sale.paymentStatus === 'pagado' ? 'Pagado' : `Adeuda${sale.customerName ? ` - ${sale.customerName}` : ''}`}
                  </span>
                </td>
                <td className="p-4 text-gray-300">
                  {salePaymentSummary(sale)}
                  {salePaymentLines(sale).length > 1 && (
                    <ul className="mt-1 text-xs text-gray-500">
                      {salePaymentLines(sale).map((p, i) => (
                        <li key={i}>
                          {methodLabel(p.method)}: {formatCurrency(p.amount)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="p-4 text-gray-100">{formatCurrency(sale.total)}</td>
              </tr>
            ))}

            {todaySales.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Todavia no hay ventas hoy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
