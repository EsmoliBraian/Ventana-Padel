import { useEffect, useRef, useState } from 'react'
import { useAdsStore } from '@/store/adsStore'

// Anuncios ya informados en esta carga de la pagina: no se vuelve a llamar a
// la base por el mismo (ella igual cuenta una sola vista por visitante y dia).
const reported = new Set<string>()

const VISIBLE_RATIO = 0.5
const VISIBLE_MS = 1000

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

// Si el elemento esta a la vista: al menos la mitad dentro de la pantalla y
// con la pestaña activa. Recibe el elemento (no un ref) para volver a
// observar cuando aparece: una ubicacion no dibuja nada hasta tener anuncios.
export function useOnScreen(element: HTMLElement | null): boolean {
  const [inView, setInView] = useState(false)
  const pageVisible = usePageVisible()

  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') {
      setInView(false)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO),
      { threshold: [0, VISIBLE_RATIO, 1] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return inView && pageVisible
}

// Cuenta una vista de cada anuncio de `adIds` cuando realmente se mostro:
// el contenedor estuvo a la vista, sin interrupcion, durante un segundo.
// En una rotacion se pasa solo el anuncio que se esta mostrando: los que
// esperan su turno no cuentan hasta que les toca.
export function useAdViews(onScreen: boolean, adIds: string[], enabled = true) {
  const trackEvent = useAdsStore((s) => s.trackEvent)
  const key = adIds.join(',')
  const idsRef = useRef(adIds)
  idsRef.current = adIds

  useEffect(() => {
    if (!enabled || !onScreen || key === '') return
    const timer = setTimeout(() => {
      for (const id of idsRef.current) {
        if (reported.has(id)) continue
        reported.add(id)
        trackEvent(id, 'view')
      }
    }, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [enabled, onScreen, key, trackEvent])
}
