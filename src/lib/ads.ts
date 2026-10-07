import { fromDateKey, todayKey } from '@/lib/format'
import type { Ad, AdFormat, AdLinkType, OwnerAd } from '@/types'

// ---------- Formatos ----------

export interface AdFormatInfo {
  id: AdFormat
  label: string
  description: string
  size: string // tamaño recomendado de la imagen
  mobileSize?: string // tamaño recomendado de la imagen para celular
}

export const AD_FORMATS: AdFormatInfo[] = [
  {
    id: 'banner',
    label: 'Banner ancho',
    description: 'Una franja a todo el ancho de la página.',
    size: '1200 × 300 px',
    mobileSize: '800 × 400 px',
  },
  {
    id: 'tarjeta',
    label: 'Tarjeta',
    description: 'Imagen con el nombre del comercio y un texto corto.',
    size: '800 × 600 px',
  },
  {
    id: 'logo',
    label: 'Logo',
    description: 'El logo del comercio en la franja "Nos acompañan".',
    size: '400 × 400 px, PNG con fondo transparente',
  },
]

export function adFormatInfo(format: AdFormat): AdFormatInfo {
  return AD_FORMATS.find((f) => f.id === format) ?? AD_FORMATS[0]
}

// ---------- Ubicaciones ----------

// Lugares del sitio publico donde puede ir un anuncio. Para sumar una
// ubicacion alcanza con agregar una entrada aca (con su zona en el esquema)
// y poner <AdSlot placement="clave" /> donde corresponda: no hay que tocar
// la base ni el panel.
export interface AdPlacement {
  key: string
  label: string
  where: string
  formats: AdFormat[]
  // Zona en el esquema del panel (PlacementDiagram): que pantalla y que
  // rectangulo, en una grilla de 100 x 100.
  diagram: { screen: 'inicio' | 'reserva'; x: number; y: number; w: number; h: number }
}

export const AD_PLACEMENTS: AdPlacement[] = [
  {
    key: 'bajo_portada',
    label: 'Debajo de la portada',
    where: 'Inicio, entre la portada y "Sobre nosotros".',
    formats: ['banner'],
    diagram: { screen: 'inicio', x: 8, y: 31, w: 84, h: 8 },
  },
  {
    key: 'grillas',
    label: 'En novedades y torneos',
    where: 'Junto a las tarjetas de novedades y de torneos, en el inicio y en sus páginas.',
    formats: ['tarjeta'],
    diagram: { screen: 'inicio', x: 64, y: 54, w: 28, h: 12 },
  },
  {
    key: 'entre_secciones',
    label: 'Entre secciones',
    where: 'Inicio, antes de "Contacto".',
    formats: ['banner', 'tarjeta'],
    diagram: { screen: 'inicio', x: 8, y: 69, w: 84, h: 8 },
  },
  {
    key: 'nos_acompanan',
    label: 'Nos acompañan',
    where: 'Franja de logos antes del pie, en todas las páginas.',
    formats: ['logo'],
    diagram: { screen: 'inicio', x: 8, y: 88, w: 84, h: 6 },
  },
  {
    key: 'despues_de_reservar',
    label: 'Después de reservar',
    where: 'Pantalla de reserva confirmada, debajo del botón de WhatsApp.',
    formats: ['tarjeta', 'banner'],
    diagram: { screen: 'reserva', x: 20, y: 58, w: 60, h: 26 },
  },
]

export function adPlacement(key: string): AdPlacement | undefined {
  return AD_PLACEMENTS.find((p) => p.key === key)
}

export function placementsForFormat(format: AdFormat): AdPlacement[] {
  return AD_PLACEMENTS.filter((p) => p.formats.includes(format))
}

// ---------- Enlaces ----------

export const AD_LINK_TYPES: { id: AdLinkType; label: string; placeholder: string; help: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', placeholder: '5491122334455', help: 'Solo números, con código de país y sin +.' },
  { id: 'instagram', label: 'Instagram', placeholder: 'nombredelcomercio', help: 'Solo el usuario, sin @.' },
  { id: 'web', label: 'Sitio web', placeholder: 'https://www.comercio.com', help: 'La dirección completa, empezando con https://.' },
]

