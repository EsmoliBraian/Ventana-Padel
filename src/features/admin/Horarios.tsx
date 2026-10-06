import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { useClosedDatesStore } from '@/store/closedDatesStore'
import { ErrorText } from '@/components/ErrorText'
import { todayKey } from '@/lib/format'

export function Horarios() {
  const openHour = useSettingsStore((s) => s.openHour)
  const closeHour = useSettingsStore((s) => s.closeHour)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [open, setOpen] = useState(openHour)
  const [close, setClose] = useState(closeHour)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = open !== openHour || close !== closeHour

  // Entrar a esta pantalla cuenta como haber revisado los horarios en la
  // lista de primeros pasos (los que vienen por defecto pueden estar bien).
  useEffect(() => {
    useSettingsStore.getState().markOnboardingStep('hours')
  }, [])

  const closedDates = useClosedDatesStore((s) => s.closedDates)
  const addClosedDate = useClosedDatesStore((s) => s.addClosedDate)
  const deleteClosedDate = useClosedDatesStore((s) => s.deleteClosedDate)
  const [newClosedDate, setNewClosedDate] = useState(todayKey())
  const [newClosedReason, setNewClosedReason] = useState('')
  const [closedDateError, setClosedDateError] = useState<string | null>(null)

  async function handleSave() {
    if (open >= close) return
    setSaving(true)
    const saveError = await updateSettings({ openHour: open, closeHour: close })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAddClosedDate() {
    const error = await addClosedDate(newClosedDate, newClosedReason || undefined)
    if (error) {
      setClosedDateError(error)
      return
    }
    setClosedDateError(null)
    setNewClosedReason('')
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold text-gray-50">Horarios</h1>
      <p className="text-sm text-gray-400">
        Define el rango horario en el que se pueden reservar turnos.
      </p>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <label className="mb-3 block text-sm text-gray-400">
          Hora de apertura
          <select
            value={open}
            onChange={(e) => setOpen(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block text-sm text-gray-400">
          Hora de cierre
          <select
            value={close}
            onChange={(e) => setClose(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            {Array.from({ length: 25 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>
                {h === 24 ? '00:00 (medianoche)' : `${String(h).padStart(2, '0')}:00`}
              </option>
            ))}
          </select>
        </label>

        {open >= close && (
          <p className="mb-3 text-sm text-danger">La apertura debe ser anterior al cierre.</p>
        )}

        <ErrorText error={error} />

        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || open >= close || saving}
          className="w-full rounded-lg bg-primary-500 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>

        {saved && <p className="mt-2 text-sm text-success">Horarios actualizados.</p>}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="mb-3 text-sm font-medium text-gray-300">Dias cerrados</p>

        <div className="space-y-2">
          {closedDates.map((cd) => (
            <div key={cd.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {cd.date}
                {cd.reason && <span className="text-gray-500"> — {cd.reason}</span>}
              </span>
              <button
                type="button"
                onClick={() => deleteClosedDate(cd.id)}
                className="text-xs text-danger hover:underline"
              >
                Eliminar
              </button>
            </div>
          ))}
          {closedDates.length === 0 && (
            <p className="text-sm text-gray-500">No hay dias cerrados cargados.</p>
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
          <input
            type="date"
            value={newClosedDate}
            onChange={(e) => setNewClosedDate(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
          />
          <input
            value={newClosedReason}
            onChange={(e) => setNewClosedReason(e.target.value)}
            placeholder="Motivo (opcional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
          />
          <ErrorText error={closedDateError} />
          <button
            type="button"
            onClick={handleAddClosedDate}
            className="w-full rounded-lg bg-primary-500 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
          >
            + Agregar dia cerrado
          </button>
        </div>
      </div>
    </div>
  )
}
