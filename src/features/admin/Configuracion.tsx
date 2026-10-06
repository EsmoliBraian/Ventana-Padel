import { useState, type ChangeEvent } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { ErrorText } from '@/components/ErrorText'
import { uploadImage } from '@/lib/storage'
import { publicVenueUrl } from '@/lib/venuePath'

export function Configuracion() {
  const settings = useSettingsStore()
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [venueName, setVenueName] = useState(settings.venueName)
  const [whatsappPhone, setWhatsappPhone] = useState(settings.whatsappPhone)
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? '')
  const [about, setAbout] = useState(settings.about)
  const [address, setAddress] = useState(settings.address)
  const [instagramUrl, setInstagramUrl] = useState(settings.instagramUrl ?? '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const dirty =
    venueName !== settings.venueName ||
    whatsappPhone !== settings.whatsappPhone ||
    logoUrl !== (settings.logoUrl ?? '') ||
    about !== settings.about ||
    address !== settings.address ||
    instagramUrl !== (settings.instagramUrl ?? '')

  const bookingLink = publicVenueUrl(settings.slug)

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError(null)
    try {
      setLogoUrl(await uploadImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleCopyLink() {
    if (!bookingLink) return
    await navigator.clipboard.writeText(bookingLink)
    useSettingsStore.getState().markOnboardingStep('link')
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleSave() {
    setSaving(true)
    const saveError = await updateSettings({
      venueName,
      whatsappPhone,
      logoUrl: logoUrl || undefined,
      about,
      address,
      instagramUrl: instagramUrl || undefined,
    })
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
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold text-gray-50">Configuracion</h1>

      {bookingLink && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="mb-2 text-sm text-gray-400">Tu link publico de reservas</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={bookingLink}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-sm text-gray-100"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400"
            >
              {linkCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <label className="block text-sm text-gray-400">
          Nombre del complejo
          <input
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <label className="block text-sm text-gray-400">
          Telefono de WhatsApp (con codigo de pais, sin +)
          <input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            placeholder="5491122334455"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <div className="block text-sm text-gray-400">
          Logo / icono del complejo
          <div className="mt-1 flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="h-12 w-12 rounded-full bg-gray-800" />
            )}
            <label className="cursor-pointer rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">
              {uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Las canchas y su precio se administran en la seccion Reservas.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-medium text-gray-200">Landing publica</p>

        <label className="block text-sm text-gray-400">
          Sobre el complejo
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            placeholder="Contale a tus clientes qué hace especial a tu complejo..."
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <label className="block text-sm text-gray-400">
          Direccion
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Av. Siempre Viva 742, Buenos Aires"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>

        <label className="block text-sm text-gray-400">
          Instagram (link completo)
          <input
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/tucomplejo"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100"
          />
        </label>
      </div>

      <ErrorText error={error} />

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full rounded-lg bg-primary-500 py-2 text-sm font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Guardar configuracion'}
      </button>
      {saved && <p className="text-sm text-success">Configuracion guardada.</p>}
    </div>
  )
}
