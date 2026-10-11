// Piezas comunes de las funciones de la seña.
//
// Reglas que valen para todas:
//  - Nunca se escribe en los logs una credencial, un token, una clave ni un
//    dato de tarjeta. `log` solo deja pasar identificadores y codigos.
//  - Lo que llega del navegador no se cree: montos, precios y permisos salen
//    de la base.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback
  if (value === undefined || value === '') throw new Error(`Falta configurar ${name}`)
  return value
}

// Cliente con el rol de servicio: es el unico que llega a las tablas privadas.
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Direccion publica de las funciones (la que ve Mercado Pago).
export function functionsUrl(): string {
  return (Deno.env.get('FUNCTIONS_PUBLIC_URL') ?? `${env('SUPABASE_URL')}/functions/v1`).replace(/\/+$/, '')
}

// Sitios desde los que se puede usar esto: produccion y, mientras se prueba,
// la vista previa. Lista separada por comas en APP_URLS.
export function appUrls(): string[] {
  return env('APP_URLS')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function allowedOrigin(req: Request): string | null {
  const origin = (req.headers.get('origin') ?? '').replace(/\/+$/, '')
  return appUrls().includes(origin) ? origin : null
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? appUrls()[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

// Mientras se prueba, DEPOSIT_ALLOWED_SLUGS limita la seña a esos complejos.
// Vacio o sin definir: cualquiera.
export function slugAllowed(slug: string | null | undefined): boolean {
  const list = (Deno.env.get('DEPOSIT_ALLOWED_SLUGS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length === 0 || (!!slug && list.includes(slug))
}

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Base64Url(text: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}

// Comparacion que tarda lo mismo acierte o no, para no filtrar la clave.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Unico camino a los logs. Solo acepta estos campos, y como texto corto.
const LOG_FIELDS = ['venue', 'deposit', 'payment', 'status', 'code', 'result', 'reason', 'count', 'mp_user'] as const
type LogData = Partial<Record<(typeof LOG_FIELDS)[number], string | number | null | undefined>>

export function log(event: string, data: LogData = {}): void {
  const safe: Record<string, string> = { evt: event }
  for (const field of LOG_FIELDS) {
    const value = data[field]
    if (value !== undefined && value !== null) safe[field] = String(value).slice(0, 80)
  }
  console.log(JSON.stringify(safe))
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// El complejo admite escrituras: plan activo o prueba sin vencer.
export function venueWritable(venue: { plan_status: string; trial_ends_at: string | null }): boolean {
  if (venue.plan_status === 'active') return true
  return venue.plan_status === 'trial' && !!venue.trial_ends_at && new Date(venue.trial_ends_at) > new Date()
}
