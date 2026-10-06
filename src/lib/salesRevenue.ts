import type { Sale } from '@/types'

// Si el total de una venta ya incluye el precio de cancha de su turno.
// - Pedidos del Mostrador: lo dice el propio pedido (courtFee).
// - Ventas anteriores: no se guardaba aparte, asi que se deduce comparando el
//   total con lo que suman sus productos.
export function saleIncludesReservationFee(sale: Sale): boolean {
  if (sale.courtFee !== null) return sale.courtFee > 0
  if (!sale.reservationId) return false
  const itemsSubtotal = sale.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  return sale.total > itemsSubtotal
}

// Turnos cuya cancha ya esta cobrada dentro de una venta cerrada (para no
// contarla dos veces en los ingresos).
export function reservationIdsWithAbsorbedFee(sales: Sale[]): Set<string> {
  const ids = new Set<string>()
  for (const sale of sales) {
    if (sale.status === 'cerrada' && sale.reservationId && saleIncludesReservationFee(sale)) {
      ids.add(sale.reservationId)
    }
  }
  return ids
}
