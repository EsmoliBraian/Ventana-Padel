import { fromDateKey, todayKey } from '@/lib/format'
import { saleIncludesReservationFee } from '@/lib/salesRevenue'
import type { Court, FixedSlot, Reservation, Sale } from '@/types'

// Un turno al que se le pueden cargar pedidos: una reserva puntual o un turno
// fijo semanal.
export interface Turno {
  key: string // 'r:<id>' o 'f:<id>'
  reservationId?: string
  fixedSlotId?: string
  date?: string // solo reservas
  time: string
  courtName: string
  customerName: string
  courtPrice: number
  // La cancha se puede sumar a un pedido: turno fijo, o reserva confirmada.
  canChargeCourt: boolean
}

export function turnoKeyOfSale(sale: Sale): string | null {
  if (sale.reservationId) return `r:${sale.reservationId}`
  if (sale.fixedSlotId) return `f:${sale.fixedSlotId}`
  return null
}

function reservationTurno(r: Reservation, courts: Court[]): Turno {
  return {
    key: `r:${r.id}`,
    reservationId: r.id,
    date: r.date,
    time: r.time,
    courtName: courts.find((c) => c.id === r.courtId)?.name ?? 'Cancha',
    customerName: r.customerName ?? '',
    courtPrice: r.priceTotal,
    canChargeCourt: r.status === 'confirmado',
  }
}

function fixedTurno(f: FixedSlot, courts: Court[]): Turno {
  const court = courts.find((c) => c.id === f.courtId)
  return {
    key: `f:${f.id}`,
    fixedSlotId: f.id,
    time: f.time,
    courtName: court?.name ?? 'Cancha',
    customerName: f.customerName || 'Turno fijo',
    courtPrice: court?.price ?? 0,
    canChargeCourt: true,
  }
}

// Turnos de hoy (reservas no canceladas y turnos fijos del dia de la semana),
// mas los turnos de otros dias que todavia tienen un pedido en curso, para
// que un pedido de ayer no quede huerfano.
export function buildTurnos(
  reservations: Reservation[],
  fixedSlots: FixedSlot[],
  courts: Court[],
  sales: Sale[],
): Turno[] {
  const today = todayKey()
  const weekday = fromDateKey(today).getDay()
  const turnos = new Map<string, Turno>()

  for (const r of reservations) {
    if (r.date === today && r.status !== 'cancelado') turnos.set(`r:${r.id}`, reservationTurno(r, courts))
  }
  for (const f of fixedSlots) {
    if (f.weekday === weekday) turnos.set(`f:${f.id}`, fixedTurno(f, courts))
  }
  for (const sale of sales) {
    if (sale.status !== 'en_curso') continue
    const key = turnoKeyOfSale(sale)
    if (!key || turnos.has(key)) continue
    const r = sale.reservationId ? reservations.find((x) => x.id === sale.reservationId) : undefined
    const f = sale.fixedSlotId ? fixedSlots.find((x) => x.id === sale.fixedSlotId) : undefined
    if (r) turnos.set(key, reservationTurno(r, courts))
    else if (f) turnos.set(key, fixedTurno(f, courts))
  }

  return Array.from(turnos.values()).sort((a, b) => {
    const byDate = (a.date ?? today).localeCompare(b.date ?? today)
    return byDate !== 0 ? byDate : a.time.localeCompare(b.time)
  })
}

export function turnoLabel(turno: Turno): string {
  const who = turno.customerName ? ` · ${turno.customerName}` : ''
  return `${turno.time} hs · ${turno.courtName}${who}`
}

// Pedidos de un turno. Para un turno fijo cuentan los abiertos y los del dia
// (el mismo turno fijo se repite cada semana).
export function ordersOfTurno(turno: Turno, sales: Sale[]): Sale[] {
  const today = todayKey()
  return sales
    .filter((s) => {
      if (turnoKeyOfSale(s) !== turno.key) return false
      if (turno.fixedSlotId) return s.status === 'en_curso' || s.date === today
      return true
    })
    .sort(byNumber)
}

// Pedido (de los de este turno) que ya tiene la cancha cargada, si hay.
export function orderWithCourtFee(orders: Sale[]): Sale | undefined {
  return orders.find(saleIncludesReservationFee)
}

export function byNumber(a: Sale, b: Sale): number {
  return (a.number ?? 0) - (b.number ?? 0)
}

export function itemsSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
}

// Lo que el descuento le resta al pedido, en pesos (misma cuenta que
// order_total() en la base).
export function discountAmount(sale: Sale): number {
  if (!sale.discount) return 0
  const subtotal = itemsSubtotal(sale) + (sale.courtFee ?? 0)
  const amount =
    sale.discount.type === 'porcentaje'
      ? Math.round((subtotal * Math.min(sale.discount.value, 100)) / 100)
      : sale.discount.value
  return Math.min(subtotal, amount)
}

export function orderNumberLabel(sale: Sale): string {
  return sale.number !== undefined ? `#${sale.number}` : '#—'
}

// A quien pertenece el pedido, para las tablas.
export function orderOwnerLabel(sale: Sale, turnos: Turno[]): string {
  const key = turnoKeyOfSale(sale)
  const turno = key ? turnos.find((t) => t.key === key) : undefined
  if (turno) return turnoLabel(turno)
  return sale.customerName ?? ''
}

// Fecha y hora de inicio. La fecha va siempre a la vista: un pedido que
// quedo abierto de ayer tiene que notarse.
export function formatOpenedAt(sale: Sale): string {
  if (!sale.createdAt) return sale.date
  return new Date(sale.createdAt).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function isFromPreviousDay(sale: Sale): boolean {
  const opened = sale.createdAt ? new Date(sale.createdAt) : fromDateKey(sale.date)
  const today = fromDateKey(todayKey())
  return opened.getTime() < today.getTime()
}
