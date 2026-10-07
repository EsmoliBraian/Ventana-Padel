import { useMemo, useState } from 'react'
import { useAdsStore } from '@/store/adsStore'
import { shuffled } from '@/lib/ads'
import { AdCreative } from './AdCreative'
import { useAdViews, useOnScreen } from './useAdView'

// Franja "Nos acompañan": todos los anuncios de formato logo de la
// ubicacion, sin rotar, en orden al azar (se mezcla en cada visita).
export function SponsorStrip({ placement = 'nos_acompanan' }: { placement?: string }) {
  const visibleAds = useAdsStore((s) => s.visibleAds)
  const trackEvent = useAdsStore((s) => s.trackEvent)
  const idsKey = visibleAds
    .filter((ad) => ad.placement === placement && ad.format === 'logo')
    .map((ad) => ad.id)
    .join(',')
  // Se mezcla una vez por cada cambio de lista, no en cada render.
  const logos = useMemo(
    () => shuffled(visibleAds.filter((ad) => ad.placement === placement && ad.format === 'logo')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  )
  const [strip, setStrip] = useState<HTMLDivElement | null>(null)
  const onScreen = useOnScreen(strip)
  useAdViews(
    onScreen,
    logos.map((ad) => ad.id),
  )

  if (logos.length === 0) return null

  return (
    <aside aria-label="Publicidad" className="border-t border-gray-800/60 bg-gray-950">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-4 flex items-baseline gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">Nos acompañan</p>
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Publicidad</span>
        </div>
        <div ref={setStrip} className="scrollbar-hide -mx-5 flex gap-3 overflow-x-auto px-5 sm:flex-wrap sm:overflow-visible">
          {logos.map((ad) => (
            <AdCreative key={ad.id} ad={ad} onClick={() => trackEvent(ad.id, 'click')} />
          ))}
        </div>
      </div>
    </aside>
  )
}
