import { useEffect, useMemo, useState } from 'react'
import { useAdsStore } from '@/store/adsStore'
import { nextRound } from '@/lib/ads'
import { AdCreative } from './AdCreative'
import { useAdViews, useOnScreen } from './useAdView'

const ROTATE_MS = 5000

interface AdSlotProps {
  placement: string
  // Clases del contenedor (margenes, ancho). Solo existen si hay anuncio: sin
  // anuncio el componente no deja nada en la pagina, ni un hueco.
  className?: string
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Una ubicacion de publicidad del sitio. Muestra el anuncio activo de esa
// ubicacion; si hay varios, rotan cada 5 segundos en orden al azar.
export function AdSlot({ placement, className = '' }: AdSlotProps) {
  const visibleAds = useAdsStore((s) => s.visibleAds)
  const trackEvent = useAdsStore((s) => s.trackEvent)
  const ads = useMemo(
    () => visibleAds.filter((ad) => ad.placement === placement && ad.format !== 'logo'),
    [visibleAds, placement],
  )
  const idsKey = ads.map((ad) => ad.id).join(',')

  // Cola de la vuelta actual (orden al azar, distinto en cada visita) y por
  // cual va. Al terminar una vuelta se mezcla otra, sin repetir el ultimo.
  const [queue, setQueue] = useState<string[]>([])
  const [position, setPosition] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const onScreen = useOnScreen(container)
  const reducedMotion = useMemo(prefersReducedMotion, [])

  useEffect(() => {
    setQueue(nextRound(idsKey === '' ? [] : idsKey.split(','), undefined))
    setPosition(0)
  }, [idsKey])

  const currentId = queue[position]
  // Se pausa con el mouse encima o el dedo apoyado, y cuando no esta a la
  // vista (otra pestaña, o fuera de la pantalla).
  const rotating = queue.length > 1 && !hovering && onScreen

  useEffect(() => {
    if (!rotating) return
    const timer = setTimeout(() => {
      if (position + 1 < queue.length) {
        setPosition(position + 1)
      } else {
        setQueue(nextRound(queue, queue[position]))
        setPosition(0)
      }
    }, ROTATE_MS)
    return () => clearTimeout(timer)
  }, [rotating, position, queue])

  // Solo cuenta el anuncio que se esta mostrando, no los que esperan turno.
  useAdViews(onScreen, currentId ? [currentId] : [])

  if (ads.length === 0 || !currentId) return null

  return (
    <aside aria-label="Publicidad" className={className}>
      <div
        ref={setContainer}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onTouchStart={() => setHovering(true)}
        onTouchEnd={() => setHovering(false)}
        onTouchCancel={() => setHovering(false)}
        // Todos los anuncios van apilados en la misma celda: el contenedor
        // toma el alto del mas alto y no cambia al rotar (la pagina no salta).
        className="grid items-center"
      >
        {ads.map((ad) => {
          const current = ad.id === currentId
          return (
            <div
              key={ad.id}
              aria-hidden={!current}
              className={`col-start-1 row-start-1 ${ad.format === 'tarjeta' ? 'mx-auto w-full max-w-sm' : 'w-full'} ${
                reducedMotion ? '' : 'transition-opacity duration-500'
              } ${current ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <AdCreative ad={ad} hidden={!current} onClick={() => trackEvent(ad.id, 'click')} />
            </div>
          )
        })}
      </div>
    </aside>
  )
}
