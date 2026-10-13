import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useDepositsStore } from '@/store/depositsStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'
import { depositAmountFor, MP_FEE_NOTE } from '@/lib/deposits'
import { buildDepositRequestLink } from '@/lib/plan'
import { formatCurrency } from '@/lib/format'
import type { DepositType } from '@/types'

// Lo que devuelve la vuelta de la autorizacion de Mercado Pago (?mp=...).
const RETURN_MESSAGE: Record<string, { ok: boolean; text: string }> = {
  conectada: { ok: true, text: 'Tu cuenta de Mercado Pago quedó conectada.' },
  cancelada: { ok: false, text: 'No se completó la autorización en Mercado Pago. Tu cuenta no quedó conectada.' },
  vencida: { ok: false, text: 'El pedido de conexión venció o ya se había usado. Tocá "Conectar Mercado Pago" de nuevo.' },
  error: { ok: false, text: 'No pudimos conectar tu cuenta de Mercado Pago. Probá de nuevo en un momento.' },
}

// El resultado de la vuelta se guarda un momento en la pestaña: la pantalla
// puede volver a armarse mientras termina de cargar el panel, y el cartel no
// tiene que perderse por eso.
const RETURN_KEY = 'playxp.mp.vuelta'

function takeReturn(result: string | null): { ok: boolean; text: string } | null {
  try {
    if (result) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ result, at: Date.now() }))
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') as { result: string; at: number } | null
    if (saved && Date.now() - saved.at < 20_000) return RETURN_MESSAGE[saved.result] ?? RETURN_MESSAGE.error
  } catch {
    // Sin almacenamiento de la pestaña, se muestra solo si la direccion lo trae.
    if (result) return RETURN_MESSAGE[result] ?? RETURN_MESSAGE.error
  }
  return null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Seña con Mercado Pago: conectar la cuenta del complejo y configurar el
