import { useSettingsStore } from '@/store/settingsStore'
import { buildWhatsAppLink } from '@/lib/whatsapp'

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.06-1.36A10 10 0 1 0 12 2Zm0 18.2a8.17 8.17 0 0 1-4.17-1.14l-.3-.18-3 .8.8-2.93-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.24-.12-1.44-.71-1.67-.8-.22-.08-.38-.12-.55.12-.16.24-.63.8-.77.96-.14.16-.28.18-.52.06-.24-.12-1-.37-1.92-1.18-.71-.63-1.19-1.42-1.33-1.66-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  )
}

export function SiteFooter() {
  const venueName = useSettingsStore((s) => s.venueName)
  const whatsappPhone = useSettingsStore((s) => s.whatsappPhone)
  const address = useSettingsStore((s) => s.address)
  const instagramUrl = useSettingsStore((s) => s.instagramUrl)

  const whatsappLink = whatsappPhone
    ? buildWhatsAppLink(whatsappPhone, `Hola! Quiero más información sobre ${venueName}.`)
    : null

  return (
    <footer className="border-t border-gray-800/60 bg-gray-950">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-base font-semibold text-gray-50">{venueName}</p>
            {address && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-400">
                <PinIcon />
                {address}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-800 text-gray-300 hover:border-primary-500 hover:text-primary-500"
              >
                <WhatsAppIcon />
              </a>
            )}
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-800 text-gray-300 hover:border-primary-500 hover:text-primary-500"
              >
                <InstagramIcon />
              </a>
            )}
          </div>
        </div>

        <p className="mt-8 text-xs text-gray-600">
          &copy; {new Date().getFullYear()} {venueName}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  )
}
