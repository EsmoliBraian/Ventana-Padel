import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { venuePath } from '@/lib/venuePath'

const LANDING_URL = import.meta.env.VITE_LANDING_URL as string | undefined
const DEFAULT_VENUE_SLUG = import.meta.env.VITE_DEFAULT_VENUE_SLUG as string | undefined

// La raiz no pertenece a ningun complejo (cada uno vive en /<slug>). Segun la
// configuracion del deploy: muestra un complejo por defecto, manda a la
// landing comercial, o deja elegir entre crear cuenta e ingresar.
export function RootPage() {
  const redirectToLanding = !DEFAULT_VENUE_SLUG && !!LANDING_URL

  useEffect(() => {
    if (redirectToLanding && LANDING_URL) window.location.replace(LANDING_URL)
  }, [redirectToLanding])

  if (DEFAULT_VENUE_SLUG) return <Navigate to={venuePath(DEFAULT_VENUE_SLUG)} replace />
  if (redirectToLanding) return null

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-50">Reservas online para tu complejo</h1>
        <p className="mt-2 text-sm text-gray-400">
          Creá tu cuenta y probalo gratis 30 días, sin tarjeta.
        </p>
        <Link
          to="/admin/signup"
          className="mt-6 block rounded-lg bg-primary-500 py-2 font-medium text-gray-950 hover:bg-primary-400"
        >
          Probar gratis
        </Link>
        <Link to="/admin/login" className="mt-3 block text-sm text-primary-500 hover:underline">
          Ya tengo cuenta
        </Link>
      </div>
    </div>
  )
}
