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
import { applyPayment, getPayment, MpError, sellerToken, type Connection, type MpPayment } from '../_shared/mp.ts'

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
    const type = String(url.searchParams.get('type') ?? body.type ?? '')
    if (type !== 'payment' || !/^[0-9]{1,20}$/.test(dataId)) return reply(200, { ok: true, ignored: true })

    const admin = adminClient()
    // El aviso dice de que cuenta es el pago. Se busca el complejo conectado
    // con esa cuenta (incluso recien desconectado: su credencial se conserva
    // un tiempo para esto).
    const mpUser = Number(body.user_id)
    const query = admin.from('mp_connections').select('*')
    const { data: conns } = Number.isFinite(mpUser) && mpUser > 0 ? await query.eq('mp_user_id', mpUser) : await query
    let payment: MpPayment | null = null
    let owner: Connection | null = null
    for (const conn of (conns ?? []) as Connection[]) {
      const token = await sellerToken(admin, conn)
      if (!token) continue
      payment = await getPayment(token, dataId)
      if (payment) {
        owner = conn
        break
      }
    }
    if (!payment || !owner) {
      log('aviso_sin_pago', { payment: dataId })
      return reply(200, { ok: true, ignored: true })
    }
    const depositId = payment.externalReference
    if (!isUuid(depositId)) return reply(200, { ok: true, ignored: true })
    const { data: deposit } = await admin.from('reservation_deposits').select('id, venue_id').eq('id', depositId).maybeSingle()
    // La seña tiene que ser del mismo complejo que la cuenta que cobro.
    if (!deposit || deposit.venue_id !== owner.venue_id) return reply(200, { ok: true, ignored: true })

    const result = await applyPayment(admin, depositId, payment)
    return reply(200, { ok: true, result })
  } catch (error) {
    // Con un error nuestro o de Mercado Pago se responde 500: Mercado Pago
    // reintenta el aviso mas tarde.
    log('aviso_error', { payment: dataId, code: error instanceof MpError ? error.status : 0, reason: error instanceof MpError ? 'mercado_pago' : 'interno' })
    return reply(500, { message: 'Error al procesar el aviso.' })
  }
})
