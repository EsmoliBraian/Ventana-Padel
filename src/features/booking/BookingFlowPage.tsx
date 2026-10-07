import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { SLOT_TAKEN_MESSAGE, useReservationsStore } from '@/store/reservationsStore'
import { useClosedDatesStore } from '@/store/closedDatesStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { getCourtTimeSlots } from '@/lib/availability'
import { formatCurrency, formatLongDate, fromDateKey, nextDays, toDateKey, weekdayShort } from '@/lib/format'
import { buildReservationMessage, buildWhatsAppLink } from '@/lib/whatsapp'
import { getPlanInfo } from '@/lib/plan'
import { defaultPlayers, sportLabel, venueSports } from '@/lib/sports'
import { ErrorText } from '@/components/ErrorText'
import { AdSlot } from '@/components/site/ads/AdSlot'
import type { Court, Sport } from '@/types'

type Step = 'slot' | 'summary' | 'confirm'

interface SelectedSlot {
  time: string
  court: Court
}

export function BookingFlowPage() {
  const settings = useSettingsStore()
  const courts = useCourtsStore((s) => s.courts)
  const reservations = useReservationsStore((s) => s.reservations)
  const addReservation = useReservationsStore((s) => s.addReservation)
  const closedDates = useClosedDatesStore((s) => s.closedDates)
  const fixedSlots = useFixedSlotsStore((s) => s.fixedSlots)

  const days = useMemo(() => nextDays(5), [])
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(days[0]))
  const [selectedCourtId, setSelectedCourtId] = useState(() => courts[0]?.id ?? '')
  const [step, setStep] = useState<Step>('slot')
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Con mas de un deporte, primero se elige deporte y despues cancha.
  const sports = useMemo(() => venueSports(courts), [courts])
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null)
  const activeSport = selectedSport ?? sports[0]
  const sportCourts = sports.length > 1 ? courts.filter((c) => c.sport === activeSport) : courts
  const selectedCourt = sportCourts.find((c) => c.id === selectedCourtId) ?? sportCourts[0]

  const isClosed = closedDates.some((c) => c.date === selectedDate)
  const timeSlots = useMemo(
    () =>
      selectedCourt
        ? getCourtTimeSlots(
            settings,
            selectedCourt,
            reservations,
            selectedDate,
            closedDates,
            fixedSlots,
          )
        : [],
    [settings, selectedCourt, reservations, selectedDate, closedDates, fixedSlots],
  )

  const total = selectedSlot ? selectedSlot.court.price : 0

  function handlePickSlot(time: string) {
    if (!selectedCourt) return
    setError(null)
    setSelectedSlot({ time, court: selectedCourt })
    setStep('summary')
  }

  async function handleConfirmReservation() {
    if (!selectedSlot) return
    // En el complejo demo el recorrido es completo pero la reserva no se
    // guarda (la base tampoco la acepta).
    if (settings.isDemo) {
      setStep('confirm')
      return
    }
    setSubmitting(true)
    const reservationError = await addReservation({
      courtId: selectedSlot.court.id,
      date: selectedDate,
      time: selectedSlot.time,
      players: defaultPlayers(selectedSlot.court.sport),
      status: 'reservado',
      createdVia: 'user',
      priceTotal: total,
    })
    setSubmitting(false)
    if (reservationError === SLOT_TAKEN_MESSAGE) {
      // Lo reservaron recien: se vuelve a la grilla, ya actualizada.
      setError('Ese horario se acaba de ocupar. Elegí otro.')
      setSelectedSlot(null)
      setStep('slot')
      return
    }
    if (reservationError) {
      setError('No pudimos guardar tu reserva. Probá de nuevo en un momento.')
      return
    }
    setError(null)
    setStep('confirm')
  }

  function handleWhatsAppRedirect() {
    if (!selectedSlot) return
    const message = buildReservationMessage({
      date: selectedDate,
      time: selectedSlot.time,
      courtName: selectedSlot.court.name,
    })
    window.open(buildWhatsAppLink(settings.whatsappPhone, message), '_blank')
  }

  // Con la prueba vencida el complejo no toma reservas online (la base
  // tambien las rechaza). Se avisa antes de mostrar horarios.
  if (getPlanInfo(settings).state === 'expired') {
    const contactLink = settings.whatsappPhone
      ? buildWhatsAppLink(settings.whatsappPhone, `Hola! Quiero reservar en ${settings.venueName}.`)
      : null
    return (
      <div className="mx-auto flex max-w-xl flex-col px-5 py-14 sm:py-20">
        <h1 className="mb-3 text-2xl font-semibold text-gray-50 sm:text-3xl">
          Reservas online en pausa
        </h1>
        <p className="text-sm text-gray-400">
          {settings.venueName} no está tomando reservas online por el momento.
          {contactLink ? ' Para reservar, escribile al complejo por WhatsApp.' : ''}
        </p>
        {contactLink && (
          <a
            href={contactLink}
            target="_blank"
            rel="noreferrer"
            className="mt-6 rounded-lg bg-success py-3 text-center font-medium text-gray-950 hover:bg-success/90"
          >
            Escribir por WhatsApp
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col px-5 py-14 sm:py-20">
      {step === 'slot' && (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary-500">
            Reservar
          </p>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">Elegí fecha</h1>
          <div className="mb-4 flex gap-2">
            {days.map((d) => {
              const key = toDateKey(d)
              const active = key === selectedDate
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`flex flex-1 flex-col items-center rounded-lg border py-2 text-xs ${
                    active
                      ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                      : 'border-gray-800 text-gray-400'
                  }`}
                >
                  <span>{weekdayShort(d)}</span>
                  <span className="text-sm font-semibold">{d.getDate()}</span>
                </button>
              )
            })}
          </div>

          {sports.length > 1 && (
            <>
              <h2 className="mb-2 text-sm font-medium text-gray-300">Deporte</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {sports.map((sport) => {
                  const active = sport === activeSport
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setSelectedSport(sport)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        active
                          ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                          : 'border-gray-800 text-gray-400'
                      }`}
                    >
                      {sportLabel(sport)}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {sportCourts.length > 1 && (
            <>
              <h2 className="mb-2 text-sm font-medium text-gray-300">Cancha</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {sportCourts.map((c) => {
                  const active = c.id === selectedCourt?.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCourtId(c.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        active
                          ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                          : 'border-gray-800 text-gray-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <h2 className="mb-2 text-sm font-medium text-gray-300">Horarios disponibles</h2>
          <ErrorText error={error} />
          <div className="space-y-2">
            {timeSlots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                disabled={!slot.available}
                onClick={() => handlePickSlot(slot.time)}
                className={`w-full rounded-lg border py-3 text-sm ${
                  slot.available
                    ? 'border-gray-800 bg-gray-900 text-gray-100 hover:border-primary-500'
                    : 'cursor-not-allowed border-gray-800 bg-gray-900/40 text-gray-600'
                }`}
              >
                {slot.time}
                {!slot.available && <span className="ml-2 text-xs">Reservado</span>}
              </button>
            ))}
            {timeSlots.length === 0 && (
              <p className="text-sm text-gray-500">
                {isClosed ? 'Cerrado ese día.' : 'No hay horarios disponibles para este día.'}
              </p>
            )}
          </div>
        </>
      )}

      {step === 'summary' && selectedSlot && (
        <>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">Tu reserva</h1>
          <div className="mb-4 space-y-1 rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm">
            <p className="text-gray-400">
              Fecha <span className="float-right text-gray-100">{formatLongDate(fromDateKey(selectedDate))}</span>
            </p>
            <p className="text-gray-400">
              Horario <span className="float-right text-gray-100">{selectedSlot.time} hs</span>
            </p>
            <p className="text-gray-400">
              Cancha <span className="float-right text-gray-100">{selectedSlot.court.name}</span>
            </p>
          </div>

          <p className="mb-4 text-sm text-gray-400">
            Precio total
            <span className="ml-2 text-lg font-semibold text-gray-50">
              {formatCurrency(total)}
            </span>
          </p>

          <button
            type="button"
            onClick={handleConfirmReservation}
            disabled={submitting}
            className="rounded-lg bg-primary-500 py-3 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-60"
          >
            {submitting ? 'RESERVANDO...' : 'RESERVAR Y CONFIRMAR'}
          </button>
          <div className="mt-2">
            <ErrorText error={error} />
          </div>
        </>
      )}

      {step === 'confirm' && selectedSlot && settings.isDemo && (
        <>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">
            Así de simple reservan tus clientes
          </h1>
          <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-4 text-sm text-gray-200">
            <p className="mb-2 font-medium text-success">
              En un complejo real, acá se abre WhatsApp con el mensaje ya escrito.
            </p>
            <p className="text-gray-400">
              El turno queda tomado en la grilla y al complejo le llega la fecha, el horario y la
              cancha. Como esto es una demo, la reserva no se guardó.
            </p>
          </div>

          <Link
            to="/admin/signup"
            className="rounded-lg bg-primary-500 py-3 text-center font-medium text-gray-950 hover:bg-primary-400"
          >
            Crear mi complejo gratis
          </Link>
          <button
            type="button"
            onClick={() => {
              setSelectedSlot(null)
              setStep('slot')
            }}
            className="mt-3 text-sm text-gray-400 hover:text-gray-200"
          >
            Volver a probar
          </button>
          <AdSlot placement="despues_de_reservar" className="mt-10" />
        </>
      )}

      {step === 'confirm' && selectedSlot && !settings.isDemo && (
        <>
          <h1 className="mb-6 text-2xl font-semibold text-gray-50 sm:text-3xl">
            Confirmá tu reserva
          </h1>
          <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-4 text-sm text-gray-200">
            <p className="mb-2 font-medium text-success">
              Serás redirigido a WhatsApp para confirmar tu reserva con la cancha.
            </p>
            <p className="text-gray-400">Tu mensaje incluirá:</p>
            <ul className="mt-1 list-disc pl-5 text-gray-300">
              <li>Fecha y horario</li>
              <li>Cancha</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleWhatsAppRedirect}
            className="rounded-lg bg-success py-3 font-medium text-gray-950 hover:bg-success/90"
          >
            CONTINUAR A WHATSAPP
          </button>
          <AdSlot placement="despues_de_reservar" className="mt-10" />
        </>
      )}
    </div>
  )
}
