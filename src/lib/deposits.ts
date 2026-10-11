import { supabase } from '@/lib/supabaseClient'
import { toDateKey } from '@/lib/format'
import type { Deposit, DepositPayment, DepositRefundReason, DepositStatus, Reservation, Settings } from '@/types'

const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Llamada a una funcion del servidor. Devuelve el cuerpo y el codigo: los
// mensajes de error ya vienen redactados para mostrar.
export async function callFunction<T>(
  name: string,
  body: unknown,
  withSession = false,
): Promise<{ ok: boolean; status: number; data: T & { message?: string; code?: string } }> {
  let token = anonKey
  if (withSession) {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? anonKey
  }
  try {
    const res = await fetch(`${functionsUrl}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' } as T & { message?: string } }
  }
}

type DepositConfig = Pick<Settings, 'depositType' | 'depositValue'>

// Para MOSTRAR cuanto es la seña. El monto que se cobra lo calcula siempre
// el servidor con la misma cuenta.
export function depositAmountFor(config: DepositConfig, price: number): number {
  const raw = config.depositType === 'porcentaje' ? Math.round((price * config.depositValue) / 100) : config.depositValue
  return Math.min(price, raw)
}

// La seña rige para el publico: activada, con la cuenta conectada y sana, y
// con el complejo habilitado. Lo decide la base. Sin la migracion 025 la
// funcion no existe y la reserva sigue como siempre.
export async function fetchDepositActive(venueId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('deposit_active', { p_venue_id: venueId })
  return !error && data === true
}

export interface StartDepositInput {
  slug: string
  courtId: string
  date: string
  time: string
  name: string
  whatsapp: string
}

export interface StartDepositResult {
  depositId: string
  key: string
  payUrl: string
  amount: number
  priceTotal: number
  expiresAt: string
}

export function startDeposit(input: StartDepositInput) {
  return callFunction<StartDepositResult>('create-deposit', input)
}

export interface DepositReceipt {
  status: DepositStatus
  venueSlug: string
  courtName: string
  date: string
  time: string
  priceTotal: number
  amount: number
  expiresAt: string
  expired: boolean
  paymentId?: number
  paidAt?: string
  lastAttemptStatus?: string
  payUrl?: string
}

// Comprobante del jugador: hace falta la clave secreta de su enlace.
export async function fetchDepositReceipt(depositId: string, key: string): Promise<DepositReceipt | null> {
  const { data, error } = await supabase.rpc('deposit_status', { p_deposit_id: depositId, p_key: key })
  const row = !error && Array.isArray(data) ? data[0] : null
  if (!row) return null
  return {
    status: row.status,
    venueSlug: row.venue_slug,
    courtName: row.court_name,
    date: row.date,
    time: row.time,
    priceTotal: Number(row.price_total),
    amount: Number(row.amount),
    expiresAt: row.expires_at,
    expired: row.expired,
    paymentId: row.mp_payment_id ?? undefined,
    paidAt: row.paid_at ?? undefined,
    lastAttemptStatus: row.last_attempt_status ?? undefined,
    payUrl: row.pay_url ?? undefined,
  }
}

export function confirmDeposit(depositId: string, key: string, paymentId?: string) {
  return callFunction<{ status: DepositStatus }>('deposit-confirm', { depositId, key, paymentId })
}

export async function releaseDeposit(depositId: string, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_my_deposit', { p_deposit_id: depositId, p_key: key })
  return !error && data === true
}

// Señas pagadas, por reserva. Lo que falta cobrar de ese turno en el
// complejo es el precio menos esto.
export function paidDepositByReservation(deposits: Deposit[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of deposits) if (d.status === 'pagada' && d.reservationId) map.set(d.reservationId, d.amount)
  return map
}

// Cobrado por señas en un dia (el dia en que se pagaron). Lo devuelto no cuenta.
export function depositIncomeOn(payments: DepositPayment[], dateKey: string): number {
  return payments
    .filter((p) => p.status !== 'devuelto' && toDateKey(new Date(p.paidAt)) === dateKey)
    .reduce((sum, p) => sum + p.amount, 0)
}

// Las reservas hechas con seña no llevan el nombre en la reserva (esa tabla
// es de lectura publica): el nombre del jugador esta aparte y solo lo ve el
// dueño. Para el panel, se lo completa aca.
export function withDepositNames(reservations: Reservation[], deposits: Deposit[]): Reservation[] {
  const names = new Map<string, string>()
  for (const d of deposits) if (d.reservationId && d.contactName) names.set(d.reservationId, d.contactName)
  if (names.size === 0) return reservations
  return reservations.map((r) => (r.customerName || !names.has(r.id) ? r : { ...r, customerName: names.get(r.id) }))
}

export const DEPOSIT_METHOD_LABEL = 'Mercado Pago (señas)'

export const REFUND_REASON_TEXT: Record<DepositRefundReason, string> = {
  pago_tardio: 'El pago entró cuando el tiempo ya había vencido y el horario lo tomó otra persona.',
  cancelada_por_el_complejo: 'Cancelaste la reserva con la seña ya pagada.',
  pago_duplicado: 'El jugador pagó dos veces la misma seña.',
  no_coincide: 'El pago no coincide con la seña pedida.',
}

export const MP_FEE_NOTE = 'Monto bruto: Mercado Pago descuenta su comisión antes de acreditarlo en tu cuenta.'
