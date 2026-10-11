// El jugador elige un horario y va a pagar la seña. Esta funcion guarda el
// horario (la base valida todo y calcula el monto) y arma el cobro en la
// cuenta de Mercado Pago del complejo. Del navegador solo se toma que
// horario quiere y sus datos de contacto: nunca un monto.
import { adminClient, allowedOrigin, corsHeaders, env, json, log, randomToken, sha256Hex, slugAllowed } from '../_shared/util.ts'
import { createPreference, markNeedsReconnect, MpError, sellerToken, type Connection } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  const origin = allowedOrigin(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ message: 'Método no permitido.' }, 405, origin)
  if (!origin) return json({ message: 'Origen no permitido.' }, 403, null)

  let depositId: string | null = null
  let venueId: string | null = null
  const admin = adminClient()
  try {
    const body = await req.json().catch(() => ({}))
    const slug = typeof body.slug === 'string' ? body.slug : ''
    const { data: venue } = await admin.from('settings').select('id, slug, venue_name').eq('slug', slug).maybeSingle()
    if (!venue || !slugAllowed(venue.slug)) return json({ code: 'no_disponible', message: 'Este complejo no está tomando señas online.' }, 400, origin)
    venueId = venue.id

    // Huella del visitante para el limite de horarios guardados. Solo con la
    // direccion que pone la red de borde (no se puede falsear desde el
    // navegador). Si no llega, este limite no se aplica: quedan el de
    // WhatsApp y el tope del complejo.
    const ip = req.headers.get('cf-connecting-ip') ?? ''
    const visitorHash = await sha256Hex(`${env('VISITOR_SALT')}|${venue.id}|${ip || randomToken(16)}`)

    // Clave del enlace del comprobante: se le entrega al jugador y en la
    // base queda solo su hash.
    const key = randomToken(24)
    const { data: deposit, error } = await admin.rpc('create_deposit_hold', {
      p_venue_id: venue.id,
      p_court_id: body.courtId,
      p_date: body.date,
      p_time: body.time,
      p_name: body.name,
      p_whatsapp: body.whatsapp,
      p_visitor_hash: visitorHash,
      p_key_hash: await sha256Hex(key),
    })
    if (error) {
      // 23505 / 23P01: el horario ya esta tomado (otra reserva o turno fijo).
      if (error.code === '23505' || error.code === '23P01') return json({ code: 'ocupado', message: 'Ese horario se acaba de ocupar. Elegí otro.' }, 409, origin)
      if (error.code === 'PX429') return json({ code: 'limite', message: error.message }, 429, origin)
      if (error.code === 'PX400') return json({ code: 'invalido', message: error.message }, 400, origin)
      // Datos mal formados (fecha o identificador invalidos).
      if (error.code?.startsWith('22')) return json({ code: 'invalido', message: 'Revisá los datos de la reserva.' }, 400, origin)
      throw new Error(`create_deposit_hold: ${error.code}`)
    }
    depositId = deposit.id

    const { data: conn } = await admin.from('mp_connections').select('*').eq('venue_id', venue.id).eq('status', 'conectada').maybeSingle()
    const token = conn ? await sellerToken(admin, conn as Connection) : null
    if (!token) throw new MpError(401, 'credencial del complejo')

    const preference = await createPreference(token, {
      depositId: deposit.id,
      title: `Seña ${deposit.court_name} · ${deposit.date} ${deposit.time} hs · ${venue.venue_name}`.slice(0, 250),
      amount: Number(deposit.amount),
      returnUrl: `${origin}/${venue.slug}/sena/${deposit.id}?k=${key}`,
      expiresAt: deposit.expires_at,
    })
    const { error: saveError } = await admin
      .from('reservation_deposits')
      .update({ mp_preference_id: preference.id, mp_init_point: preference.payUrl })
      .eq('id', deposit.id)
    if (saveError) throw new Error(`reservation_deposits: ${saveError.code}`)

    log('sena_creada', { venue: venue.id, deposit: deposit.id })
    return json(
      { depositId: deposit.id, key, payUrl: preference.payUrl, amount: Number(deposit.amount), priceTotal: Number(deposit.price_total), expiresAt: deposit.expires_at },
      200,
      origin,
    )
  } catch (error) {
    // Si el cobro no se pudo armar, el horario se suelta en el momento.
    if (depositId) await admin.rpc('cancel_deposit_hold', { p_deposit_id: depositId })
    // Mercado Pago rechaza la credencial del complejo (le quitaron el
    // permiso): la seña se pausa para que el proximo jugador pueda reservar
    // como siempre, y se le dice a este que vuelva a intentar.
    if (error instanceof MpError && (error.status === 401 || error.status === 403) && venueId) {
      await markNeedsReconnect(admin, venueId, 'Mercado Pago rechazó la autorización de la cuenta.')
      return json({ code: 'sin_sena', message: 'El pago online no está disponible en este momento. Volvé a elegir el horario para reservar sin seña.' }, 409, origin)
    }
    log('sena_error', { deposit: depositId, code: error instanceof MpError ? error.status : 0, reason: error instanceof MpError ? 'mercado_pago' : error instanceof Error ? error.message : 'error' })
    return json({ code: 'error', message: 'No pudimos iniciar el pago de la seña. Probá de nuevo en un momento.' }, 502, origin)
  }
})
