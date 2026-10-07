import { useEffect, useMemo, useState } from 'react'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import { RANKING_INSTANCES, instanceLabel } from '@/lib/ranking'
import { ErrorText } from '@/components/ErrorText'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RankingCategoriesModal } from './RankingCategoriesModal'
import type { RankingEntry, RankingInstance } from '@/types'

function EditEntryModal({ entry, onClose }: { entry: RankingEntry; onClose: () => void }) {
  const updateEntry = useRankingStore((s) => s.updateEntry)
  const deleteEntry = useRankingStore((s) => s.deleteEntry)

  const [playerName, setPlayerName] = useState(entry.playerName)
  const [totalPoints, setTotalPoints] = useState(entry.totalPoints)
  const [bestInstanceValue, setBestInstanceValue] = useState<RankingInstance>(entry.bestInstance)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleSave() {
    setSaving(true)
    const saveError = await updateEntry(entry.id, {
      playerName,
      totalPoints,
      bestInstance: bestInstanceValue,
    })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onClose()
  }

  async function handleDelete() {
    const deleteError = await deleteEntry(entry.id)
    if (deleteError) {
      setConfirmingDelete(false)
      setError(deleteError)
      return
    }
    onClose()
  }

  return (
    <Modal title="Editar jugador" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block text-xs text-gray-400">
          Nombre
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-xs text-gray-400">
          Puntos totales
          <input
            type="number"
            value={totalPoints}
            onChange={(e) => setTotalPoints(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-xs text-gray-400">
          Instancia más alta
          <select
            value={bestInstanceValue}
            onChange={(e) => setBestInstanceValue(e.target.value as RankingInstance)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          >
            {RANKING_INSTANCES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>

        <ErrorText error={error} />

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-danger hover:underline"
          >
            Eliminar del ranking
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary-500 px-4 py-1.5 text-xs font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar del ranking"
          message={`¿Eliminar a ${entry.playerName} del ranking?`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  )
}

export function Ranking() {
  const categories = useRankingCategoriesStore((s) => s.categories)
  const points = useRankingStore((s) => s.points)
  const updatePoints = useRankingStore((s) => s.updatePoints)
  const entries = useRankingStore((s) => s.entries)
  const addResult = useRankingStore((s) => s.addResult)

  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [showCategories, setShowCategories] = useState(false)
  const [editEntry, setEditEntry] = useState<RankingEntry | null>(null)

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) setSelectedCategoryId(categories[0].id)
  }, [categories, selectedCategoryId])

  const [pointsDraft, setPointsDraft] = useState(points)
  useEffect(() => setPointsDraft(points), [points])
  const pointsDirty = RANKING_INSTANCES.some((i) => pointsDraft[i.value] !== points[i.value])
  const [pointsError, setPointsError] = useState<string | null>(null)
  const [savingPoints, setSavingPoints] = useState(false)

  async function handleSavePoints() {
    setSavingPoints(true)
    const error = await updatePoints(pointsDraft)
    setSavingPoints(false)
    setPointsError(error)
  }

  const [resultPlayerName, setResultPlayerName] = useState('')
  const [resultCategoryId, setResultCategoryId] = useState('')
  const [resultInstance, setResultInstance] = useState<RankingInstance>('fase_grupos')
  const [resultError, setResultError] = useState<string | null>(null)
  const [savingResult, setSavingResult] = useState(false)

  useEffect(() => {
    if (selectedCategoryId) setResultCategoryId(selectedCategoryId)
  }, [selectedCategoryId])

  async function handleAddResult() {
    if (!resultPlayerName.trim()) {
      setResultError('Ingresá el nombre del jugador.')
      return
    }
    if (!resultCategoryId) {
      setResultError('Elegí una categoría.')
      return
    }
    setSavingResult(true)
    const error = await addResult(resultCategoryId, resultPlayerName.trim(), resultInstance)
    setSavingResult(false)
    if (error) {
      setResultError(error)
      return
    }
    setResultError(null)
    setResultPlayerName('')
  }

  const categoryEntries = useMemo(
    () =>
      entries
        .filter((e) => e.categoryId === selectedCategoryId)
        .sort((a, b) => b.totalPoints - a.totalPoints),
    [entries, selectedCategoryId],
  )

  const selectedCategoryName = categories.find((c) => c.id === selectedCategoryId)?.name ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-50">Ranking</h1>
        <button
          type="button"
          onClick={() => setShowCategories(true)}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          Crear o editar categoría
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay categorías de ranking todavía. Creá una para empezar a cargar resultados.
        </p>
      ) : (
        <>
          <label className="block max-w-xs text-sm text-gray-400">
            Categoría
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-medium text-gray-300">Sistema de puntos por instancia</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {RANKING_INSTANCES.map((i) => (
                  <label key={i.value} className="block text-xs text-gray-400">
                    {i.label}
                    <input
                      type="number"
                      value={pointsDraft[i.value]}
                      onChange={(e) =>
                        setPointsDraft((prev) => ({ ...prev, [i.value]: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-2 py-1.5 text-sm text-gray-100"
                    />
                  </label>
                ))}
              </div>
              <ErrorText error={pointsError} />
              <button
                type="button"
                onClick={handleSavePoints}
                disabled={!pointsDirty || savingPoints}
                className="mt-3 w-full rounded-lg bg-primary-500 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
              >
                {savingPoints ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-medium text-gray-300">Cargar resultado</p>
              <label className="block text-xs text-gray-400">
                Nombre del jugador
                <input
                  value={resultPlayerName}
                  onChange={(e) => setResultPlayerName(e.target.value)}
                  placeholder="Ej: Braian"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="mt-3 block text-xs text-gray-400">
                Categoría
                <select
                  value={resultCategoryId}
                  onChange={(e) => setResultCategoryId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs text-gray-400">
                Instancia alcanzada
                <select
                  value={resultInstance}
                  onChange={(e) => setResultInstance(e.target.value as RankingInstance)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
                >
                  {RANKING_INSTANCES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-warning">
                Puntos que suma: {points[resultInstance]} pts
              </p>
              <ErrorText error={resultError} />
              <button
                type="button"
                onClick={handleAddResult}
                disabled={savingResult}
                className="mt-3 w-full rounded-lg bg-primary-500 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
              >
                {savingResult ? 'Agregando...' : 'Agregar al ranking'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="mb-3 text-sm font-medium text-gray-300">
              Ranking actual {selectedCategoryName && `- ${selectedCategoryName}`}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400">
                  <th className="pb-3 pr-3">Pos.</th>
                  <th className="pb-3 pr-3">Jugador</th>
                  <th className="pb-3 pr-3">Instancia más alta</th>
                  <th className="pb-3 pr-3">Puntos</th>
                  <th className="pb-3 pr-3" />
                </tr>
              </thead>
              <tbody>
                {categoryEntries.map((entry, index) => (
                  <tr key={entry.id} className="border-t border-gray-800/60 hover:bg-gray-800/40">
                    <td className="py-3 pr-3 text-gray-500">{index + 1}</td>
                    <td className="py-3 pr-3 text-gray-100">{entry.playerName}</td>
                    <td className="py-3 pr-3 text-gray-400">{instanceLabel(entry.bestInstance)}</td>
                    <td className="py-3 pr-3 text-gray-100">{entry.totalPoints}</td>
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        onClick={() => setEditEntry(entry)}
                        className="text-xs text-primary-500 hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categoryEntries.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">Todavía no hay resultados cargados.</p>
            )}
          </div>
        </>
      )}

      {showCategories && <RankingCategoriesModal onClose={() => setShowCategories(false)} />}
      {editEntry && <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} />}
    </div>
  )
}
