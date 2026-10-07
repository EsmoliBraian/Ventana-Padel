import { useMemo, useState } from 'react'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorText } from '@/components/ErrorText'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { generateTimeLabels } from '@/lib/timeSlots'
import { formatCurrency, todayKey } from '@/lib/format'
import { SPORTS } from '@/lib/sports'
import type { Court, ReservationStatus, Sport } from '@/types'

const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
]

function TurnosFijosPanel() {
  const courts = useCourtsStore((s) => s.courts)
  const settings = useSettingsStore()
  const fixedSlots = useFixedSlotsStore((s) => s.fixedSlots)
  const addFixedSlot = useFixedSlotsStore((s) => s.addFixedSlot)
  const deleteFixedSlot = useFixedSlotsStore((s) => s.deleteFixedSlot)

  const times = generateTimeLabels(settings)

  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState(times[0] ?? '')
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const canAdd = courtId !== '' && time !== ''

  const sortedFixedSlots = useMemo(
    () => [...fixedSlots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)),
    [fixedSlots],
  )

  function courtName(id: string) {
    return courts.find((c) => c.id === id)?.name ?? id
  }

  async function handleAdd() {
    if (!canAdd) return
    setAdding(true)
    const addError = await addFixedSlot({
      courtId,
      weekday,
      time: time || (times[0] ?? ''),
      customerName: customerName.trim(),
    })
    setAdding(false)
    if (addError) {
      setError(addError)
      return
    }
    setError(null)
    setCustomerName('')
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    setConfirmingDeleteId(null)
    const deleteError = await deleteFixedSlot(id)
    if (deleteError) setError(deleteError)
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-sm font-medium text-gray-300">Turnos fijos</p>
      <p className="text-xs text-gray-500">
        Un turno fijo queda reservado todas las semanas ese día y horario hasta que lo canceles.
      </p>

      <div className="space-y-2">
        {sortedFixedSlots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-925 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="text-gray-100">
                {WEEKDAY_LABELS[slot.weekday]} {slot.time} — {courtName(slot.courtId)}
              </p>
              {slot.customerName && (
                <p className="truncate text-xs text-gray-500">{slot.customerName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmingDeleteId(slot.id)}
              aria-label="Cancelar turno fijo"
              className="shrink-0 text-gray-400 hover:text-danger"
            >
              <i className="fa-solid fa-trash" />
            </button>
          </div>
        ))}
        {fixedSlots.length === 0 && (
          <p className="text-sm text-gray-500">No hay turnos fijos cargados.</p>
        )}
      </div>

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          + Crear turno fijo
        </button>
      )}

      {showForm && (
      <>
      <div className="grid grid-cols-2 gap-2 border-t border-gray-800 pt-3 sm:grid-cols-4">
        <select
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
          className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1.5 text-sm text-gray-100"
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1.5 text-sm text-gray-100"
        >
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={courtId}
          onChange={(e) => setCourtId(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1.5 text-sm text-gray-100"
        >
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Cliente (opcional)"
          className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1.5 text-sm text-gray-100"
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd || adding}
        className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
      >
        Guardar turno fijo
      </button>
      <button
        type="button"
        onClick={() => {
          setShowForm(false)
          setError(null)
        }}
        className="ml-2 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
      >
        Cancelar
      </button>
      </>
      )}

      <ErrorText error={error} />

      {confirmingDeleteId && (
        <ConfirmDialog
          title="Cancelar turno fijo"
          message="¿Cancelar este turno fijo? El horario queda libre desde la próxima semana."
          confirmLabel="Cancelar turno"
          onConfirm={() => handleDelete(confirmingDeleteId)}
          onCancel={() => setConfirmingDeleteId(null)}
        />
      )}
    </div>
  )
}

function DuracionTurnoPanel() {
  const slotDurationMinutes = useSettingsStore((s) => s.slotDurationMinutes)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  // Se guarda como texto para poder borrar el campo y escribir el numero.
  const [durationText, setDurationText] = useState(String(slotDurationMinutes))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const duration = Number(durationText)
  const valid = durationText !== '' && duration >= 15 && duration <= 240
  const dirty = duration !== slotDurationMinutes

  async function handleSave() {
    if (!valid) {
      setError('Poné una duración de entre 15 y 240 minutos.')
      return
    }
    setSaving(true)
    const saveError = await updateSettings({ slotDurationMinutes: duration })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-sm font-medium text-gray-300">Duración de turno</p>
      <label className="block text-sm text-gray-400">
        Minutos por turno
        <input
          value={durationText}
          onChange={(e) => setDurationText(e.target.value.replace(/\D/g, '').slice(0, 3))}
          inputMode="numeric"
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
        />
      </label>

      <ErrorText error={error} />

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || durationText === '' || saving}
        className="mt-3 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
      {saved && <p className="mt-2 text-sm text-success">Guardado.</p>}
    </div>
  )
}

