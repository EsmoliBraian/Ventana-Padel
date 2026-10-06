import { createClient } from '@supabase/supabase-js'
import { isCurrentVenueReadOnly, READ_ONLY_MESSAGE } from '@/lib/plan'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Con la prueba vencida, corta las escrituras de datos e imagenes antes de
// mandarlas y devuelve un error con el formato de la API, asi cada pantalla
// muestra el mismo mensaje por su canal de errores habitual. Las funciones
// (rpc) y la autenticacion pasan siempre.
const guardedFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const isWrite = method !== 'GET' && method !== 'HEAD'
  const isData = url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/')
  const isImage = url.includes('/storage/v1/object/')

  if (isWrite && (isData || isImage) && isCurrentVenueReadOnly()) {
    return Promise.resolve(
      new Response(
        JSON.stringify({ message: READ_ONLY_MESSAGE, code: 'PLAN_EXPIRED', details: null, hint: null }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  }
  return fetch(input, init)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: guardedFetch },
})
