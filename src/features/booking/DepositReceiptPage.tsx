import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { confirmDeposit, fetchDepositReceipt, releaseDeposit, type DepositReceipt } from '@/lib/deposits'
import { formatCurrency, formatLongDate, fromDateKey } from '@/lib/format'
import { buildReservationMessage, buildWhatsAppLink } from '@/lib/whatsapp'
import { venuePath } from '@/lib/venuePath'

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000))
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4 text-gray-400">
      {label} <span className="text-right text-gray-100">{value}</span>
    </p>
  )
}

// Adonde vuelve el jugador despues de Mercado Pago. Muestra en que quedo la
// seña: pagada (comprobante y paso a WhatsApp), pendiente (reintentar
// mientras el horario siga guardado), vencida o a devolver.
export function DepositReceiptPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const key = params.get('k') ?? ''
  // Mercado Pago agrega el numero de pago a la vuelta.
  const paymentId = params.get('payment_id') ?? params.get('collection_id') ?? undefined
  const settings = useSettingsStore()

  const [receipt, setReceipt] = useState<DepositReceipt | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [, setTick] = useState(0)
  const checked = useRef(false)

  const refresh = useCallback(async () => {
    const next = await fetchDepositReceipt(id, key)
    setReceipt(next)
    setLoaded(true)
    return next
  }, [id, key])

  useEffect(() => {
    let stop = false
    async function start() {
      const first = await refresh()
      // Por si el aviso de Mercado Pago todavia no llego: se lo consulta el
      // servidor. Una sola vez al entrar.
      if (first && first.status === 'pendiente' && !checked.current) {
        checked.current = true
        await confirmDeposit(id, key, paymentId && /^\d+$/.test(paymentId) ? paymentId : undefined)
        if (!stop) await refresh()
      }
    }
    start()
    // Mientras este pendiente se vuelve a mirar cada pocos segundos.
    const timer = setInterval(async () => {
      if (stop) return
      setTick((t) => t + 1)
      setReceipt((current) => {
        if (current?.status === 'pendiente') refresh()
        return current
      })
    }, 4000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [id, key, paymentId, refresh])

  const reservePath = venuePath(settings.slug ?? '', '/reservar')

  if (!loaded) {
    return <div className="mx-auto max-w-xl px-5 py-20 text-center text-sm text-gray-400">Buscando tu reserva...</div>
  }
  if (!receipt) {
    return (
      <div className="mx-auto flex max-w-xl flex-col px-5 py-14 sm:py-20">
        <h1 className="mb-3 text-2xl font-semibold text-gray-50 sm:text-3xl">No encontramos esta reserva</h1>
        <p className="text-sm text-gray-400">El enlace no es válido o está incompleto.</p>
        <Link to={reservePath} className="mt-6 rounded-lg bg-primary-500 py-3 text-center font-medium text-white hover:bg-primary-400">
          Reservar un horario
        </Link>
      </div>
    )
  }

  const longDate = formatLongDate(fromDateKey(receipt.date))
  const rest = receipt.priceTotal - receipt.amount
  const stillHeld = receipt.status === 'pendiente' && !receipt.expired
  const summary = (
    <div className="mb-4 space-y-1 rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm">
      <Row label="Fecha" value={longDate} />
      <Row label="Horario" value={`${receipt.time} hs`} />
      <Row label="Cancha" value={receipt.courtName} />
    </div>
  )

  async function handleRelease() {
    setReleasing(true)
    await releaseDeposit(id, key)
    await refresh()
    setReleasing(false)
  }

  function openWhatsApp() {
    if (!receipt) return
    const message = [
      buildReservationMessage({ date: receipt.date, time: receipt.time, courtName: receipt.courtName }).replace('\nGracias!', ''),
      `Seña pagada: ${formatCurrency(receipt.amount)} (operación ${receipt.paymentId ?? ''})`,
      'Gracias!',
    ].join('\n')
    window.open(buildWhatsAppLink(settings.whatsappPhone, message), '_blank')
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col px-5 py-14 sm:py-20">
      {receipt.status === 'pagada' && (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-success">Seña pagada</p>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">Tu reserva está confirmada</h1>
          {summary}
          <div className="mb-4 space-y-1 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <Row label="Seña pagada" value={formatCurrency(receipt.amount)} />
            <Row label="Te queda pagar en el complejo" value={formatCurrency(rest)} />
            <Row label="Operación de Mercado Pago" value={String(receipt.paymentId ?? '')} />
            {receipt.paidAt && (
              <Row
                label="Pagada el"
                value={new Date(receipt.paidAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              />
            )}
          </div>
          <p className="mb-4 text-xs text-gray-500">Guardá el número de operación: es tu comprobante.</p>
          {settings.whatsappPhone && (
            <button type="button" onClick={openWhatsApp} className="rounded-lg bg-success py-3 font-medium text-gray-950 hover:bg-success/90">
              AVISAR AL COMPLEJO POR WHATSAPP
            </button>
          )}
        </>
      )}

      {stillHeld && (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-warning">Falta pagar la seña</p>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">
            {receipt.lastAttemptStatus ? 'El pago no se aprobó' : 'Tu horario está guardado'}
          </h1>
          {summary}
          <div role="status" className="mb-4 rounded-lg border border-warning-border/60 bg-warning-bg p-3 text-sm text-gray-200">
            {receipt.lastAttemptStatus
              ? 'Mercado Pago rechazó el pago. No se te cobró nada. Podés probar de nuevo con otro medio de pago.'
              : 'Todavía no recibimos el pago de la seña.'}{' '}
            Te guardamos el horario {minutesLeft(receipt.expiresAt) <= 1 ? '1 minuto más' : `${minutesLeft(receipt.expiresAt)} minutos más`}; si no se paga, se
            libera solo.
          </div>
          <p className="mb-4 text-sm text-gray-400">
            Seña <span className="ml-2 text-lg font-semibold text-gray-50">{formatCurrency(receipt.amount)}</span>
          </p>
          {receipt.payUrl && (
            <a href={receipt.payUrl} className="rounded-lg bg-primary-500 py-3 text-center font-medium text-white hover:bg-primary-400">
              {receipt.lastAttemptStatus ? 'REINTENTAR EL PAGO' : 'PAGAR LA SEÑA'}
            </a>
          )}
          <button type="button" onClick={handleRelease} disabled={releasing} className="mt-3 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-60">
            No lo quiero: liberar el horario
          </button>
        </>
      )}

      {(receipt.status === 'vencida' || (receipt.status === 'pendiente' && receipt.expired)) && (
        <>
          <h1 className="mb-3 text-2xl font-semibold text-gray-50 sm:text-3xl">El horario se liberó</h1>
          {summary}
          <p className="mb-6 text-sm text-gray-400">
            No se pagó la seña a tiempo, así que el horario volvió a quedar disponible. No se te cobró nada. Podés reservar de
            nuevo.
          </p>
          <Link to={reservePath} className="rounded-lg bg-primary-500 py-3 text-center font-medium text-white hover:bg-primary-400">
            Elegir otro horario
          </Link>
        </>
      )}

      {(receipt.status === 'a_devolver' || receipt.status === 'devuelta') && (
        <>
          <h1 className="mb-3 text-2xl font-semibold text-gray-50 sm:text-3xl">
            {receipt.status === 'devuelta' ? 'La seña fue devuelta' : 'Esta reserva no quedó confirmada'}
          </h1>
          {summary}
          <div role="status" className="mb-4 rounded-lg border border-warning-border/60 bg-warning-bg p-3 text-sm text-gray-200">
            {receipt.status === 'devuelta'
              ? `El complejo registró la devolución de ${formatCurrency(receipt.amount)}.`
              : `Tu pago de ${formatCurrency(receipt.amount)} entró, pero la reserva no está vigente. El complejo te tiene que devolver la seña.`}{' '}
            Número de operación de Mercado Pago: {receipt.paymentId ?? '-'}.
          </div>
          {settings.whatsappPhone && (
            <a
              href={buildWhatsAppLink(settings.whatsappPhone, `Hola! Les escribo por la seña de mi reserva (operación ${receipt.paymentId ?? ''}).`)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-success py-3 text-center font-medium text-gray-950 hover:bg-success/90"
            >
              Escribir al complejo por WhatsApp
            </a>
          )}
          <Link to={reservePath} className="mt-3 text-center text-sm text-gray-400 hover:text-gray-200">
            Elegir otro horario
          </Link>
        </>
      )}
    </div>
  )
}
