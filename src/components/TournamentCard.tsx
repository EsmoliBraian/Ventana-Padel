import { formatLongDate, fromDateKey } from '@/lib/format'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import type { Tournament } from '@/types'

interface TournamentCardProps {
  tournament: Tournament
  whatsappPhone: string
}

export function TournamentCard({ tournament, whatsappPhone }: TournamentCardProps) {
  function handleInscribirse() {
    const message = `Hola! Quiero inscribirme al torneo "${tournament.name}" (${formatLongDate(fromDateKey(tournament.date))}). Quiero guardar un cupo.`
    window.open(buildWhatsAppLink(whatsappPhone, message), '_blank')
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-card">
      <div className="aspect-[16/10] w-full shrink-0 bg-gray-925">
        {tournament.imageUrl ? (
          <img src={tournament.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-700">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold text-primary-200">
          {formatLongDate(fromDateKey(tournament.date))}
        </p>
        <p className="mt-1 text-base font-semibold text-gray-50">{tournament.name}</p>
        {tournament.description && (
          <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-gray-400">
            {tournament.description}
          </p>
        )}
        <button
          type="button"
          onClick={handleInscribirse}
          className="mt-4 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-400"
        >
          Inscribirme
        </button>
      </div>
    </div>
  )
}