function CanchaRow({ court }: { court: Court }) {
  const updateCourt = useCourtsStore((s) => s.updateCourt)
  const deleteCourt = useCourtsStore((s) => s.deleteCourt)

  const [name, setName] = useState(court.name)
  const [priceText, setPriceText] = useState(String(court.price))
  const price = Number(priceText)
  const [sport, setSport] = useState<Sport>(court.sport)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = name !== court.name || price !== court.price || sport !== court.sport

  async function handleSave() {
    setSaving(true)
    const saveError = await updateCourt(court.id, { name, price, sport })
    setSaving(false)
    setError(saveError)
  }

  async function handleDelete() {
    const deleteError = await deleteCourt(court.id)
    if (deleteError) setError(deleteError)
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:flex-1"
        />
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value as Sport)}
          aria-label="Deporte"
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:w-32"
        >
          {SPORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          value={priceText}
          onChange={(e) => setPriceText(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          aria-label="Precio por turno"
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:w-32"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || priceText === '' || saving}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
          >
            {saving ? '...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-danger hover:underline"
          >
            Eliminar
          </button>
        </div>
      </div>
      <ErrorText error={error} />
    </div>
  )
}

function CanchasPanel() {
  const courts = useCourtsStore((s) => s.courts)
  const addCourt = useCourtsStore((s) => s.addCourt)

  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  // Por defecto, el deporte de la ultima cancha cargada.
  const [newSport, setNewSport] = useState<Sport>(courts[courts.length - 1]?.sport ?? 'padel')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const canAdd = newName.trim() !== '' && Number(newPrice) > 0

  async function handleAdd() {
    if (!canAdd) return
    setAdding(true)
    const addError = await addCourt(newName.trim(), Number(newPrice), newSport)
    setAdding(false)
    if (addError) {
      setError(addError)
      return
    }
    setError(null)
    setNewName('')
    setNewPrice('')
    setShowForm(false)
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-sm font-medium text-gray-300">Canchas</p>
      <p className="text-xs text-gray-500">Cada cancha tiene su deporte y su precio por turno.</p>

      <div className="space-y-3">
        {courts.map((court) => (
          <CanchaRow key={court.id} court={court} />
        ))}
        {courts.length === 0 && <p className="text-sm text-gray-500">No hay canchas cargadas.</p>}
      </div>

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          + Crear cancha
        </button>
      )}

      {showForm && (
      <div className="flex flex-col gap-2 border-t border-gray-800 pt-3 sm:flex-row sm:items-center">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la cancha"
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:flex-1"
        />
        <select
          value={newSport}
          onChange={(e) => setNewSport(e.target.value as Sport)}
          aria-label="Deporte de la cancha nueva"
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:w-32"
        >
          {SPORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="Precio"
          className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100 sm:w-32"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd || adding}
          className="w-full rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50 sm:w-auto"
        >
          Guardar cancha
        </button>
        <button
          type="button"
          onClick={() => {
            setShowForm(false)
            setError(null)
          }}
          className="w-full rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 sm:w-auto"
        >
          Cancelar
        </button>
      </div>
      )}
      <ErrorText error={error} />
    </div>
  )
}

export function Reservas() {
  const courts = useCourtsStore((s) => s.courts)
  const reservations = useReservationsStore((s) => s.reservations)
  const updateStatus = useReservationsStore((s) => s.updateStatus)
  const deleteReservation = useReservationsStore((s) => s.deleteReservation)

  const [dateFilter, setDateFilter] = useState(todayKey())
  const [courtFilter, setCourtFilter] = useState('all')

  const filtered = useMemo(
    () =>
      reservations
        .filter((r) => (dateFilter ? r.date === dateFilter : true))
        .filter((r) => (courtFilter === 'all' ? true : r.courtId === courtFilter))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [reservations, dateFilter, courtFilter],
  )

  function courtName(courtId: string) {
    return courts.find((c) => c.id === courtId)?.name ?? courtId
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-50">Reservas</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DuracionTurnoPanel />
        <CanchasPanel />
      </div>

      <TurnosFijosPanel />

      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
        />
        <select
          value={courtFilter}
          onChange={(e) => setCourtFilter(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
        >
          <option value="all">Todas las canchas</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-500">
              <th className="p-3">Hora</th>
              <th className="p-3">Cancha</th>
              <th className="p-3">Jugadores</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Total</th>
              <th className="p-3">Estado</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-800 last:border-0">
                <td className="p-3 text-gray-100">{r.time}</td>
                <td className="p-3 text-gray-300">{courtName(r.courtId)}</td>
                <td className="p-3 text-gray-300">{r.players}</td>
                <td className="p-3 text-gray-300">{r.customerName ?? '-'}</td>
                <td className="p-3 text-gray-300">{formatCurrency(r.priceTotal)}</td>
                <td className="p-3">
                  <select
                    value={r.status}
                    onChange={(e) => updateStatus(r.id, e.target.value as ReservationStatus)}
                    className="rounded-lg border border-gray-700 bg-gray-925 px-2 py-1 text-xs text-gray-100"
                  >
                    <option value="reservado">Reservado</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => deleteReservation(r.id)}
                    className="text-xs text-danger hover:underline"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  No hay reservas para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-gray-500">
        <span>{filtered.length} reserva(s) —</span>
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status="reservado" /> pendientes de confirmar por el cliente,
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status="confirmado" /> confirmadas.
        </span>
      </div>
    </div>
  )
}
