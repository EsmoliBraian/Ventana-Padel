// El jugador vuelve de Mercado Pago. Por si el aviso del servidor todavia no
// llego, esta funcion le pregunta a Mercado Pago por los pagos de esa seña y
// los aplica. No confia en nada de lo que trae el navegador salvo el
// identificador de la seña y la clave de su enlace.
import { adminClient, allowedOrigin, corsHeaders, isUuid, json, log } from '../_shared/util.ts'
import { applyPayment, getPayment, MpError, searchPayments, sellerToken, type Connection } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  const origin = allowedOrigin(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ message: 'Método no permitido.' }, 405, origin)
  if (!origin) return json({ message: 'Origen no permitido.' }, 403, null)

  try {
    const body = await req.json().catch(() => ({}))
    const depositId = body.depositId
    const key = typeof body.key === 'string' ? body.key : ''
    if (!isUuid(depositId) || !key) return json({ message: 'Enlace no válido.' }, 400, origin)

    const admin = adminClient()
    // La clave del enlace es lo que habilita la consulta.
    const { data: rows } = await admin.rpc('deposit_status', { p_deposit_id: depositId, p_key: key })
    if (!rows?.[0]) return json({ message: 'Enlace no válido.' }, 404, origin)

    const { data: deposit } = await admin.from('reservation_deposits').select('id, venue_id, status').eq('id', depositId).maybeSingle()
    // Sirve tambien para una cuenta recien desconectada: su credencial se
    // conserva un tiempo justamente para verificar pagos en curso.
    const { data: conn } = await admin.from('mp_connections').select('*').eq('venue_id', deposit!.venue_id).maybeSingle()
    const token = conn ? await sellerToken(admin, conn as Connection) : null
    if (token) {
      const paymentId = typeof body.paymentId === 'string' && /^[0-9]{1,20}$/.test(body.paymentId) ? body.paymentId : null
      const one = paymentId ? await getPayment(token, paymentId) : null
      const payments = one ? [one] : await searchPayments(token, depositId)
      // Solo pagos de ESTA seña, del mas viejo al mas nuevo.
      for (const payment of payments.filter((p) => p.externalReference === depositId).sort((a, b) => a.id - b.id)) {
        await applyPayment(admin, depositId, payment)
      }
    }
    const { data: after } = await admin.rpc('deposit_status', { p_deposit_id: depositId, p_key: key })
    return json({ status: after?.[0]?.status ?? rows[0].status }, 200, origin)
  } catch (error) {
    log('sena_confirmar_error', { code: error instanceof MpError ? error.status : 0, reason: error instanceof MpError ? 'mercado_pago' : 'interno' })
    return json({ message: 'No pudimos verificar el pago todavía.' }, 502, origin)
  }
})
