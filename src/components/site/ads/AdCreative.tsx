import type { ReactNode } from 'react'
import { buildAdHref } from '@/lib/ads'
import type { Ad } from '@/types'

interface AdCreativeProps {
  ad: Pick<Ad, 'businessName' | 'imageUrl' | 'mobileImageUrl' | 'caption' | 'linkType' | 'linkValue' | 'format'>
  onClick?: () => void
  // Fuera de la rotacion (no visible): no se puede enfocar ni tocar.
  hidden?: boolean
  // Banner: 'auto' elige segun el ancho de la pantalla (lo normal). La vista
  // previa del panel fuerza una u otra para mostrar las dos a la vez.
  variant?: 'auto' | 'desktop' | 'mobile'
}

const BANNER_ASPECT = {
  auto: 'aspect-[2/1] sm:aspect-[4/1]',
  desktop: 'aspect-[4/1]',
  mobile: 'aspect-[2/1]',
}

function Label({ className = '' }: { className?: string }) {
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider ${className}`}>Publicidad</span>
  )
}

// Un anuncio, segun su formato. El enlace se arma con buildAdHref a partir
// del tipo y el valor; si no hay enlace valido, se muestra sin enlace.
export function AdCreative({ ad, onClick, hidden = false, variant = 'auto' }: AdCreativeProps) {
  const href = buildAdHref(ad)
  const alt = `Publicidad de ${ad.businessName}`

  function wrap(className: string, children: ReactNode) {
    if (!href) return <div className={className}>{children}</div>
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={onClick}
        tabIndex={hidden ? -1 : undefined}
        aria-label={`${ad.businessName} (publicidad, se abre en otra pestaña)`}
        className={`${className} transition-opacity hover:opacity-90`}
      >
        {children}
      </a>
    )
  }

  if (ad.format === 'logo') {
    return wrap(
      'flex h-20 w-36 shrink-0 items-center justify-center rounded-xl bg-gray-100 p-3',
      <img src={ad.imageUrl} alt={ad.businessName} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />,
    )
  }

  if (ad.format === 'tarjeta') {
    return wrap(
      'flex w-full flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-card',
      <>
        <div className="aspect-[4/3] w-full bg-gray-925">
          <img src={ad.imageUrl} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
        <div className="p-4">
          <Label className="text-gray-500" />
          <p className="mt-1 truncate text-base font-semibold text-gray-50">{ad.businessName}</p>
          {/* Siempre dos renglones de alto, haya o no texto: todas las
              tarjetas de una ubicacion miden lo mismo. */}
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-gray-400">{ad.caption}</p>
        </div>
      </>,
    )
  }

  // Banner: 4:1 en computadora y 2:1 en celular. El alto sale de la
  // proporcion del contenedor, no de la imagen: el lugar queda reservado
  // antes de que cargue y la pagina no salta.
  const mobileSrc = ad.mobileImageUrl || ad.imageUrl
  return wrap(
    `relative block w-full overflow-hidden rounded-xl bg-gray-900 ${BANNER_ASPECT[variant]}`,
    <>
      {variant !== 'auto' ? (
        <img src={variant === 'mobile' ? mobileSrc : ad.imageUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <picture className="block h-full w-full">
          {ad.mobileImageUrl && <source media="(max-width: 639px)" srcSet={ad.mobileImageUrl} />}
          <img src={ad.imageUrl} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </picture>
      )}
      <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5">
        <Label className="text-gray-200" />
      </span>
      {ad.caption && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-sm text-gray-100">
          {ad.caption}
        </span>
      )}
    </>,
  )
}
