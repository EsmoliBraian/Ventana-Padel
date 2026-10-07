import { useState, type ChangeEvent } from 'react'
import { useAdsStore } from '@/store/adsStore'
import { uploadImage } from '@/lib/storage'
import { todayKey } from '@/lib/format'
import {
  AD_FORMATS,
  AD_LINK_TYPES,
  adFormatInfo,
  isValidLinkValue,
  normalizeLinkValue,
  placementsForFormat,
} from '@/lib/ads'
import { ErrorText } from '@/components/ErrorText'
import { AdCreative } from '@/components/site/ads/AdCreative'
import { PlacementDiagram } from './PlacementDiagram'
import type { AdFormat, AdInput, AdLinkType, OwnerAd } from '@/types'

const FIELD = 'mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100'
const CAPTION_MAX = 140

interface AdFormProps {
  ad?: OwnerAd // sin anuncio = alta
  onDone: () => void
}

// Formulario de un anuncio, para crear y para editar, con vista previa de
// como se va a ver en el sitio.
export function AdForm({ ad, onDone }: AdFormProps) {
  const addAd = useAdsStore((s) => s.addAd)
  const updateAd = useAdsStore((s) => s.updateAd)

  const [businessName, setBusinessName] = useState(ad?.businessName ?? '')
  const [format, setFormat] = useState<AdFormat>(ad?.format ?? 'banner')
  const [placement, setPlacement] = useState(ad?.placement ?? placementsForFormat('banner')[0].key)
  const [imageUrl, setImageUrl] = useState(ad?.imageUrl ?? '')
  const [mobileImageUrl, setMobileImageUrl] = useState(ad?.mobileImageUrl ?? '')
  const [caption, setCaption] = useState(ad?.caption ?? '')
  const [linkType, setLinkType] = useState<AdLinkType | ''>(ad?.linkType ?? '')
  const [linkValue, setLinkValue] = useState(ad?.linkValue ?? '')
  const [startsOn, setStartsOn] = useState(ad?.startsOn ?? todayKey())
  const [endsOn, setEndsOn] = useState(ad?.endsOn ?? '')
  const [active, setActive] = useState(ad?.active ?? true)
  const [monthlyAmount, setMonthlyAmount] = useState(ad && ad.monthlyAmount > 0 ? String(ad.monthlyAmount) : '')
  const [nextPaymentOn, setNextPaymentOn] = useState(ad?.nextPaymentOn ?? '')
  const [uploading, setUploading] = useState<'main' | 'mobile' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const info = adFormatInfo(format)
  const placements = placementsForFormat(format)
  const linkInfo = AD_LINK_TYPES.find((t) => t.id === linkType)
  const cleanLink = linkType ? normalizeLinkValue(linkType, linkValue) : ''

  function handleFormat(next: AdFormat) {
    setFormat(next)
    const allowed = placementsForFormat(next)
    if (!allowed.some((p) => p.key === placement)) setPlacement(allowed[0].key)
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>, target: 'main' | 'mobile') {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(target)
    setError(null)
    try {
      // Los logos conservan el fondo transparente (PNG); el resto se
      // comprime a JPG como las demas imagenes del sitio.
      const url = await uploadImage(file, format === 'logo' ? { keepTransparency: true, maxDimension: 800 } : {})
      if (target === 'main') setImageUrl(url)
      else setMobileImageUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.')
    } finally {
      setUploading(null)
    }
  }

  async function handleSave() {
    if (businessName.trim() === '') return setError('Escribí el nombre del comercio.')
    if (!imageUrl) return setError('Subí la imagen del anuncio.')
    if (linkType && !isValidLinkValue(linkType, cleanLink)) {
      return setError(`Revisá el enlace. ${linkInfo?.help ?? ''}`)
    }
    if (endsOn && endsOn < startsOn) return setError('La fecha "hasta" no puede ser anterior a la fecha "desde".')

    const input: AdInput = {
      businessName,
      imageUrl,
      mobileImageUrl: format === 'banner' && mobileImageUrl ? mobileImageUrl : undefined,
      caption,
      linkType: linkType || undefined,
      linkValue: linkType ? cleanLink : undefined,
      format,
      placement,
      startsOn,
      endsOn: endsOn || undefined,
      active,
      monthlyAmount: Number(monthlyAmount) || 0,
      nextPaymentOn: nextPaymentOn || undefined,
    }
    setSaving(true)
    const saveError = ad ? await updateAd(ad.id, input) : await addAd(input)
    setSaving(false)
    if (saveError) return setError(saveError)
    onDone()
  }

  const preview = {
    businessName: businessName || 'Nombre del comercio',
    imageUrl,
    mobileImageUrl: mobileImageUrl || undefined,
    caption,
    // La vista previa no lleva enlace: es solo para ver como queda.
    linkType: undefined,
    linkValue: undefined,
    format,
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-sm font-medium text-gray-100">{ad ? 'Editar anuncio' : 'Nuevo anuncio'}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <label className="block text-sm text-gray-400">
            Nombre del comercio
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={80} className={FIELD} />
          </label>

          <div>
            <p className="text-sm text-gray-400">Formato</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {AD_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    format === f.id ? 'border-primary-500 bg-primary-500/10 text-primary-500' : 'border-gray-700 text-gray-300'
                  }`}
                >
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-xs text-gray-500">{f.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400">
              Ubicación
              <select value={placement} onChange={(e) => setPlacement(e.target.value)} aria-label="Ubicación" className={FIELD}>
                {placements.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-gray-500">{placements.find((p) => p.key === placement)?.where}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-gray-400">
              Imagen
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e, 'main')}
                aria-label="Imagen"
                className="mt-1 w-full text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-gray-100"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Tamaño recomendado: {info.size}.{uploading === 'main' ? ' Subiendo...' : ''}
              </span>
            </label>
            {format === 'banner' && (
              <label className="block text-sm text-gray-400">
                Imagen para celular (opcional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(e, 'mobile')}
                  aria-label="Imagen para celular"
                  className="mt-1 w-full text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-gray-100"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Tamaño recomendado: {info.mobileSize}. Sin ella, en celular se recorta la principal.
                  {uploading === 'mobile' ? ' Subiendo...' : ''}
                </span>
                {mobileImageUrl && (
                  <button type="button" onClick={() => setMobileImageUrl('')} className="mt-1 text-xs text-primary-500 hover:underline">
                    Quitar imagen para celular
                  </button>
                )}
              </label>
            )}
          </div>

          {format !== 'logo' && (
            <label className="block text-sm text-gray-400">
              Texto corto (opcional)
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={CAPTION_MAX}
                aria-label="Texto corto"
                className={FIELD}
              />
              <span className="mt-1 block text-right text-xs text-gray-500">
                {caption.length} / {CAPTION_MAX}
              </span>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block text-sm text-gray-400">
              Enlace (opcional)
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as AdLinkType | '')}
                aria-label="Enlace"
                className={FIELD}
              >
                <option value="">Sin enlace</option>
                {AD_LINK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {linkInfo && (
              <label className="block text-sm text-gray-400">
                {linkInfo.label}
                <input
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder={linkInfo.placeholder}
                  aria-label={linkInfo.label}
                  className={FIELD}
                />
                <span className="mt-1 block text-xs text-gray-500">{linkInfo.help} Se abre en otra pestaña.</span>
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm text-gray-400">
              Se muestra desde
              <input type="date" value={startsOn} onChange={(e) => e.target.value && setStartsOn(e.target.value)} className={FIELD} />
            </label>
            <label className="block text-sm text-gray-400">
              Hasta (opcional)
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={FIELD} />
            </label>
            <div className="block text-sm text-gray-400">
              Estado
              <label className="mt-1 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Activo
              </label>
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-500">
            Pasada la fecha "hasta", el anuncio deja de mostrarse solo. Sin fecha, se muestra hasta que lo pauses.
          </p>

          <div className="rounded-lg border border-gray-800 p-3">
            <p className="text-sm font-medium text-gray-200">Cobro</p>
            <p className="text-xs text-gray-500">Solo para tu control: no se muestra en el sitio ni cobra nada.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-gray-400">
                Monto mensual
                <input
                  value={monthlyAmount}
                  onChange={(e) => setMonthlyAmount(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="0"
                  className={FIELD}
                />
              </label>
              <label className="block text-sm text-gray-400">
                Próximo pago
                <input type="date" value={nextPaymentOn} onChange={(e) => setNextPaymentOn(e.target.value)} className={FIELD} />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm text-gray-400">Dónde va</p>
            <PlacementDiagram format={format} selected={placement} onSelect={setPlacement} />
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-400">Vista previa</p>
            {imageUrl ? (
              <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
                {format === 'banner' ? (
                  <>
                    <p className="text-xs text-gray-500">En computadora</p>
                    <AdCreative ad={preview} variant="desktop" />
                    <p className="text-xs text-gray-500">En celular</p>
                    <div className="mx-auto max-w-[15rem]">
                      <AdCreative ad={preview} variant="mobile" />
                    </div>
                  </>
                ) : (
                  <div className={format === 'tarjeta' ? 'mx-auto max-w-[16rem]' : 'flex justify-center'}>
                    <AdCreative ad={preview} />
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-700 p-4 text-center text-xs text-gray-500">
                Subí la imagen para ver cómo queda.
              </p>
            )}
          </div>
        </div>
      </div>

      <ErrorText error={error} />

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading !== null}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : ad ? 'Guardar cambios' : 'Crear anuncio'}
        </button>
      </div>
    </div>
  )
}
