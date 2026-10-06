import type { Sport } from '@/types'

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
