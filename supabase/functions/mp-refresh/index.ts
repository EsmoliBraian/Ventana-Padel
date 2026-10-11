// Renueva las autorizaciones de Mercado Pago que estan por vencer. Solo la
// llama la tarea programada de la base (migracion 026), que manda una clave
// que nadie mas conoce. Cualquier otra llamada se rechaza.
import { adminClient, env, log, safeEqual } from '../_shared/util.ts'
import { renewConnection, type Connection } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  const given = req.headers.get('x-cron-secret') ?? ''
  if (req.method !== 'POST' || !given || !safeEqual(given, env('CRON_SECRET'))) {
    return new Response(JSON.stringify({ message: 'No autorizado.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const admin = adminClient()
  const limit = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const { data: conns } = await admin.from('mp_connections').select('*').in('status', ['conectada', 'reconectar']).lt('token_expires_at', limit)
  let renewed = 0
  let failed = 0
  for (const conn of (conns ?? []) as Connection[]) {
    if (await renewConnection(admin, conn)) renewed++
    else failed++
  }
  log('mp_renovacion_diaria', { count: renewed, result: `fallaron ${failed}` })
  return new Response(JSON.stringify({ renewed, failed }), { headers: { 'Content-Type': 'application/json' } })
})
