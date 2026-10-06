import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { ErrorText } from '@/components/ErrorText'
import { generateTimeLabels } from '@/lib/timeSlots'
import type { ReservationStatus } from '@/types'
import { todayKey } from '@/lib/format'
import { defaultPlayers } from '@/lib/sports'

export function NuevaReservaModal({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore()
  const courts = useCourtsStore((s) => s.courts)
  const addReservation = useReservationsStore((s) => s.addReservation)

  const times = generateTimeLabels(settings)

  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState(times[0] ?? '')
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  const [status, setStatus] = useState<ReservationStatus>('confirmado')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedCourt = courts.find((c) => c.id === courtId)

  async function handleSubmit() {
    if (!courtId || !selectedCourt) return
    setSaving(true)
    const priceTotal = selectedCourt.price
    const saveError = await addReservation({
      courtId,
      date,
      time,
      players: defaultPlayers(selectedCourt.sport),
      status,
      customerName: customerName || undefined,
      createdVia: 'admin',
      priceTotal,
    })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onClose()
  }

  return (
    <Modal title="Nueva reserva" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block text-gray-400">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <label className="block text-gray-400">
          Horario
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            {times.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-gray-400">
          Cancha
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-gray-400">
          Cliente (opcional)
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <label className="block text-gray-400">
          Estado
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ReservationStatus)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            <option value="reservado">Reservado</option>
            <option value="confirmado">Confirmado</option>
          </select>
        </label>

        <ErrorText error={error} />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar reserva'}
        </button>
      </div>
    </Modal>
  )
}
