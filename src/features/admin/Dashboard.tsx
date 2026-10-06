import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useSalesStore } from '@/store/salesStore'
import { useClosedDatesStore } from '@/store/closedDatesStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { getAvailableSlots } from '@/lib/availability'
import { generateTimeLabels } from '@/lib/timeSlots'
import { reservationIdsWithAbsorbedFee } from '@/lib/salesRevenue'
import { formatCurrency, formatLongDate, fromDateKey, todayKey, toDateKey } from '@/lib/format'
import { KpiCard } from '@/components/KpiCard'
import { StatusBadge } from '@/components/StatusBadge'
import { NuevaReservaModal } from './NuevaReservaModal'
import { FiadoCard } from './FiadoCard'
import { OnboardingChecklist } from './OnboardingChecklist'

export function Dashboard() {
  const settings = useSettingsStore()
  const courts = useCourtsStore((s) => s.courts)
  const reservations = useReservationsStore((s) => s.reservations)
  const sales = useSalesStore((s) => s.sales)
  const closedDates = useClosedDatesStore((s) => s.closedDates)
  const fixedSlots = useFixedSlotsStore((s) => s.fixedSlots)

  const [showModal, setShowModal] = useState(false)
  const [gridDate, setGridDate] = useState(todayKey())
  const navigate = useNavigate()
  const openOrders = useMemo(() => sales.filter((s) => s.status === 'en_curso'), [sales])

  const today = todayKey()
  const todayReservations = useMemo(
    () => reservations.filter((r) => r.date === today && r.status !== 'cancelado'),
    [reservations, today],
  )
  const gridReservations = useMemo(
    () => reservations.filter((r) => r.date === gridDate && r.status !== 'cancelado'),
    [reservations, gridDate],
  )
  // Solo ventas cerradas: los pedidos en curso todavia no son una venta.
  const todaySales = useMemo(
    () => sales.filter((s) => s.date === today && s.status === 'cerrada'),
    [sales, today],
  )
  const feeAbsorbedReservationIds = useMemo(() => reservationIdsWithAbsorbedFee(sales), [sales])

  const ingresosHoy =
    todayReservations
      .filter((r) => !feeAbsorbedReservationIds.has(r.id))
      .reduce((sum, r) => sum + r.priceTotal, 0) +
    todaySales
      .filter((s) => s.paymentStatus === 'pagado')
      .reduce((sum, s) => sum + s.total, 0)
  const productosVendidosHoy = todaySales.reduce(
    (sum, s) => sum + s.items.reduce((itemSum, item) => itemSum + item.qty, 0),
    0,
  )
  function shiftGridDate(days: number) {
    const d = fromDateKey(gridDate)
    d.setDate(d.getDate() + days)
    setGridDate(toDateKey(d))
  }

  const turnosDisponiblesHoy = getAvailableSlots(
    settings,
    courts,
    reservations,
    today,
    closedDates,
    fixedSlots,
  ).length

  const times = generateTimeLabels(settings)
  const gridWeekday = fromDateKey(gridDate).getDay()
  const gridFixedSlots = useMemo(
    () => fixedSlots.filter((f) => f.weekday === gridWeekday),
    [fixedSlots, gridWeekday],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-50">Dashboard</h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          + Nueva reserva
        </button>
      </div>

      <OnboardingChecklist />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Reservas hoy"
          value={String(todayReservations.length)}
          icon="fa-calendar-check"
          accentColor="#B8FF3B"
        />
        <KpiCard
          label="Ingresos hoy"
          value={formatCurrency(ingresosHoy)}
          icon="fa-sack-dollar"
          accentColor="#B8FF3B"
        />
        <KpiCard
          label="Productos vendidos"
          value={String(productosVendidosHoy)}
          icon="fa-cart-shopping"
          accentColor="#66D18F"
        />
        <KpiCard
          label="Turnos disponibles hoy"
          value={String(turnosDisponiblesHoy)}
          icon="fa-clock"
          accentColor="#FFC857"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-300">Reservas del dia</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftGridDate(-1)}
                aria-label="Dia anterior"
                className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
              >
                &larr;
              </button>
              <input
                type="date"
                value={gridDate}
                onChange={(e) => e.target.value && setGridDate(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1 text-xs text-gray-100"
              />
              <button
                type="button"
                onClick={() => shiftGridDate(1)}
                aria-label="Dia siguiente"
                className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
              >
                &rarr;
              </button>
              {gridDate !== today && (
                <button
                  type="button"
                  onClick={() => setGridDate(today)}
                  className="rounded-lg border border-primary-500 px-2 py-1 text-xs text-primary-500 hover:bg-primary-500/10"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>
          <p className="mb-2 text-xs text-gray-500">{formatLongDate(fromDateKey(gridDate))}</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-3 pr-3 font-semibold">Hora</th>
                {courts.map((c) => (
                  <th key={c.id} className="pb-3 pr-3 font-semibold">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time) => {
                return (
                  <tr key={time} className="border-t border-gray-800/60 hover:bg-gray-800/40">
                    <td className="py-3 pr-3 text-gray-500">{time}</td>
                    {courts.map((court) => {
                      const reservation = gridReservations.find(
                        (r) => r.courtId === court.id && r.time === time,
                      )
                      const fixedSlot = gridFixedSlots.find(
                        (f) => f.courtId === court.id && f.time === time,
                      )
                      return (
                        <td key={court.id} className="py-3 pr-3">
                          {reservation ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/mostrador?turno=${reservation.id}`)}
                              className="space-y-0.5 text-left hover:opacity-80"
                              title="Abrir en el Mostrador"
                            >
                              <StatusBadge status={reservation.status} />
                              {reservation.customerName && (
                                <p className="text-gray-400">{reservation.customerName}</p>
                              )}
                            </button>
                          ) : fixedSlot ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/mostrador?fijo=${fixedSlot.id}`)}
                              className="space-y-0.5 text-left hover:opacity-80"
                              title="Abrir cuenta en el Mostrador"
                            >
                              <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-brand-300">
                                Turno fijo
                              </span>
                              {fixedSlot.customerName && (
                                <p className="text-gray-400">{fixedSlot.customerName}</p>
                              )}
                            </button>
                          ) : (
                            <span className="rounded-full bg-[#24262A] px-2 py-0.5 text-[#A7ADB6]">
                              Disponible
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm font-medium text-gray-300">Mostrador</p>
            <p className="mt-2 text-3xl font-semibold text-gray-50">{openOrders.length}</p>
            <p className="text-sm text-gray-400">
              {openOrders.length === 1 ? 'pedido en curso' : 'pedidos en curso'}
              {openOrders.length > 0 &&
                ` · ${formatCurrency(openOrders.reduce((sum, o) => sum + o.total, 0))} sin cobrar`}
            </p>
            <Link
              to="/admin/mostrador"
              className="mt-4 block rounded-lg bg-primary-500 py-2 text-center text-sm font-medium text-gray-950 hover:bg-primary-400"
            >
              Abrir el Mostrador
            </Link>
            <p className="mt-2 text-xs text-gray-500">
              Para abrir la cuenta de un turno, tocalo en la grilla de reservas.
            </p>
          </div>
        </div>
      </div>

      <FiadoCard />

      {showModal && <NuevaReservaModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
