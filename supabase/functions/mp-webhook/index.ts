// Aviso de pago de Mercado Pago. Lo llama Mercado Pago, sin sesion: lo que
// lo autoriza es la firma.
//
//  1. Se verifica la firma (x-signature) con la clave secreta de la
//     aplicacion. Sin firma valida no se hace nada.
//  2. Aun con firma valida, el contenido del aviso no se cree: se le pide el
//     pago a Mercado Pago con la credencial del complejo, y lo que se aplica
//     son los datos de esa consulta.
//  3. La base registra cada pago una sola vez: un aviso repetido no cambia nada.
import { adminClient, env, hmacSha256Hex, isUuid, log, safeEqual } from '../_shared/util.ts'
import { applyPayment, getPayment, markNeedsReconnect, MpError, sellerToken, tokenStillValid, type Connection, type MpPayment } from '../_shared/mp.ts'

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function signatureIsValid(req: Request, dataId: string): Promise<boolean> {
  const header = req.headers.get('x-signature') ?? ''
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false
  const requestId = req.headers.get('x-request-id') ?? ''
  // Plantilla de Mercado Pago. El identificador va en minusculas si es
  // alfanumerico, y las partes que no vienen se omiten.
  let manifest = ''
  if (dataId) manifest += `id:${dataId.toLowerCase()};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const expected = await hmacSha256Hex(env('MP_WEBHOOK_SECRET'), manifest)
  return safeEqual(expected, v1.toLowerCase())
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { message: 'Método no permitido.' })

  const url = new URL(req.url)
  const raw = await req.text()
  let body: Record<string, unknown> = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    body = {}
  }
  const data = (body.data ?? {}) as { id?: unknown }
  const dataId = String(url.searchParams.get('data.id') ?? data.id ?? '')

  try {
    if (!(await signatureIsValid(req, dataId))) {
      log('aviso_firma_invalida')
      return reply(401, { message: 'Firma no válida.' })
    }
    // "topic" es el nombre viejo de "type" en los avisos de pagos.
    const type = String(url.searchParams.get('type') ?? body.type ?? url.searchParams.get('topic') ?? body.topic ?? '')
    const admin = adminClient()

    // Vinculacion de aplicaciones: un complejo le quito el permiso a PlayXP
    // desde su Mercado Pago. No se cree el aviso a ciegas: se prueba la
    // credencial, y solo si Mercado Pago la rechaza la cuenta pasa a
    // "reconectar".
    if (type === 'mp-connect') {
      const user = Number(body.user_id)
      if (String(body.action ?? '').includes('deauthorized') && Number.isFinite(user) && user > 0) {
        const { data: linked } = await admin.from('mp_connections').select('*').eq('mp_user_id', user).eq('status', 'conectada')
        for (const conn of (linked ?? []) as Connection[]) {
          if (!(await tokenStillValid(conn.access_token))) {
            await markNeedsReconnect(admin, conn.venue_id, 'Se quitó el permiso de PlayXP desde Mercado Pago.')
          }
        }
      }
      return reply(200, { ok: true })
    }
    if (type !== 'payment' || !/^[0-9]{1,20}$/.test(dataId)) return reply(200, { ok: true, ignored: true })

    // El aviso dice de que cuenta es el pago. Se busca el complejo conectado
    // con esa cuenta (incluso recien desconectado: su credencial se conserva
    // un tiempo para esto).
    const mpUser = Number(body.user_id)
    const query = admin.from('mp_connections').select('*')
    const { data: conns } = Number.isFinite(mpUser) && mpUser > 0 ? await query.eq('mp_user_id', mpUser) : await query
    const connections = (conns ?? []) as Connection[]
    let payment: MpPayment | null = null
    for (const conn of connections) {
      const token = await sellerToken(admin, conn)
      if (!token) continue
      payment = await getPayment(token, dataId)
      if (payment) break
    }
    if (!payment) {
      log('aviso_sin_pago', { payment: dataId })
      return reply(200, { ok: true, ignored: true })
    }
    const depositId = payment.externalReference
    if (!isUuid(depositId)) return reply(200, { ok: true, ignored: true })
    const { data: deposit } = await admin.from('reservation_deposits').select('id, venue_id').eq('id', depositId).maybeSingle()
    // La seña tiene que ser de un complejo conectado con la cuenta que cobro.
    // (Una misma cuenta de Mercado Pago puede estar conectada a mas de un
    // complejo; ademas, la base vuelve a comparar la cuenta receptora.)
    if (!deposit || !connections.some((c) => c.venue_id === deposit.venue_id)) return reply(200, { ok: true, ignored: true })

    const result = await applyPayment(admin, depositId, payment)
    return reply(200, { ok: true, result })
  } catch (error) {
    // Con un error nuestro o de Mercado Pago se responde 500: Mercado Pago
    // reintenta el aviso mas tarde.
    log('aviso_error', { payment: dataId, code: error instanceof MpError ? error.status : 0, reason: error instanceof MpError ? 'mercado_pago' : 'interno' })
    return reply(500, { message: 'Error al procesar el aviso.' })
  }
})
