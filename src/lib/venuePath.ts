import { useSettingsStore } from '@/store/settingsStore'

// Slugs que no puede usar ningun complejo porque chocan con rutas propias de
// la app. Mantener en sincronia con la lista de create_venue() en
// supabase/migrations/013_trial_onboarding.sql.
export const RESERVED_SLUGS = ['admin', 'api', 'assets', 'demo', 'login', 'signup', 'superadmin']

export function venuePath(slug: string | null, path = ''): string {
  return `/${slug ?? ''}${path}`
}

// Cada complejo tiene su sitio publico bajo /<slug>. Este hook arma los links
// internos de ese sitio a partir del complejo cargado en el store.
export function useVenuePath(): (path?: string) => string {
  const slug = useSettingsStore((s) => s.slug)
  return (path = '') => venuePath(slug, path)
}

export function publicVenueUrl(slug: string | null): string {
  if (!slug) return ''
  return `${window.location.origin}${venuePath(slug)}`
}
