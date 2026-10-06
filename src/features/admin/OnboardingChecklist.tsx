import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { publicVenueUrl } from '@/lib/venuePath'

// Lista de primeros pasos del Dashboard. Los tres primeros se tildan cuando
// el dueño hace la accion (se guarda en settings.onboarding); el ultimo sale
// de los datos: alcanza con que exista una reserva hecha desde el sitio.
export function OnboardingChecklist() {
  const onboarding = useSettingsStore((s) => s.onboarding)
  const slug = useSettingsStore((s) => s.slug)
  const markOnboardingStep = useSettingsStore((s) => s.markOnboardingStep)
  const hasPublicReservation = useReservationsStore((s) =>
    s.reservations.some((r) => r.createdVia === 'user'),
  )
  const [linkCopied, setLinkCopied] = useState(false)

  if (onboarding.dismissed) return null

  const bookingLink = publicVenueUrl(slug)

  async function handleCopyLink() {
    await navigator.clipboard.writeText(bookingLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    markOnboardingStep('link')
  }

  const steps = [
    {
      done: !!onboarding.courts,
      title: 'Cargá tus canchas y precios',
      detail: 'Te dejamos canchas de ejemplo: ponéles tu nombre y tu precio.',
      action: (
        <Link to="/admin/reservas" className="text-primary-500 hover:underline">
          Ir a Reservas
        </Link>
      ),
    },
    {
      done: !!onboarding.hours,
      title: 'Revisá tus horarios',
      detail: 'Arrancás de 8 a 23 hs. Ajustalo y marcá los días que cerrás.',
      action: (
        <Link to="/admin/horarios" className="text-primary-500 hover:underline">
          Ir a Horarios
        </Link>
      ),
    },
    {
      done: !!onboarding.link,
      title: 'Compartí tu link de reservas',
      detail: bookingLink,
      action: (
        <button type="button" onClick={handleCopyLink} className="text-primary-500 hover:underline">
          {linkCopied ? '¡Copiado!' : 'Copiar link'}
        </button>
      ),
    },
    {
      done: hasPublicReservation,
      title: 'Recibí tu primera reserva',
      detail: 'Aparece acá apenas alguien reserve desde tu link.',
      action: null,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-100">
            {allDone ? '¡Listo! Tu complejo ya está funcionando' : 'Primeros pasos'}
          </p>
          <p className="text-xs text-gray-500">
            {doneCount} de {steps.length} completados
          </p>
        </div>
        <button
          type="button"
          onClick={() => markOnboardingStep('dismissed')}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-200"
        >
          Ocultar
        </button>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                step.done
                  ? 'border-success bg-success text-gray-950'
                  : 'border-gray-700 text-transparent'
              }`}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className={step.done ? 'text-gray-500 line-through' : 'text-gray-100'}>
                {step.title}
                <span className="sr-only">{step.done ? ' (hecho)' : ' (pendiente)'}</span>
              </p>
              {!step.done && (
                <p className="break-all text-xs text-gray-500">
                  {step.detail}
                  {step.action && <span className="ml-2 whitespace-nowrap">{step.action}</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
