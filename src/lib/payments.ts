import { themeColor } from '@/lib/theme'
import type { Sale, SalePayment } from '@/types'

// Medios de pago con los que nace cada complejo (ver seed_payment_methods en
// supabase/migrations/020_mostrador.sql). Tambien es la lista que se usa si
// la tabla todavia no existe.
export const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'QR']

// Las ventas guardan el nombre del medio de pago tal como estaba al cobrar.
// Para sumar se comparan sin mayusculas ni espacios, asi "efectivo" (ventas
// viejas) y "Efectivo" (medio configurable) van al mismo total.
export function methodKey(name: string): string {
  return name.trim().toLowerCase()
}

export function methodLabel(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return 'Sin medio'
  return trimmed === trimmed.toLowerCase() ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed
}

// Como se cobro una venta, linea por linea, siempre sumando su total:
// - con lineas de pago guardadas, esas lineas;
// - venta vieja de un solo medio (sin lineas), una linea por el total;
// - si las lineas no llegan al total (mixto viejo cargado a medias), la
//   diferencia queda bajo el medio general de la venta.
export function salePaymentLines(sale: Sale): SalePayment[] {
  if (sale.paymentStatus !== 'pagado') return []
  const lines = sale.payments.filter((p) => p.amount > 0)
  const covered = lines.reduce((sum, p) => sum + p.amount, 0)
  const rest = sale.total - covered
  if (rest > 0) return [...lines, { method: sale.paymentMethod ?? 'Sin medio', amount: rest }]
  return lines
}

export interface MethodTotal {
  key: string
  label: string
  total: number
}

// Total cobrado por medio de pago. `preferred` son los nombres configurados
// en el complejo: definen la etiqueta y el orden; el resto va despues.
export function totalsByMethod(sales: Sale[], preferred: string[] = []): MethodTotal[] {
  const totals = new Map<string, MethodTotal>()
  for (const name of preferred) {
    totals.set(methodKey(name), { key: methodKey(name), label: name, total: 0 })
  }
  for (const sale of sales) {
    for (const line of salePaymentLines(sale)) {
      const key = methodKey(line.method)
      const current = totals.get(key) ?? { key, label: methodLabel(line.method), total: 0 }
      current.total += line.amount
      totals.set(key, current)
    }
  }
  return Array.from(totals.values())
}

// Texto corto del medio de pago de una venta, para tablas.
export function salePaymentSummary(sale: Sale): string {
  if (sale.paymentStatus === 'adeuda') return 'Fiado'
  if (sale.paymentStatus === 'pendiente') return '-'
  const lines = salePaymentLines(sale)
  if (lines.length === 0) return '-'
  if (lines.length === 1) return methodLabel(lines[0].method)
  return 'Varios'
}

const KNOWN_COLORS: Record<string, string> = {
  transferencia: '#4CA8FF',
  mixto: '#F78FB3',
  tarjeta: '#FF9F6B',
  qr: '#6FCF97',
}
const EXTRA_COLORS = ['#FFC857', '#7FD8FF', '#E8A0FF', '#7FE0C6', '#FF8FA3']

// Color estable por medio de pago, para graficos.
export function methodColor(key: string): string {
  // El efectivo, que suele ser lo mas cobrado, lleva el color de la marca.
  if (key === 'efectivo') return themeColor('brand-light')
  if (KNOWN_COLORS[key]) return KNOWN_COLORS[key]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return EXTRA_COLORS[hash % EXTRA_COLORS.length]
}

// Linea de pago mientras se esta cargando (ver PaymentLinesEditor).
export interface PaymentLine {
  method: string
  amount: string // texto, para poder borrar y escribir
}

export function linesTotal(lines: PaymentLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
}
