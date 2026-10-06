import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuthStore } from '@/store/adminAuthStore'
import { useSettingsStore } from '@/store/settingsStore'
import { supabase } from '@/lib/supabaseClient'
import { slugify } from '@/lib/slug'
import { MAX_COURTS_PER_SPORT, SPORTS } from '@/lib/sports'
import { RESERVED_SLUGS } from '@/lib/venuePath'
import { ErrorText } from '@/components/ErrorText'
import type { Sport } from '@/types'

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken'

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100 outline-none focus:border-primary-500'

const EMPTY_COURTS: Record<Sport, number> = { padel: 0, futbol5: 0, futbol7: 0, tenis: 0, otro: 0 }

// Alta en un solo flujo: paso 1 crea la cuenta, paso 2 crea el complejo.
// Tambien atiende /admin/setup, para quien ya tiene cuenta pero todavia no
// creo su complejo (por ejemplo, si tuvo que confirmar el mail).
export function AdminSignupPage() {
  const authInitialized = useAdminAuthStore((s) => s.initialized)
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const session = useAdminAuthStore((s) => s.session)
  const signUp = useAdminAuthStore((s) => s.signUp)
  const createVenue = useSettingsStore((s) => s.createVenue)
  const navigate = useNavigate()
  const userId = session?.user.id

  const [ownerName, setOwnerName] = useState('')
  const [ownerWhatsapp, setOwnerWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  const [checkingExistingVenue, setCheckingExistingVenue] = useState(true)
  const [hasVenue, setHasVenue] = useState(false)
  const [venueName, setVenueName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEditedManually, setSlugEditedManually] = useState(false)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [courts, setCourts] = useState<Record<Sport, number>>(EMPTY_COURTS)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Si la cuenta ya existia, el nombre y el WhatsApp vienen de cuando se creo.
  const metadata = session?.user.user_metadata as { owner_name?: string; owner_whatsapp?: string } | undefined
  const needsOwnerData = !metadata?.owner_name || !metadata?.owner_whatsapp

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    useSettingsStore
      .getState()
      .fetchSettingsForOwner(userId)
      .then(() => {
        setHasVenue(!!useSettingsStore.getState().id)
        setCheckingExistingVenue(false)
      })
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!slugEditedManually) setSlug(slugify(venueName))
  }, [venueName, slugEditedManually])

  useEffect(() => {
    if (!slug) {
      setSlugStatus('idle')
      return
    }
    if (RESERVED_SLUGS.includes(slug)) {
      setSlugStatus('taken')
      return
    }
    setSlugStatus('checking')
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from('settings').select('id').eq('slug', slug).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 400)
    return () => clearTimeout(timeout)
  }, [slug])

  if (!authInitialized || (isAuthenticated && checkingExistingVenue)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Cargando...
      </div>
    )
  }
  if (isAuthenticated && hasVenue) return <Navigate to="/admin" replace />

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault()
    if (ownerName.trim().length < 2) {
      setError('Escribí tu nombre.')
      return
    }
    if (ownerWhatsapp.replace(/\D/g, '').length < 8) {
      setError('Revisá el número de WhatsApp: va con código de país, sin el +.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres.')
      return
    }

    setSubmitting(true)
    const { error: signUpError, hasSession } = await signUp(email.trim(), password, {
      ownerName: ownerName.trim(),
      ownerWhatsapp: ownerWhatsapp.replace(/\D/g, ''),
    })
    setSubmitting(false)

    if (signUpError) {
      setError(signUpError)
      return
    }
    setError(null)
    if (!hasSession) setAwaitingConfirmation(true)
  }

  function changeCourts(sport: Sport, delta: number) {
    setCourts((prev) => ({
      ...prev,
      [sport]: Math.min(MAX_COURTS_PER_SPORT, Math.max(0, prev[sport] + delta)),
    }))
  }

  async function handleCreateVenue(e: FormEvent) {
    e.preventDefault()
    const name = (metadata?.owner_name ?? ownerName).trim()
    const whatsapp = (metadata?.owner_whatsapp ?? ownerWhatsapp).replace(/\D/g, '')
    if (!venueName.trim() || !slug) {
      setError('Escribí el nombre del complejo.')
      return
    }
    if (slugStatus === 'taken') {
      setError('Ese link ya está en uso, elegí otro.')
      return
    }
    if (Object.values(courts).every((count) => count === 0)) {
      setError('Sumá al menos una cancha.')
      return
    }

    setSubmitting(true)
    const createError = await createVenue({
      slug,
      venueName: venueName.trim(),
      ownerName: name,
      ownerWhatsapp: whatsapp,
      courts: SPORTS.map((s) => ({ sport: s.id, count: courts[s.id] })).filter((c) => c.count > 0),
    })
    setSubmitting(false)
    if (createError) {
      setError(createError)
      return
    }
    navigate('/admin')
  }

  if (awaitingConfirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
          <h1 className="mb-3 text-lg font-semibold text-gray-50">Confirmá tu mail</h1>
          <p className="text-sm text-gray-400">
            Te mandamos un link a {email}. Abrilo y después iniciá sesión para terminar de crear
            tu complejo.
          </p>
          <Link to="/admin/login" className="mt-4 inline-block text-sm text-primary-500 hover:underline">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={handleCreateAccount}
          className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
            Paso 1 de 2
          </p>
          <h1 className="mt-1 text-lg font-semibold text-gray-50">Probá gratis 30 días</h1>
          <p className="mb-6 mt-1 text-sm text-gray-400">Sin tarjeta. Creás tu cuenta en 2 minutos.</p>

          <label className="mb-3 block text-sm text-gray-400">
            Tu nombre
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              autoComplete="name"
              required
              className={INPUT_CLASS}
            />
          </label>

          <label className="mb-3 block text-sm text-gray-400">
            Tu WhatsApp (con código de país, sin +)
            <input
              value={ownerWhatsapp}
              onChange={(e) => setOwnerWhatsapp(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="5491122334455"
              required
              className={INPUT_CLASS}
            />
          </label>

          <label className="mb-3 block text-sm text-gray-400">
            Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className={INPUT_CLASS}
            />
          </label>

          <label className="mb-4 block text-sm text-gray-400">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={INPUT_CLASS}
            />
          </label>

          {error && <p className="mb-4 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-60"
          >
            {submitting ? 'Creando cuenta...' : 'Continuar'}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            ¿Ya tenés cuenta?{' '}
            <Link to="/admin/login" className="text-primary-500 hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={handleCreateVenue}
        className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
          Paso 2 de 2
        </p>
        <h1 className="mt-1 text-lg font-semibold text-gray-50">Tu complejo</h1>
        <p className="mb-6 mt-1 text-sm text-gray-400">
          Con esto armamos tu panel y tu link de reservas. Después podés cambiar todo.
        </p>

        {needsOwnerData && (
          <>
            <label className="mb-3 block text-sm text-gray-400">
              Tu nombre
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </label>
            <label className="mb-3 block text-sm text-gray-400">
              Tu WhatsApp (con código de país, sin +)
              <input
                value={ownerWhatsapp}
                onChange={(e) => setOwnerWhatsapp(e.target.value)}
                inputMode="tel"
                placeholder="5491122334455"
                required
                className={INPUT_CLASS}
              />
            </label>
          </>
        )}

        <label className="mb-3 block text-sm text-gray-400">
          Nombre del complejo
          <input
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            required
            className={INPUT_CLASS}
          />
        </label>

        <label className="mb-1 block text-sm text-gray-400">
          Tu link de reservas
          <div className="mt-1 flex items-center rounded-lg border border-gray-700 bg-gray-925 px-3 py-2 text-gray-100">
            <span className="text-gray-500">.../</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value))
                setSlugEditedManually(true)
              }}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
        </label>
        <p className="mb-4 min-h-4 text-xs">
          {slugStatus === 'checking' && <span className="text-gray-500">Verificando...</span>}
          {slugStatus === 'available' && <span className="text-success">Disponible</span>}
          {slugStatus === 'taken' && <span className="text-danger">Ya está en uso, probá con otro</span>}
        </p>

        <p className="mb-2 text-sm text-gray-400">¿Cuántas canchas tenés de cada deporte?</p>
        <div className="mb-4 space-y-2">
          {SPORTS.map((sport) => (
            <div
              key={sport.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-925 px-3 py-2"
            >
              <span className="text-sm text-gray-200">{sport.label}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => changeCourts(sport.id, -1)}
                  disabled={courts[sport.id] === 0}
                  aria-label={`Quitar una cancha de ${sport.label}`}
                  className="h-8 w-8 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-semibold text-gray-50">
                  {courts[sport.id]}
                </span>
                <button
                  type="button"
                  onClick={() => changeCourts(sport.id, 1)}
                  disabled={courts[sport.id] === MAX_COURTS_PER_SPORT}
                  aria-label={`Sumar una cancha de ${sport.label}`}
                  className="h-8 w-8 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <ErrorText error={error} />

        <button
          type="submit"
          disabled={submitting || slugStatus === 'taken' || slugStatus === 'checking'}
          className="mt-2 w-full rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400 disabled:opacity-60"
        >
          {submitting ? 'Creando tu complejo...' : 'Crear mi complejo'}
        </button>
      </form>
    </div>
  )
}
