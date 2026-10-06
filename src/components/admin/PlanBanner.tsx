import { useSettingsStore } from '@/store/settingsStore'
import { buildContractLink, getPlanInfo } from '@/lib/plan'

function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 1) return 'Tu prueba gratis termina hoy.'
  return `Te quedan ${daysLeft} días de prueba gratis.`
}

// Cartel fijo arriba del panel mientras el complejo esta en prueba o con la
// prueba vencida. Con el plan activo no se muestra nada.
export function PlanBanner() {
  const planStatus = useSettingsStore((s) => s.planStatus)
  const trialEndsAt = useSettingsStore((s) => s.trialEndsAt)
  const venueName = useSettingsStore((s) => s.venueName)

  const plan = getPlanInfo({ planStatus, trialEndsAt })
  if (plan.state === 'active') return null

  const contractLink = buildContractLink(venueName)
  const expired = plan.state === 'expired'

  return (
    <div
      role="status"
      className={`mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        expired ? 'border-danger-border bg-danger-bg' : 'border-info-border bg-info-bg'
      }`}
    >
      <div className="text-sm">
        {expired ? (
          <>
            <p className="font-medium text-danger">Tu prueba gratis terminó</p>
            <p className="mt-1 text-gray-300">
              El panel quedó en solo lectura y las reservas online están en pausa. No se borró
              nada: cuando contratás, todo vuelve a funcionar como estaba.
            </p>
          </>
        ) : (
          <p className="font-medium text-info">{daysLeftText(plan.daysLeft)}</p>
        )}
      </div>
      {contractLink && (
        <a
          href={contractLink}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg bg-primary-500 px-4 py-2 text-center text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          Contratar
        </a>
      )}
    </div>
  )
}
