// Vuelta de la autorizacion de Mercado Pago. La llama el navegador del dueño
// redirigido por Mercado Pago: no trae sesion de PlayXP. Lo unico que
// autoriza es el "state", que se canjea una sola vez.
import { adminClient, appUrls, log, sha256Hex, slugAllowed } from '../_shared/util.ts'
import { accountLabel, exchangeCode, MpError } from '../_shared/mp.ts'

function back(base: string, result: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${base}/admin/configuracion?mp=${result}`, 'Cache-Control': 'no-store' } })
}

Deno.serve(async (req) => {
  const urls = appUrls()
  const params = new URL(req.url).searchParams
  const state = params.get('state') ?? ''
  const code = params.get('code') ?? ''
  // A que sitio volver: el sufijo del state. Si no sirve, al principal.
  const index = Number(state.split('.').pop())
  const base = Number.isInteger(index) && urls[index] ? urls[index] : urls[0]

  if (req.method !== 'GET') return new Response('Método no permitido.', { status: 405 })
  if (!state || !code) return back(base, 'cancelada')

  try {
    const admin = adminClient()
    const { data: rows, error: stateError } = await admin.rpc('consume_mp_oauth_state', { p_state_hash: await sha256Hex(state) })
    if (stateError) throw new Error(`consume_mp_oauth_state: ${stateError.code}`)
    const pending = rows?.[0]
    // Vencido, ya usado o inventado.
    if (!pending) return back(base, 'vencida')

    // El complejo sigue siendo de quien inicio la conexion.
    const { data: venue } = await admin.from('settings').select('id, slug, owner_id, is_demo').eq('id', pending.venue_id).maybeSingle()
    if (!venue || venue.owner_id !== pending.user_id || venue.is_demo || !slugAllowed(venue.slug)) return back(base, 'error')

    const tokens = await exchangeCode(code, pending.code_verifier)
    const label = await accountLabel(tokens.access_token, tokens.user_id)
    const { error } = await admin.from('mp_connections').upsert({
      venue_id: venue.id,
      mp_user_id: tokens.user_id,
      account_label: label,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: 'conectada',
      connected_by: pending.user_id,
      connected_at: new Date().toISOString(),
      last_refreshed_at: null,
      last_error: null,
      disconnected_at: null,
      purge_after: null,
    })
    if (error) throw new Error(`mp_connections: ${error.code}`)
    log('mp_conectada', { venue: venue.id, mp_user: tokens.user_id })
    return back(base, 'conectada')
  } catch (error) {
    log('mp_conectar_fallo', { code: error instanceof MpError ? error.status : 0, reason: error instanceof MpError ? 'mercado_pago' : 'interno' })
    return back(base, 'error')
  }
})
