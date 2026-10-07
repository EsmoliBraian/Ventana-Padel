import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import { ErrorText } from '@/components/ErrorText'
import type { RankingCategory } from '@/types'

function CategoryRow({ category }: { category: RankingCategory }) {
  const updateCategory = useRankingCategoriesStore((s) => s.updateCategory)
  const deleteCategory = useRankingCategoriesStore((s) => s.deleteCategory)
  const fetchEntries = useRankingStore((s) => s.fetchEntries)

  const [name, setName] = useState(category.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dirty = name !== category.name

  async function handleSave() {
    setSaving(true)
    const saveError = await updateCategory(category.id, name)
    setSaving(false)
    setError(saveError)
  }

  async function handleDelete() {
    const deleteError = await deleteCategory(category.id)
    if (deleteError) {
      setConfirmingDelete(false)
      setError(deleteError)
      return
    }
    fetchEntries()
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-925 px-3 py-1.5 text-sm text-gray-100"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? '...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="text-xs text-danger hover:underline"
        >
          Eliminar
        </button>
      </div>
      <ErrorText error={error} />

      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar categoría"
          message={`¿Eliminar la categoría "${category.name}"? Se pierde el ranking cargado en esa categoría.`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

export function RankingCategoriesModal({ onClose }: { onClose: () => void }) {
  const categories = useRankingCategoriesStore((s) => s.categories)
  const addCategory = useRankingCategoriesStore((s) => s.addCategory)

  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const addError = await addCategory(newName.trim())
    setAdding(false)
    if (addError) {
      setError(addError)
      return
    }
    setError(null)
    setNewName('')
  }

  return (
    <Modal title="Categorías de ranking" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="space-y-2">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-gray-500">No hay categorías cargadas.</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej: 4ta Masculina"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
          >
            + Crear
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    </Modal>
  )
}
