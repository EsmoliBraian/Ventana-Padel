import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAdminAuthStore } from '@/store/adminAuthStore'
import { usePlatformAdminStore, type AdminVenue } from '@/store/platformAdminStore'
import { getPlanInfo } from '@/lib/plan'
import { fromDateKey, todayKey } from '@/lib/format'
import { venuePath } from '@/lib/venuePath'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'

const EXTEND_DAYS = 30

type PendingAction = { venue: AdminVenue; action: 'activate' | 'extend' | 'suspend' }

const CONFIRM_TEXT: Record<
  PendingAction['action'],
  { title: string; confirmLabel: string; message: (venueName: string) => string }
> = {
  activate: {
    title: 'Activar complejo',
    confirmLabel: 'Activar',
    message: (name) =>
      `¿Pasar "${name}" a plan activo? Deja de tener vencimiento. Si es la primera vez, hoy queda como inicio del pago y el precio se congela por 6 meses.`,
  },
  extend: {
    title: 'Extender prueba',
    confirmLabel: 'Extender',
    message: (name) => `¿Sumarle ${EXTEND_DAYS} días de prueba a "${name}"?`,
  },
  suspend: {
    title: 'Dar de baja',
    confirmLabel: 'Dar de baja',
    message: (name) =>
      `¿Dar de baja "${name}"? Su panel queda en solo lectura y sus reservas online se pausan. No se borra ningún dato y se puede volver a activar.`,
  },
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso?: string): string {
  if (!iso) return 'Sin actividad'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PlanBadge({ venue }: { venue: AdminVenue }) {
  if (venue.isDemo) {
    return <span className="whitespace-nowrap rounded-full bg-brand-500/20 px-2 py-0.5 text-xs font-medium text-brand-300">Demo</span>
  }
  const plan = getPlanInfo(venue)
  if (plan.state === 'active') {
    return <span className="whitespace-nowrap rounded-full bg-primary-500 px-2 py-0.5 text-xs font-medium text-gray-950">Activo</span>
  }
  if (plan.state === 'trial') {
    return (
      <span className="whitespace-nowrap rounded-full border border-info-border/40 bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
        En prueba
      </span>
    )
  }
  return (
    <span className="whitespace-nowrap rounded-full border border-danger-border/40 bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
      Vencido
    </span>
  )
}

function expiryText(venue: AdminVenue): string {
  if (venue.isDemo || venue.planStatus === 'active') return 'Sin vencimiento'
  if (venue.planStatus === 'expired') return 'Dado de baja'
  if (!venue.trialEndsAt) return '—'
  const plan = getPlanInfo(venue)
  if (plan.state === 'expired') return `Venció el ${formatDate(venue.trialEndsAt)}`
  const days = plan.daysLeft === 1 ? 'queda 1 día' : `quedan ${plan.daysLeft} días`
  return `${formatDate(venue.trialEndsAt)} (${days})`
}

// Desde cuando paga y hasta cuando tiene el precio congelado. Solo hay dato
// para los complejos que se activaron alguna vez.
function BillingCell({ venue }: { venue: AdminVenue }) {
  if (venue.isDemo || !venue.paidSince) return <span className="text-gray-500">—</span>
  const frozenOver = venue.priceFrozenUntil ? venue.priceFrozenUntil < todayKey() : false
  return (
    <>
      <span className="block whitespace-nowrap">Paga desde el {formatDate(venue.paidSince)}</span>
      {venue.priceFrozenUntil && (
        <span className={`block whitespace-nowrap text-xs ${frozenOver ? 'text-warning' : 'text-gray-500'}`}>
          Precio congelado hasta el{' '}
          {fromDateKey(venue.priceFrozenUntil).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          {frozenOver && ' (ya venció)'}
        </span>
      )}
    </>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-gray-400">
      <p className="text-lg text-gray-200">No encontramos esta página</p>
    </div>
  )
}

// Solo para administradores de la plataforma (tabla platform_admins). A
// cualquier otro usuario se le muestra "no encontrada": la base tampoco le
// devuelve nada.
export function SuperadminPage() {
  const authInitialized = useAdminAuthStore((s) => s.initialized)
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const userId = useAdminAuthStore((s) => s.session?.user.id)
  const logout = useAdminAuthStore((s) => s.logout)
  const isAdmin = usePlatformAdminStore((s) => s.isAdmin)
  const venues = usePlatformAdminStore((s) => s.venues)
  const loading = usePlatformAdminStore((s) => s.loading)

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    usePlatformAdminStore.getState().reset()
    usePlatformAdminStore.getState().checkAdmin(userId)
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!isAdmin) return
    document.title = 'Superadmin'
    usePlatformAdminStore.getState().fetchVenues().then(setError)
  }, [isAdmin])

  if (!authInitialized) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">Cargando...</div>
  }
  if (!isAuthenticated) return <Navigate to="/admin/login?next=/superadmin" replace />
  if (isAdmin === null) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">Cargando...</div>
  }
  if (!isAdmin) return <NotFound />

  async function handleConfirm() {
    if (!pending) return
    const store = usePlatformAdminStore.getState()
    let actionError: string | null
    if (pending.action === 'activate') actionError = await store.activateVenue(pending.venue.id)
    else if (pending.action === 'extend') actionError = await store.extendTrial(pending.venue.id, EXTEND_DAYS)
    else actionError = await store.suspendVenue(pending.venue.id)
    setError(actionError)
    setPending(null)
  }

  const realVenues = venues.filter((v) => !v.isDemo)
  const trialCount = realVenues.filter((v) => getPlanInfo(v).state === 'trial').length
  const activeCount = realVenues.filter((v) => getPlanInfo(v).state === 'active').length
  const expiredCount = realVenues.filter((v) => getPlanInfo(v).state === 'expired').length

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-50">Complejos</h1>
          <p className="text-sm text-gray-400">
            {realVenues.length} en total · {trialCount} en prueba · {activeCount} activos ·{' '}
            {expiredCount} vencidos
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          Cerrar sesión
        </button>
      </div>

      <ErrorText error={error} />

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400">
              <th className="px-4 py-3 font-semibold">Complejo</th>
              <th className="px-4 py-3 font-semibold">Alta</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Vencimiento</th>
              <th className="px-4 py-3 font-semibold">Pago</th>
              <th className="px-4 py-3 font-semibold">Dueño</th>
              <th className="px-4 py-3 text-right font-semibold">Reservas</th>
              <th className="px-4 py-3 font-semibold">Última actividad</th>
              <th className="px-4 py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {venues.map((venue) => (
              <tr key={venue.id} className="border-t border-gray-800/60 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-100">{venue.venueName}</p>
                  <Link
                    to={venuePath(venue.slug)}
                    target="_blank"
                    className="text-xs text-primary-500 hover:underline"
                  >
                    /{venue.slug}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-300">{formatDate(venue.createdAt)}</td>
                <td className="px-4 py-3">
                  <PlanBadge venue={venue} />
                </td>
                <td className="px-4 py-3 text-gray-300">{expiryText(venue)}</td>
                <td className="px-4 py-3 text-gray-300">
                  <BillingCell venue={venue} />
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {venue.ownerName ?? '—'}
                  {venue.ownerWhatsapp && (
                    <a
                      href={buildWhatsAppLink(venue.ownerWhatsapp, `Hola ${venue.ownerName ?? ''}!`)}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-primary-500 hover:underline"
                    >
                      WhatsApp {venue.ownerWhatsapp}
                    </a>
                  )}
                  {venue.ownerEmail && <span className="block text-xs text-gray-500">{venue.ownerEmail}</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">{venue.reservationsCount}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-300">
                  {formatDateTime(venue.lastActivityAt)}
                </td>
                <td className="px-4 py-3">
                  {!venue.isDemo && (
                    <div className="flex flex-wrap gap-2">
                      {venue.planStatus !== 'active' && (
                        <button
                          type="button"
                          onClick={() => setPending({ venue, action: 'activate' })}
                          className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-gray-950 hover:bg-primary-400"
                        >
                          Activar
                        </button>
                      )}
                      {venue.planStatus !== 'active' && (
                        <button
                          type="button"
                          onClick={() => setPending({ venue, action: 'extend' })}
                          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"
                        >
                          +{EXTEND_DAYS} días de prueba
                        </button>
                      )}
                      {getPlanInfo(venue).state !== 'expired' && (
                        <button
                          type="button"
                          onClick={() => setPending({ venue, action: 'suspend' })}
                          className="rounded-lg border border-danger-border/60 px-3 py-1.5 text-xs text-danger hover:bg-danger-bg"
                        >
                          Dar de baja
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {venues.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  {loading ? 'Cargando...' : 'Todavía no hay complejos.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title={CONFIRM_TEXT[pending.action].title}
          message={CONFIRM_TEXT[pending.action].message(pending.venue.venueName)}
          confirmLabel={CONFIRM_TEXT[pending.action].confirmLabel}
          danger={pending.action === 'suspend'}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
