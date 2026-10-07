import { useSettingsStore } from '@/store/settingsStore'
import { useTournamentsStore } from '@/store/tournamentsStore'
import { TournamentCard } from '@/components/TournamentCard'
import { AdSlot } from '@/components/site/ads/AdSlot'

export function TorneosPage() {
  const whatsappPhone = useSettingsStore((s) => s.whatsappPhone)
  const tournaments = useTournamentsStore((s) => s.tournaments)
    .filter((t) => t.published)
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">Torneos</p>
      <h1 className="mt-1 text-3xl font-semibold text-gray-50 sm:text-4xl">
        Todos los torneos
      </h1>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => (
          <TournamentCard key={t.id} tournament={t} whatsappPhone={whatsappPhone} />
        ))}
        <AdSlot placement="grillas" />
      </div>
      {tournaments.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No hay torneos programados por ahora.</p>
      )}
    </div>
  )
}
