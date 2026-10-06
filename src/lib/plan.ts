import type { PlanStatus } from '@/types'

export interface PlanFields {
  planStatus: PlanStatus
  trialEndsAt?: string
}

export interface PlanInfo {
  // Estado efectivo: una prueba con la fecha vencida ya cuenta como vencida,
  // aunque plan_status siga diciendo "trial" (misma regla que
  // venue_is_writable() en la base).
  state: PlanStatus
  daysLeft: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function getPlanInfo(plan: PlanFields, now: Date = new Date()): PlanInfo {
  if (plan.planStatus !== 'trial') return { state: plan.planStatus, daysLeft: 0 }
  const endsAt = plan.trialEndsAt ? new Date(plan.trialEndsAt).getTime() : 0
  const remaining = endsAt - now.getTime()
  if (remaining <= 0) return { state: 'expired', daysLeft: 0 }
  return { state: 'trial', daysLeft: Math.ceil(remaining / DAY_MS) }
}

export const READ_ONLY_MESSAGE =
  'La prueba gratis de este complejo terminó: el panel está en solo lectura. No se borró ningún dato.'

// El cliente de Supabase consulta esto antes de cada escritura (ver
// supabaseClient.ts). Es una ayuda para dar un mensaje claro sin viaje al
// servidor: el bloqueo real esta en las politicas RLS.
let currentPlan: PlanFields = { planStatus: 'active' }

export function setCurrentPlan(plan: PlanFields) {
  currentPlan = plan
}

export function isCurrentVenueReadOnly(): boolean {
  return getPlanInfo(currentPlan).state === 'expired'
}

const CONTACT_WHATSAPP = (import.meta.env.VITE_CONTACT_WHATSAPP as string | undefined) ?? ''

// Link para contratar: el cobro es manual, asi que abre un chat de WhatsApp
// con el numero comercial configurado en el deploy.
export function buildContractLink(venueName: string): string | null {
  const digits = CONTACT_WHATSAPP.replace(/\D/g, '')
  if (!digits) return null
  const message = `Hola! Quiero contratar el plan para mi complejo "${venueName}".`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
