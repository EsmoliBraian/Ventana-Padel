import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface OwnerProfile {
  ownerName: string
  ownerWhatsapp: string
}

// Supabase Auth devuelve los errores en ingles.
function translateAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('already registered')) return 'Ya hay una cuenta con ese mail. Iniciá sesión.'
  if (lower.includes('invalid login credentials')) return 'Mail o contraseña incorrectos.'
  if (lower.includes('email not confirmed')) return 'Todavía no confirmaste tu mail.'
  if (lower.includes('password')) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (lower.includes('invalid') && lower.includes('email')) return 'Revisá el mail, no parece válido.'
  if (lower.includes('rate limit')) return 'Demasiados intentos. Probá de nuevo en unos minutos.'
  return message
}

interface AdminAuthState {
  session: Session | null
  initialized: boolean
  isAuthenticated: boolean
  init: () => void
  login: (email: string, password: string) => Promise<string | null>
  signUp: (
    email: string,
    password: string,
    profile: OwnerProfile,
  ) => Promise<{ error: string | null; hasSession: boolean }>
  logout: () => Promise<void>
}

export const useAdminAuthStore = create<AdminAuthState>()((set) => ({
  session: null,
  initialized: false,
  isAuthenticated: false,
  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, isAuthenticated: !!data.session, initialized: true })
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isAuthenticated: !!session })
    })
  },
  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return translateAuthError(error.message)
    set({ session: data.session, isAuthenticated: !!data.session })
    return null
  },
  signUp: async (email, password, profile) => {
    // El nombre y el WhatsApp viajan con la cuenta para tenerlos al crear el
    // complejo, incluso si antes hay que confirmar el mail.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { owner_name: profile.ownerName, owner_whatsapp: profile.ownerWhatsapp },
      },
    })
    if (error) return { error: translateAuthError(error.message), hasSession: false }
    const hasSession = !!data.session
    if (hasSession) set({ session: data.session, isAuthenticated: true })
    return { error: null, hasSession }
  },
  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, isAuthenticated: false })
  },
}))
