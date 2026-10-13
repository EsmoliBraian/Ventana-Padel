// Todo lo que habla con Mercado Pago. Las credenciales de la aplicacion
// salen de los secretos; las de cada complejo, de la tabla privada.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env, functionsUrl, log } from './util.ts'

const API = () => (Deno.env.get('MP_API_BASE') ?? 'https://api.mercadopago.com').replace(/\/+$/, '')
const AUTH = () => (Deno.env.get('MP_AUTH_BASE') ?? 'https://auth.mercadopago.com.ar').replace(/\/+$/, '')

export const redirectUri = () => `${functionsUrl()}/mp-oauth-callback`

export function authorizationUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: env('MP_CLIENT_ID'),
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTH()}/authorization?${params}`
}

export interface MpTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  user_id: number
}

// Error de Mercado Pago sin su contenido: solo el codigo de respuesta.
export class MpError extends Error {
  constructor(public status: number, where: string) {
    super(`Mercado Pago respondió ${status} en ${where}`)
  }
}

async function tokenRequest(body: Record<string, string>, where: string): Promise<MpTokens> {
  const res = await fetch(`${API()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: env('MP_CLIENT_ID'), client_secret: env('MP_CLIENT_SECRET'), ...body }),
  })
  if (!res.ok) throw new MpError(res.status, where)
  const data = await res.json()
  if (!data.access_token || !data.refresh_token || !data.user_id) throw new MpError(502, where)
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: Number(data.expires_in) || 0, user_id: Number(data.user_id) }
}

export const exchangeCode = (code: string, codeVerifier: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: codeVerifier }, 'oauth/token')

export const refreshTokens = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, 'oauth/token (renovar)')

async function mpFetch(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${API()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  })
}

// Como se le muestra la cuenta al dueño.
export async function accountLabel(accessToken: string, userId: number): Promise<string> {
  try {
    const res = await mpFetch('/users/me', accessToken)
    if (!res.ok) return `Cuenta ${userId}`
    const me = await res.json()
    const nickname = typeof me.nickname === 'string' ? me.nickname : ''
    const email = typeof me.email === 'string' ? me.email : ''
    return (nickname && email ? `${nickname} (${email})` : nickname || email || `Cuenta ${userId}`).slice(0, 120)
  } catch {
    return `Cuenta ${userId}`
  }
}

export interface PreferenceInput {
  depositId: string
  title: string
  amount: number
  returnUrl: string
  expiresAt: string
}

// Cobro de la seña en la cuenta del complejo. Sin comision de la plataforma.
// Solo medios que acreditan en el momento, y vence junto con el horario.
export async function createPreference(accessToken: string, input: PreferenceInput): Promise<{ id: string; payUrl: string }> {
  const res = await mpFetch('/checkout/preferences', accessToken, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.depositId },
    body: JSON.stringify({
      items: [{ id: input.depositId, title: input.title, quantity: 1, unit_price: input.amount, currency_id: 'ARS' }],
      external_reference: input.depositId,
      back_urls: { success: input.returnUrl, failure: input.returnUrl, pending: input.returnUrl },
      auto_return: 'approved',
      metadata: { deposit_id: input.depositId },
      binary_mode: true,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: input.expiresAt,
      payment_methods: {
        // Efectivo (Rapipago, Pago Facil) y cajero acreditan despues.
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
        installments: 1,
      },
    }),
  })
  if (!res.ok) throw new MpError(res.status, 'checkout/preferences')
  const data = await res.json()
  if (!data.id || !data.init_point) throw new MpError(502, 'checkout/preferences')
  return { id: String(data.id), payUrl: String(data.init_point) }
}

export interface MpPayment {
  id: number
  status: string
  amount: number
  currency: string
  collectorId: number | null
  externalReference: string | null
  paidAt: string | null
}

function toPayment(p: Record<string, unknown>): MpPayment {
  const collector = (p.collector_id ?? (p.collector as { id?: unknown } | undefined)?.id) as number | string | undefined
  return {
    id: Number(p.id),
    status: String(p.status ?? ''),
    amount: Number(p.transaction_amount),
    currency: String(p.currency_id ?? ''),
    collectorId: collector === undefined || collector === null ? null : Number(collector),
    externalReference: typeof p.external_reference === 'string' ? p.external_reference : null,
    paidAt: (p.date_approved as string | null) ?? (p.date_created as string | null) ?? null,
  }
}

