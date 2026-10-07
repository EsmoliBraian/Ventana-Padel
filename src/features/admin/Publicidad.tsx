import { useMemo, useState } from 'react'
import { useAdsStore } from '@/store/adsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorText } from '@/components/ErrorText'
import { formatCurrency, fromDateKey } from '@/lib/format'
import { getPlanInfo } from '@/lib/plan'
import {
  AD_WARNING_DAYS,
  adAlerts,
  adFormatInfo,
  adHasNoReminder,
  adPlacement,
  adStatus,
  type AdStatus,
} from '@/lib/ads'
import { AdForm } from './AdForm'
import type { OwnerAd } from '@/types'

const STATUS_STYLE: Record<AdStatus, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'bg-success/20 text-success' },
  pausado: { label: 'Pausado', className: 'bg-gray-800 text-gray-400' },
  vencido: { label: 'Vencido', className: 'bg-danger-bg text-danger' },
  programado: { label: 'Programado', className: 'bg-info-bg text-info' },
}

function shortDate(key?: string): string {
  if (!key) return 'Sin fecha de fin'
  return fromDateKey(key).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AdRow({ ad, onEdit }: { ad: OwnerAd; onEdit: () => void }) {
  const setActive = useAdsStore((s) => s.setActive)
  const deleteAd = useAdsStore((s) => s.deleteAd)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const status = adStatus(ad)
  const style = STATUS_STYLE[status]
  const noReminder = adHasNoReminder(ad)

  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg ${
            ad.format === 'logo' ? 'bg-gray-100 p-1.5' : 'bg-gray-925'
          }`}
        >
          <img
            src={ad.imageUrl}
            alt=""
            className={ad.format === 'logo' ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-100">{ad.businessName}</p>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
          </div>
          <p className="text-xs text-gray-500">
            {adFormatInfo(ad.format).label} · {adPlacement(ad.placement)?.label ?? ad.placement}
          </p>
          <p className="text-xs text-gray-500">
            {status === 'vencido' ? 'Venció el' : 'Vence:'} {shortDate(ad.endsOn)}
            {ad.monthlyAmount > 0 && ` · ${formatCurrency(ad.monthlyAmount)} por mes`}
            {ad.nextPaymentOn && ` · próximo pago ${shortDate(ad.nextPaymentOn)}`}
          </p>
        </div>

        <dl className="flex shrink-0 gap-5 text-center">
          <div>
            <dd className="text-lg font-semibold text-gray-50">{ad.views}</dd>
            <dt className="text-xs text-gray-500">vistas</dt>
          </div>
          <div>
            <dd className="text-lg font-semibold text-gray-50">{ad.clicks}</dd>
            <dt className="text-xs text-gray-500">clics</dt>
          </div>
        </dl>

        <div className="flex shrink-0 items-center gap-3">
          {status !== 'vencido' && (
            <button
              type="button"
              onClick={async () => setError(await setActive(ad.id, !ad.active))}
              className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
            >
              {ad.active ? 'Pausar' : 'Activar'}
            </button>
          )}
          <button type="button" onClick={onEdit} aria-label={`Editar ${ad.businessName}`} title="Editar" className="text-gray-400 hover:text-primary-500">
            <i className="fa-solid fa-pen" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Eliminar ${ad.businessName}`}
            title="Eliminar"
            className="text-gray-400 hover:text-danger"
          >
            <i className="fa-solid fa-trash" />
          </button>
        </div>
      </div>

      {noReminder && (
        <p className="mt-2 text-xs text-gray-500">
          Sin fecha de fin ni de próximo pago: este anuncio no te va a avisar cuándo cobrar. Podés cargarle una desde el lápiz.
        </p>
      )}
      <ErrorText error={error} />

      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar anuncio"
          message={`¿Eliminar el anuncio de "${ad.businessName}"? Se pierden también sus vistas y clics. No se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            setConfirmingDelete(false)
            setError(await deleteAd(ad.id))
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </li>
  )
}

export function Publicidad() {
  const ads = useAdsStore((s) => s.ads)
  const planStatus = useSettingsStore((s) => s.planStatus)
  const trialEndsAt = useSettingsStore((s) => s.trialEndsAt)
  // 'new' = alta; un id = edicion de ese anuncio.
  const [editing, setEditing] = useState<string | null>(null)

  const alerts = useMemo(() => ads.flatMap((ad) => adAlerts(ad)), [ads])
  const plan = getPlanInfo({ planStatus, trialEndsAt })
  const liveCount = ads.filter((ad) => adStatus(ad) === 'activo').length
  const editingAd = editing && editing !== 'new' ? ads.find((ad) => ad.id === editing) : undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-50">Publicidad</h1>
          <p className="text-sm text-gray-500">
            Vendé espacios de tu sitio a comercios de tu zona. Aparecen solo mientras estén activos y vigentes.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
          >
            + Crear anuncio
          </button>
        )}
      </div>

      {/* La publicidad es parte del servicio: con la prueba vencida no se muestra. */}
      {plan.state === 'expired' && ads.length > 0 && (
        <p role="status" className="rounded-xl border border-danger-border bg-danger-bg p-4 text-sm text-danger">
          Tu prueba gratis terminó: tus anuncios no se están mostrando en el sitio. Vuelven a verse apenas contrates.
        </p>
      )}
      {plan.state === 'trial' && plan.daysLeft <= AD_WARNING_DAYS && liveCount > 0 && (
        <p role="status" className="rounded-xl border border-warning-border/60 bg-warning-bg p-4 text-sm text-warning">
          {plan.daysLeft <= 1 ? 'Tu prueba gratis termina hoy' : `Tu prueba gratis termina en ${plan.daysLeft} días`}: cuando termine,
          tus anuncios se van a dejar de mostrar en el sitio hasta que contrates.
        </p>
      )}

      {alerts.length > 0 && (
        <div role="status" className="rounded-xl border border-warning-border/60 bg-warning-bg p-4 text-sm">
          <p className="font-medium text-warning">Para revisar</p>
          <ul className="mt-1 space-y-0.5 text-gray-200">
            {alerts.map((alert) => (
              <li key={`${alert.adId}-${alert.kind}`}>{alert.text}</li>
            ))}
          </ul>
        </div>
      )}

      {editing !== null && <AdForm key={editing} ad={editingAd} onDone={() => setEditing(null)} />}

      <ul className="space-y-3">
        {ads
          .filter((ad) => ad.id !== editing)
          .map((ad) => (
            <AdRow key={ad.id} ad={ad} onEdit={() => setEditing(ad.id)} />
          ))}
      </ul>
      {ads.length === 0 && editing === null && (
        <p className="text-sm text-gray-500">Todavía no cargaste ningún anuncio.</p>
      )}
    </div>
  )
}
