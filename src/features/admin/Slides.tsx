import { useState } from 'react'
import { useSlidesStore } from '@/store/slidesStore'
import { uploadImage } from '@/lib/storage'
import { ErrorText } from '@/components/ErrorText'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { HeroSlide } from '@/types'

function SlideCard({ slide, startEditing }: { slide: HeroSlide; startEditing: boolean }) {
  const updateSlide = useSlidesStore((s) => s.updateSlide)
  const deleteSlide = useSlidesStore((s) => s.deleteSlide)

  const [editing, setEditing] = useState(startEditing)
  const [title, setTitle] = useState(slide.title)
  const [subtitle, setSubtitle] = useState(slide.subtitle)
  const [body, setBody] = useState(slide.body)
  const [imageUrl, setImageUrl] = useState(slide.imageUrl)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dirty =
    title !== slide.title ||
    subtitle !== slide.subtitle ||
    body !== slide.body ||
    imageUrl !== slide.imageUrl

  function handleEdit() {
    setTitle(slide.title)
    setSubtitle(slide.subtitle)
    setBody(slide.body)
    setImageUrl(slide.imageUrl)
    setError(null)
    setEditing(true)
  }

  function handleCancel() {
    setTitle(slide.title)
    setSubtitle(slide.subtitle)
    setBody(slide.body)
    setImageUrl(slide.imageUrl)
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    const saveError = await updateSlide(slide.id, { title, subtitle, body, imageUrl })
    setSaving(false)
    setError(saveError)
    if (!saveError) setEditing(false)
  }

  async function handlePublishToggle() {
    setError(await updateSlide(slide.id, { published: !slide.published }))
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
    setError(await deleteSlide(slide.id))
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {slide.imageUrl && (
              <img
                src={slide.imageUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-gray-100">{slide.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    slide.published ? 'bg-success/20 text-success' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {slide.published ? 'Publicado' : 'Borrador'}
                </span>
              </div>
              <p className="truncate text-xs text-gray-500">{slide.subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handlePublishToggle}
              aria-label={slide.published ? 'Despublicar' : 'Publicar'}
              title={slide.published ? 'Despublicar' : 'Publicar'}
              className="text-gray-400 hover:text-primary-500"
            >
              <i className={`fa-solid ${slide.published ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
            <button
              type="button"
              onClick={handleEdit}
              aria-label="Editar post"
              title="Editar"
              className="text-gray-400 hover:text-primary-500"
            >
              <i className="fa-solid fa-pen" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Eliminar post"
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
            title="Eliminar post"
            message={`¿Eliminar "${slide.title}"? Esta accion no se puede deshacer.`}
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
            slide.published ? 'bg-success/20 text-success' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {slide.published ? 'Publicado' : 'Borrador'}
        </span>
        <button
          type="button"
          onClick={handlePublishToggle}
          className="text-xs text-primary-500 hover:underline"
        >
          {slide.published ? 'Despublicar' : 'Publicar'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-gray-400">
          Titulo
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-sm text-gray-400">
          Subtitulo
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-sm text-gray-400 sm:col-span-2">
          Contenido completo del post
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Escribi la nota completa. Esto se muestra cuando alguien hace click en 'Leer mas'."
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-sm text-gray-400 sm:col-span-2">
          URL de imagen
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="block text-sm text-gray-400 sm:col-span-2">
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

      {imageUrl && (
        <img src={imageUrl} alt="" className="mt-3 h-24 w-full rounded-lg object-cover" />
      )}

      <ErrorText error={error} />

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label="Eliminar post"
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
          title="Eliminar post"
          message={`¿Eliminar "${slide.title}"? Esta accion no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

export function Slides() {
  const slides = useSlidesStore((s) => s.slides)
  const addSlide = useSlidesStore((s) => s.addSlide)
  const [error, setError] = useState<string | null>(null)

  const sortedSlides = [...slides].sort((a, b) => a.order - b.order)

  // El post recien creado se abre directo en edicion.
  const [newId, setNewId] = useState<string | null>(null)

  async function handleAdd() {
    const before = new Set(slides.map((s) => s.id))
    const addError = await addSlide({
      imageUrl: '',
      title: 'Nuevo post',
      subtitle: '',
      body: '',
      order: slides.length,
      published: false,
    })
    setError(addError)
    if (addError) return
    const created = useSlidesStore.getState().slides.find((s) => !before.has(s.id))
    setNewId(created?.id ?? null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-50">Blog / Novedades</h1>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
        >
          + Crear post
        </button>
      </div>
      <p className="text-sm text-gray-500">
        Estos posts aparecen en la seccion "Blog" del sitio publico. El titulo y la bajada se ven
        en la tarjeta; el contenido completo se muestra al hacer click en "Leer mas".
      </p>

      <ErrorText error={error} />

      <div className="space-y-3">
        {sortedSlides.map((slide) => (
          <SlideCard
            key={slide.id === newId ? `${slide.id}-nuevo` : slide.id}
            slide={slide}
            startEditing={slide.id === newId}
          />
        ))}
        {slides.length === 0 && <p className="text-sm text-gray-500">No hay posts cargados.</p>}
      </div>
    </div>
  )
}