// null: ese pago no existe para esta cuenta.
export async function getPayment(accessToken: string, paymentId: string): Promise<MpPayment | null> {
  const res = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken)
  if (res.status === 404 || res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new MpError(res.status, 'payments')
  return toPayment(await res.json())
}

export async function searchPayments(accessToken: string, depositId: string): Promise<MpPayment[]> {
  const res = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(depositId)}&sort=date_created&criteria=desc`, accessToken)
  if (!res.ok) throw new MpError(res.status, 'payments/search')
  const data = await res.json()
  return Array.isArray(data.results) ? data.results.map(toPayment) : []
}

export interface Connection {
  venue_id: string
  mp_user_id: number
  access_token: string
  refresh_token: string
  token_expires_at: string
  status: 'conectada' | 'reconectar' | 'desconectada'
}

// Renueva la autorizacion de un complejo y la guarda. Si Mercado Pago la
// rechaza, la cuenta queda "reconectar": la seña deja de regir sola y el
// panel avisa. Devuelve la credencial vigente, o null si no se pudo.
export async function renewConnection(admin: SupabaseClient, conn: Connection): Promise<string | null> {
  try {
    const tokens = await refreshTokens(conn.refresh_token)
    await admin
      .from('mp_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: 'conectada',
        last_refreshed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('venue_id', conn.venue_id)
    log('mp_renovada', { venue: conn.venue_id })
    return tokens.access_token
  } catch (error) {
    const code = error instanceof MpError ? error.status : 0
    await admin
      .from('mp_connections')
      .update({ status: 'reconectar', last_error: `No se pudo renovar la autorización (${code || 'sin respuesta'}).` })
      .eq('venue_id', conn.venue_id)
      .neq('status', 'desconectada')
    log('mp_renovar_fallo', { venue: conn.venue_id, code })
    return null
  }
}

// La credencial del complejo todavia sirve en Mercado Pago. false solo si
// Mercado Pago la rechaza (permiso quitado); ante un error de red se asume
// que si, para no pausar la seña por un corte momentaneo.
export async function tokenStillValid(accessToken: string): Promise<boolean> {
  try {
    const res = await mpFetch('/users/me', accessToken)
    return !(res.status === 401 || res.status === 403)
  } catch {
    return true
  }
}

// El complejo le quito el permiso a la aplicacion (o Mercado Pago rechaza su
// credencial): la cuenta queda "reconectar". La seña deja de regir sola, las
// reservas siguen entrando como siempre y el panel avisa.
export async function markNeedsReconnect(admin: SupabaseClient, venueId: string, reason: string): Promise<void> {
  await admin.from('mp_connections').update({ status: 'reconectar', last_error: reason }).eq('venue_id', venueId).eq('status', 'conectada')
  log('mp_reconectar', { venue: venueId })
}

// Credencial para operar en nombre del complejo. Si esta por vencer, se
// renueva antes de usarla.
export async function sellerToken(admin: SupabaseClient, conn: Connection): Promise<string | null> {
  const msLeft = new Date(conn.token_expires_at).getTime() - Date.now()
  if (conn.status === 'desconectada' || msLeft > 24 * 3600 * 1000) return conn.access_token
  return (await renewConnection(admin, conn)) ?? (msLeft > 0 ? conn.access_token : null)
}

// Aplica en la base un pago ya consultado a Mercado Pago. La base decide si
// confirma, si queda a devolver o si ya estaba registrado.
export async function applyPayment(admin: SupabaseClient, depositId: string, payment: MpPayment): Promise<string> {
  const { data, error } = await admin.rpc('apply_deposit_payment', {
    p_deposit_id: depositId,
    p_payment_id: payment.id,
    p_status: payment.status,
    p_amount: payment.amount,
    p_currency: payment.currency,
    p_collector_id: payment.collectorId,
    p_paid_at: payment.paidAt,
  })
  if (error) throw new Error(`apply_deposit_payment: ${error.code ?? 'error'}`)
  log('pago_aplicado', { deposit: depositId, payment: payment.id, status: payment.status, result: String(data) })
  return String(data)
}
