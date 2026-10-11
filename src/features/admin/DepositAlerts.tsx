import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDepositsStore } from '@/store/depositsStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'
import { REFUND_REASON_TEXT } from '@/lib/deposits'
import { formatCurrency, fromDateKey } from '@/lib/format'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import type { DepositPayment } from '@/types'

function shortDate(key: string): string {
  return fromDateKey(key).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Avisos de la seña en el panel: la cuenta que hay que volver a conectar y
// los pagos que el dueño tiene que devolver desde su Mercado Pago.
export function DepositAlerts() {
  const available = useDepositsStore((s) => s.available)
  const connection = useDepositsStore((s) => s.connection)
  const deposits = useDepositsStore((s) => s.deposits)
  const payments = useDepositsStore((s) => s.payments)
  const markRefunded = useDepositsStore((s) => s.markRefunded)
  const [confirming, setConfirming] = useState<DepositPayment | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!available) return null
  const toRefund = payments.filter((p) => p.status === 'a_devolver')
  const needsReconnect = connection?.status === 'reconectar'
  if (toRefund.length === 0 && !needsReconnect) return null

  return (
    <div className="space-y-3">
      {needsReconnect && (
        <div role="alert" className="rounded-xl border border-warning-border/60 bg-warning-bg p-4 text-sm">
          <p className="font-medium text-warning">Hay que volver a conectar Mercado Pago</p>
          <p className="mt-1 text-gray-200">
            La autorización de tu cuenta dejó de funcionar y la seña está en pausa. Tus reservas siguen entrando sin seña.{' '}
            <Link to="/admin/configuracion" className="underline">
              Ir a Configuración
            </Link>
          </p>
        </div>
      )}

      {toRefund.length > 0 && (
        <div role="alert" className="rounded-xl border border-warning-border/60 bg-warning-bg p-4 text-sm">
          <p className="font-medium text-warning">
            {toRefund.length === 1 ? 'Tenés 1 seña para devolver' : `Tenés ${toRefund.length} señas para devolver`}
          </p>
          <p className="mt-1 text-xs text-gray-300">
            La devolución se hace desde tu Mercado Pago, buscando el número de operación. Cuando la hagas, marcala acá.
          </p>
          <ul className="mt-3 space-y-2">
            {toRefund.map((payment) => {
              const deposit = deposits.find((d) => d.id === payment.depositId)
              return (
                <li key={payment.paymentId} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-100">
                        {formatCurrency(payment.amount)} · operación {payment.paymentId}
                      </p>
                      {deposit && (
                        <p className="text-xs text-gray-400">
                          {deposit.courtName} · {shortDate(deposit.date)} {deposit.time} hs
                          {deposit.contactName && ` · ${deposit.contactName}`}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">{payment.refundReason ? REFUND_REASON_TEXT[payment.refundReason] : ''}</p>
                      {deposit?.contactWhatsapp && (
                        <a
                          href={buildWhatsAppLink(deposit.contactWhatsapp, `Hola ${deposit.contactName ?? ''}! Te escribo por la seña de tu reserva.`)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-primary-500 hover:underline"
                        >
                          Escribirle por WhatsApp
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirming(payment)}
                      className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"
                    >
                      Marcar como devuelta
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <ErrorText error={error} />
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Marcar como devuelta"
          message={`¿Ya devolviste ${formatCurrency(confirming.amount)} (operación ${confirming.paymentId}) desde tu Mercado Pago? Esto solo lo registra en el panel: no mueve plata. Los reportes dejan de contar ese cobro.`}
          confirmLabel="Sí, ya la devolví"
          danger={false}
          onConfirm={async () => {
            const payment = confirming
            setConfirming(null)
            setError(await markRefunded(payment.paymentId))
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
