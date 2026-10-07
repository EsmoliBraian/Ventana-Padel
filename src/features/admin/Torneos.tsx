import { useState } from 'react'
import { useTournamentsStore } from '@/store/tournamentsStore'
import { todayKey } from '@/lib/format'
import { uploadImage } from '@/lib/storage'
import { ErrorText } from '@/components/ErrorText'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { Tournament } from '@/types'

function TournamentCard({ tournament, startEditing }: { tournament: Tournament; startEditing: boolean }) {
  const updateTournament = useTournamentsStore((s) => s.updateTournament)
  const deleteTournament = useTournamentsStore((s) => s.deleteTournament)

  const [editing, setEditing] = useState(startEditing)
  const [name, setName] = useState(tournament.name)
  const [date, setDate] = useState(tournament.date)
  const [description, setDescription] = useState(tournament.description)
  const [imageUrl, setImageUrl] = useState(tournament.imageUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dirty =
    name !== tournament.name ||
    date !== tournament.date ||
    description !== tournament.description ||
    imageUrl !== (tournament.imageUrl ?? '')

  function handleEdit() {
    setName(tournament.name)
    setDate(tournament.date)
    setDescription(tournament.description)
    setImageUrl(tournament.imageUrl ?? '')
    setError(null)
    setEditing(true)
  }

  function handleCancel() {
    setName(tournament.name)
    setDate(tournament.date)
    setDescription(tournament.description)
    setImageUrl(tournament.imageUrl ?? '')
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    const saveError = await updateTournament(tournament.id, { name, date, description, imageUrl })
    setSaving(false)
    setError(saveError)
    if (!saveError) setEditing(false)
  }

  async function handlePublishToggle() {
    setError(await updateTournament(tournament.id, { published: !tournament.published }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setImageUrl(await uploadImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false)
    setError(await deleteTournament(tournament.id))
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {tournament.imageUrl && (
              <img
                src={tournament.imageUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-gray-100">{tournament.name}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    tournament.published
                      ? 'bg-success/20 text-success'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {tournament.published ? 'Publicado' : 'Borrador'}
                </span>
              </div>
              <p className="text-xs text-gray-500">{tournament.date}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handlePublishToggle}
              aria-label={tournament.published ? 'Despublicar' : 'Publicar'}
              title={tournament.published ? 'Despublicar' : 'Publicar'}
              className="text-gray-400 hover:text-primary-500"
            >
              <i className={`fa-solid ${tournament.published ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
            <button
              type="button"
              onClick={handleEdit}
              aria-label="Editar torneo"
              title="Editar"
              className="text-gray-400 hover:text-primary-500"
            >
              <i className="fa-solid fa-pen" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Eliminar torneo"
              title="Eliminar"
              className="text-gray-400 hover:text-danger"
            >
              <i className="fa-solid fa-trash" />
            </button>
          </div>
        </div>
        <ErrorText error={error} />
        {confirmingDelete && (
          <ConfirmDialog
            title="Eliminar torneo"
            message={`¿Eliminar "${tournament.name}"? Esta accion no se puede deshacer.`}
            confirmLabel="Eliminar"
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            tournament.published ? 'bg-success/20 text-success' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {tournament.published ? 'Publicado' : 'Borrador'}
        </span>
        <button
          type="button"
          onClick={handlePublishToggle}
          className="text-xs text-primary-500 hover:underline"
        >
          {tournament.published ? 'Despublicar' : 'Publicar'}
        </button>
      </div>

      <div className="flex gap-3">
        {imageUrl && (
          <img src={imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
        )}
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-400">
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="block text-sm text-gray-400">
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="block text-sm text-gray-400 sm:col-span-2">
            Descripción
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
              rows={2}
            />
          </label>
          <label className="block text-sm text-gray-400">
            URL de imagen
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="block text-sm text-gray-400">
            O subir imagen desde la computadora
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="mt-1 w-full text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-gray-100"
            />
            {uploading && <span className="text-xs text-gray-500">Subiendo...</span>}
          </label>
        </div>
      </div>

      <ErrorText error={error} />

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label="Eliminar torneo"
          className="text-gray-400 hover:text-danger"
        >
          <i className="fa-solid fa-trash" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-gray-700 px-4 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-lg bg-primary-500 px-4 py-1.5 text-xs font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar torneo"
          message={`¿Eliminar "${tournament.name}"? Esta accion no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

export function Torneos() {
  const tournaments = useTournamentsStore((s) => s.tournaments)
  const addTournament = useTournamentsStore((s) => s.addTournament)
  const [error, setError] = useState<string | null>(null)

  const sortedTournaments = [...tournaments].sort((a, b) => a.date.localeCompare(b.date))

  // El torneo recien creado se abre directo en edicion.
  const [newId, setNewId] = useState<string | null>(null)

  async function handleAdd() {
    const before = new Set(tournaments.map((t) => t.id))
    const addError = await addTournament({
      name: 'Nuevo torneo',
      date: todayKey(),
      description: '',
      published: false,
    })
    setError(addError)
    if (addError) return
    const created = useTournamentsStore.getState().tournaments.find((t) => !before.has(t.id))
    setNewId(created?.id ?? null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-50">Torneos</h1>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          + Crear torneo
        </button>
      </div>

      <ErrorText error={error} />

      <div className="space-y-3">
        {sortedTournaments.map((t) => (
          <TournamentCard
            key={t.id === newId ? `${t.id}-nuevo` : t.id}
            tournament={t}
            startEditing={t.id === newId}
          />
        ))}
        {tournaments.length === 0 && (
          <p className="text-sm text-gray-500">No hay torneos cargados.</p>
        )}
      </div>
    </div>
  )
}
