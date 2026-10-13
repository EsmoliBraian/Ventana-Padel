// "Conectar Mercado Pago": arma el enlace de autorizacion oficial para el
// dueño que esta logueado. No devuelve ninguna credencial.
import { adminClient, allowedOrigin, appUrls, corsHeaders, json, log, randomToken, sha256Base64Url, sha256Hex, slugAllowed, venueWritable } from '../_shared/util.ts'
import { authorizationUrl } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  const origin = allowedOrigin(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ message: 'Método no permitido.' }, 405, origin)
  if (!origin) return json({ message: 'Origen no permitido.' }, 403, null)

  try {
    const admin = adminClient()
    // Quien llama: se valida su sesion contra el servidor de autenticacion.
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(jwt)
    if (authError || !auth?.user) return json({ message: 'Iniciá sesión para conectar tu cuenta.' }, 401, origin)

    const { data: venue } = await admin
      .from('settings')
      .select('id, slug, plan_status, trial_ends_at, is_demo')
      .eq('owner_id', auth.user.id)
      .maybeSingle()
    if (!venue) return json({ message: 'No encontramos tu complejo.' }, 404, origin)
    // La seña se habilita complejo por complejo (DEPOSIT_ALLOWED_SLUGS). El
    // panel pregunta primero, para no ofrecer conectar a quien no la tiene.
    const allowed = !venue.is_demo && slugAllowed(venue.slug)
    const body = await req.json().catch(() => ({}))
    if (body?.check === true) return json({ allowed }, 200, origin)
    if (!allowed) return json({ message: 'La seña con Mercado Pago todavía no está disponible para tu complejo.' }, 403, origin)
    if (!venueWritable(venue)) return json({ message: 'La prueba gratis de este complejo terminó: el panel está en solo lectura.' }, 403, origin)

    // "state": al azar, de un solo uso, vence en 10 minutos y queda atado a
    // este complejo y a este dueño. En la base se guarda solo su hash. El
    // sufijo dice a que sitio volver (posicion en APP_URLS) y va dentro de
    // lo que se firma con el hash, asi que no se puede cambiar.
    const state = `${randomToken(32)}.${appUrls().indexOf(origin)}`
    const codeVerifier = randomToken(48)
    const { error } = await admin.from('mp_oauth_states').insert({
      state_hash: await sha256Hex(state),
      venue_id: venue.id,
      user_id: auth.user.id,
      code_verifier: codeVerifier,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (error) throw new Error(`mp_oauth_states: ${error.code}`)

    log('mp_conectar_inicio', { venue: venue.id })
    return json({ url: authorizationUrl(state, await sha256Base64Url(codeVerifier)) }, 200, origin)
  } catch (error) {
    log('mp_conectar_error', { reason: error instanceof Error ? error.message : 'error' })
    return json({ message: 'No pudimos iniciar la conexión con Mercado Pago. Probá de nuevo.' }, 500, origin)
  }
})