// cobro. La plata va directo a esa cuenta; PlayXP no cobra ni retiene nada.
export function SenaPanel() {
  const settings = useSettingsStore()
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const available = useDepositsStore((s) => s.available)
  const allowed = useDepositsStore((s) => s.allowed)
  const demo = useDepositsStore((s) => s.demo)
  const connection = useDepositsStore((s) => s.connection)
  const pendingCount = useDepositsStore((s) => s.deposits.filter((d) => d.status === 'pendiente').length)
  const [params, setParams] = useSearchParams()

  const [enabled, setEnabled] = useState(settings.depositEnabled)
  const [type, setType] = useState<DepositType>(settings.depositType)
  const [value, setValue] = useState(settings.depositValue > 0 ? String(settings.depositValue) : '')
  const [minutes, setMinutes] = useState(String(settings.depositHoldMinutes))
  const [policy, setPolicy] = useState(settings.depositPolicy)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  // Al volver de Mercado Pago: se muestra el resultado y se limpia la direccion.
  const [returned] = useState(() => takeReturn(params.get('mp')))
  useEffect(() => {
    if (!params.get('mp')) return
    useDepositsStore.getState().fetchAll()
    const next = new URLSearchParams(params)
    next.delete('mp')
    setParams(next, { replace: true })
  }, [params, setParams])

  // Si la seña se desactivo desde otro lado (por ejemplo, al desconectar).
  useEffect(() => {
    setEnabled(settings.depositEnabled)
  }, [settings.depositEnabled])

  if (!available) return null

  const connected = connection?.status === 'conectada'
  // A un complejo que no tiene la seña habilitada (o al de ejemplo) no se le
  // ofrece conectar ni configurar nada.
  const onRequest = allowed === false
  const requestLink = buildDepositRequestLink(settings.venueName)
  const numericValue = Number(value) || 0
  const numericMinutes = Number(minutes) || 0
  const dirty =
    enabled !== settings.depositEnabled ||
    type !== settings.depositType ||
    numericValue !== settings.depositValue ||
    numericMinutes !== settings.depositHoldMinutes ||
    policy !== settings.depositPolicy
  const example = numericValue > 0 ? depositAmountFor({ depositType: type, depositValue: numericValue }, 20000) : 0

  async function handleConnect() {
    setBusy(true)
    setError(await useDepositsStore.getState().connect())
    setBusy(false)
  }

  async function handleDisconnect() {
    setConfirmingDisconnect(false)
    setBusy(true)
    setError(await useDepositsStore.getState().disconnect())
    setBusy(false)
  }

  async function handleSave() {
    if (enabled && numericValue <= 0) return setError('Cargá el monto de la seña antes de activarla.')
    if (type === 'porcentaje' && numericValue > 100) return setError('El porcentaje no puede ser mayor que 100.')
    if (numericMinutes < 5 || numericMinutes > 60) return setError('El tiempo para pagar va de 5 a 60 minutos.')
    setBusy(true)
    const saveError = await updateSettings({
      depositEnabled: enabled,
      depositType: type,
      depositValue: numericValue,
      depositHoldMinutes: numericMinutes,
      depositPolicy: policy.trim(),
    })
    setBusy(false)
    setError(saveError)
    if (!saveError) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div>
        <p className="text-sm font-medium text-gray-200">Seña con Mercado Pago</p>
        <p className="text-xs text-gray-500">
          Tus jugadores pagan una seña al reservar desde tu sitio. La plata va directo a tu cuenta de Mercado Pago: PlayXP no
          cobra comisión ni recibe ese dinero.
        </p>
      </div>

      {returned && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            returned.ok ? 'border-success/40 bg-success/10 text-success' : 'border-warning-border/60 bg-warning-bg text-warning'
          }`}
        >
          {returned.text}
        </p>
      )}

      {onRequest && (
        <div className="rounded-lg border border-gray-800 bg-gray-925 p-3">
          <p className="text-sm text-gray-300">
            {demo
              ? 'En el complejo de ejemplo la seña con Mercado Pago no se puede activar.'
              : 'La seña con Mercado Pago se activa a pedido. Escribinos por WhatsApp.'}
          </p>
          {requestLink && !demo && (
            <a
              href={requestLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400"
            >
              Pedir por WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Cuenta */}
      {onRequest && !connection ? null : connection ? (
        <div className="rounded-lg border border-gray-800 bg-gray-925 p-3">
          <p className="text-xs text-gray-500">{connected ? 'Cuenta conectada' : 'Hay que volver a conectar la cuenta'}</p>
          <p className="break-all text-sm font-medium text-gray-100">{connection.accountLabel}</p>
          <p className="text-xs text-gray-500">Desde el {formatDate(connection.connectedAt)}</p>
          {!connected && (
            <p role="alert" className="mt-2 text-xs text-warning">
              Mercado Pago dejó de aceptar la autorización, así que la seña está en pausa: tus reservas siguen entrando sin
              seña, como antes. Volvé a conectar la cuenta para reactivarla.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!connected && !onRequest && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy}
                className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-400 disabled:opacity-50"
              >
                Volver a conectar
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={busy}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-925 p-3">
          <p className="text-sm text-gray-300">Todavía no conectaste ninguna cuenta.</p>
          <p className="mt-1 text-xs text-gray-500">
            Te llevamos a Mercado Pago para que autorices a PlayXP a crear los cobros a tu nombre. No vas a tener que copiar
            ninguna clave.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || allowed === null}
            className="mt-3 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400 disabled:opacity-50"
          >
            {busy ? 'Abriendo Mercado Pago...' : 'Conectar Mercado Pago'}
          </button>
        </div>
      )}

      {/* Configuracion del cobro */}
      <fieldset disabled={!connection} hidden={onRequest} className="space-y-3 disabled:opacity-50">
        <label className="flex items-center gap-3 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary-500"
          />
          Pedir seña al reservar desde mi sitio
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm text-gray-400">
            Tipo de seña
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DepositType)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            >
              <option value="fijo">Monto fijo en pesos</option>
              <option value="porcentaje">Porcentaje del turno</option>
            </select>
          </label>
          <label className="block text-sm text-gray-400">
            {type === 'fijo' ? 'Monto ($)' : 'Porcentaje (%)'}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder={type === 'fijo' ? '5000' : '30'}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="block text-sm text-gray-400">
            Minutos para pagar
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          {numericValue > 0 && <>En un turno de {formatCurrency(20000)}, la seña sería de {formatCurrency(example)}. </>}
          Mientras el jugador paga, el horario queda guardado esos minutos; si no paga, se libera solo. {MP_FEE_NOTE}
        </p>

        <label className="block text-sm text-gray-400">
          Política de la seña (la ve el jugador antes de pagar)
          <textarea
            value={policy}
            onChange={(e) => setPolicy(e.target.value.slice(0, 400))}
            rows={2}
            placeholder="Por ejemplo: si avisás con 24 horas te devolvemos la seña; si no te presentás, no se devuelve."
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <p className="text-xs text-gray-500">
          Las reservas que cargás vos a mano y los turnos fijos no piden seña. Las devoluciones las hacés desde tu Mercado
          Pago; acá te mostramos el número de operación para encontrarlas.
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || busy}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400 disabled:opacity-50"
        >
          Guardar seña
        </button>
        {saved && <span className="ml-3 text-sm text-success">Guardado.</span>}
      </fieldset>

      <ErrorText error={error} />

      {confirmingDisconnect && (
        <ConfirmDialog
          title="Desconectar Mercado Pago"
          message={
            pendingCount > 0
              ? `Hay ${pendingCount} seña(s) esperando el pago. Si desconectás, la seña se desactiva y esos pagos igual se registran si entran. No se pierde ningún registro. ¿Desconectar?`
              : 'La seña se desactiva y tus reservas vuelven a entrar sin seña. El registro de las señas ya cobradas no se pierde. ¿Desconectar?'
          }
          confirmLabel="Desconectar"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmingDisconnect(false)}
        />
      )}
    </div>
  )
}