// Mismos formatos que exige la base (constraint ads_link_check).
const LINK_PATTERNS: Record<AdLinkType, RegExp> = {
  whatsapp: /^[0-9]{8,15}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  web: /^https?:\/\/\S+$/i,
}

// Deja el valor como lo espera la base: sin espacios, sin + ni @.
export function normalizeLinkValue(type: AdLinkType, raw: string): string {
  const value = raw.trim()
  if (type === 'whatsapp') return value.replace(/\D/g, '')
  if (type === 'instagram') return value.replace(/^@/, '')
  return value
}

export function isValidLinkValue(type: AdLinkType, value: string): boolean {
  return LINK_PATTERNS[type].test(value) && (type !== 'web' || value.length <= 300)
}

// La URL a la que lleva un anuncio. Se arma SIEMPRE aca a partir del tipo y
// el valor, con un prefijo fijo: el valor guardado nunca va directo a un
// href. Devuelve null si el dato no tiene el formato esperado (por ejemplo,
// algo que no sea http/https), y entonces el anuncio se muestra sin enlace.
export function buildAdHref(ad: Pick<Ad, 'linkType' | 'linkValue'>): string | null {
  const { linkType, linkValue } = ad
  if (!linkType || !linkValue || !isValidLinkValue(linkType, linkValue)) return null
  if (linkType === 'whatsapp') return `https://wa.me/${linkValue}`
  if (linkType === 'instagram') return `https://www.instagram.com/${encodeURIComponent(linkValue)}/`
  try {
    const url = new URL(linkValue)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

// ---------- Estado y avisos ----------

export type AdStatus = 'activo' | 'pausado' | 'vencido' | 'programado'

export function adStatus(ad: Pick<Ad, 'active' | 'startsOn' | 'endsOn'>, today: string = todayKey()): AdStatus {
  if (ad.endsOn && ad.endsOn < today) return 'vencido'
  if (!ad.active) return 'pausado'
  if (ad.startsOn > today) return 'programado'
  return 'activo'
}

function daysBetween(from: string, to: string): number {
  return Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / 86_400_000)
}

export const AD_WARNING_DAYS = 7

export interface AdAlert {
  adId: string
  kind: 'vence' | 'pago' | 'pago_vencido'
  text: string
}

// Avisos de un anuncio: esta por vencer, o tiene un pago cerca o atrasado.
export function adAlerts(ad: OwnerAd, today: string = todayKey()): AdAlert[] {
  const alerts: AdAlert[] = []
  const status = adStatus(ad, today)
  if (status === 'vencido') return alerts

  if (ad.endsOn) {
    const days = daysBetween(today, ad.endsOn)
    if (days <= AD_WARNING_DAYS) {
      alerts.push({
        adId: ad.id,
        kind: 'vence',
        text: days === 0 ? `${ad.businessName} vence hoy.` : `${ad.businessName} vence en ${days} ${days === 1 ? 'día' : 'días'}.`,
      })
    }
  }
  if (ad.nextPaymentOn) {
    const days = daysBetween(today, ad.nextPaymentOn)
    if (days < 0) {
      alerts.push({ adId: ad.id, kind: 'pago_vencido', text: `${ad.businessName} tiene el pago atrasado.` })
    } else if (days <= AD_WARNING_DAYS) {
      alerts.push({
        adId: ad.id,
        kind: 'pago',
        text: days === 0 ? `${ad.businessName} paga hoy.` : `${ad.businessName} paga en ${days} ${days === 1 ? 'día' : 'días'}.`,
      })
    }
  }
  return alerts
}

// Anuncio sin fecha de fin ni de proximo pago: nunca va a generar un aviso.
export function adHasNoReminder(ad: OwnerAd, today: string = todayKey()): boolean {
  return adStatus(ad, today) !== 'vencido' && !ad.endsOn && !ad.nextPaymentOn
}

// ---------- Rotacion ----------

// Mezcla al azar (Fisher-Yates) sin tocar la lista original.
export function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Siguiente tanda de una rotacion: orden al azar, y si el primero coincide
// con el que se acaba de mostrar se lo corre, para no repetirlo dos veces
// seguidas al empalmar una vuelta con la otra.
export function nextRound<T>(items: T[], last: T | undefined): T[] {
  const round = shuffled(items)
  if (round.length > 1 && last !== undefined && round[0] === last) {
    round.push(round.shift() as T)
  }
  return round
}
