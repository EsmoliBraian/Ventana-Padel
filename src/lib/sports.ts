import type { Court, Sport } from '@/types'

// Mantener en sincronia con el check de courts.sport y con create_venue() en
// supabase/migrations/013_trial_onboarding.sql.
export const SPORTS: { id: Sport; label: string }[] = [
  { id: 'padel', label: 'Pádel' },
  { id: 'futbol5', label: 'Fútbol 5' },
  { id: 'futbol7', label: 'Fútbol 7' },
  { id: 'tenis', label: 'Tenis' },
  { id: 'otro', label: 'Otro deporte' },
]

export const MAX_COURTS_PER_SPORT = 12

export function sportLabel(sport: Sport): string {
  return SPORTS.find((s) => s.id === sport)?.label ?? 'Otro deporte'
}

// Jugadores que entran en un turno, segun el deporte de la cancha.
const PLAYERS_PER_SLOT: Record<Sport, number> = {
  padel: 4,
  futbol5: 10,
  futbol7: 14,
  tenis: 2,
  otro: 2,
}

export function defaultPlayers(sport: Sport): number {
  return PLAYERS_PER_SLOT[sport]
}

// Deportes que ofrece un complejo, en el orden de SPORTS.
export function venueSports(courts: Court[]): Sport[] {
  return SPORTS.map((s) => s.id).filter((id) => courts.some((c) => c.sport === id))
}

// Titular del sitio publico: nombra el deporte solo si el complejo tiene uno.
export function heroHeadline(courts: Court[]): string {
  const sports = venueSports(courts)
  if (sports.length === 1 && sports[0] !== 'otro') {
    return `Tu cancha de ${sportLabel(sports[0]).toLowerCase()}, lista cuando quieras`
  }
  return 'Tu cancha, lista cuando quieras'
}
