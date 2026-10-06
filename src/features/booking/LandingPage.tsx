import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useTournamentsStore } from '@/store/tournamentsStore'
import { useSlidesStore } from '@/store/slidesStore'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import { TournamentCard } from '@/components/TournamentCard'
import { BlogPostCard } from '@/components/BlogPostCard'
import { PadelHeroBackground } from '@/components/site/PadelHeroBackground'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { useVenuePath } from '@/lib/venuePath'

const MEDAL_COLORS = ['#FFD700', '#C7CBD1', '#CD7F32']

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.06-1.36A10 10 0 1 0 12 2Zm0 18.2a8.17 8.17 0 0 1-4.17-1.14l-.3-.18-3 .8.8-2.93-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.24-.12-1.44-.71-1.67-.8-.22-.08-.38-.12-.55.12-.16.24-.63.8-.77.96-.14.16-.28.18-.52.06-.24-.12-1-.37-1.92-1.18-.71-.63-1.19-1.42-1.33-1.66-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  )
}

function SectionHeading({
  eyebrow,
  title,
  cta,
}: {
  eyebrow: string
  title: string
  cta?: { to: string; label: string }
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-50 sm:text-3xl">{title}</h2>
      </div>
      {cta && (
        <Link
          to={cta.to}
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary-500 hover:underline sm:flex"
        >
          {cta.label} <ArrowIcon />
        </Link>
      )}
    </div>
  )
}

export function LandingPage() {
  const venueName = useSettingsStore((s) => s.venueName)
  const whatsappPhone = useSettingsStore((s) => s.whatsappPhone)
  const about = useSettingsStore((s) => s.about)
  const address = useSettingsStore((s) => s.address)
  const openHour = useSettingsStore((s) => s.openHour)
  const closeHour = useSettingsStore((s) => s.closeHour)
  const courts = useCourtsStore((s) => s.courts)
  const tournaments = useTournamentsStore((s) => s.tournaments).filter((t) => t.published)
  const slides = useSlidesStore((s) => s.slides).filter((s) => s.published)
  const rankingCategories = useRankingCategoriesStore((s) => s.categories)
  const rankingEntries = useRankingStore((s) => s.entries)
  const path = useVenuePath()

  const sortedSlides = useMemo(() => [...slides].sort((a, b) => a.order - b.order), [slides])
  const latestPosts = sortedSlides.slice(0, 3)

  const upcomingTournaments = useMemo(
    () => [...tournaments].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3),
    [tournaments],
  )

  const whatsappLink = whatsappPhone
    ? buildWhatsAppLink(whatsappPhone, `Hola! Quiero mas informacion sobre ${venueName}.`)
    : null
  const mapsLink = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null

  return (
    <div>
      {/* Hero */}
      <section className="relative flex min-h-[560px] items-end overflow-hidden sm:min-h-[640px]">
        <PadelHeroBackground />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-500">
            {venueName}
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-gray-50 sm:text-5xl">
            Tu cancha de padel, lista cuando quieras
          </h1>
          <p className="mt-4 max-w-xl text-base text-gray-300 sm:text-lg">
            Reserva tu turno en segundos y confirmalo directo por WhatsApp.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={path('/reservar')}
              className="rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-gray-950 shadow-glow-primary hover:bg-primary-400"
            >
              Reservar cancha
            </Link>
            <Link
              to={path('/ranking')}
              className="rounded-full border border-gray-700 bg-gray-950/40 px-6 py-3 text-sm font-medium text-gray-100 hover:bg-gray-900"
            >
              Ver ranking
            </Link>
          </div>
        </div>
      </section>

      {/* Sobre el club */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="grid gap-10 sm:grid-cols-[1.3fr_1fr] sm:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
              Sobre el club
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-gray-50 sm:text-3xl">{venueName}</h2>
            <p className="mt-4 text-base leading-relaxed text-gray-400">
              {about ||
                'Canchas de primera calidad, buena iluminacion y el mejor ambiente para jugar al padel con amigos.'}
            </p>
            {address && (
              <p className="mt-5 flex items-center gap-2 text-sm text-gray-400">
                <PinIcon />
                {address}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-1">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-2xl font-bold text-primary-500">{courts.length}</p>
              <p className="mt-1 text-sm text-gray-400">
                {courts.length === 1 ? 'Cancha disponible' : 'Canchas disponibles'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-2xl font-bold text-primary-500">
                {openHour}:00 - {closeHour}:00
              </p>
              <p className="mt-1 text-sm text-gray-400">Horario de atencion</p>
            </div>
          </div>
        </div>
      </section>

      {/* Blog */}
      {latestPosts.length > 0 && (
        <section className="border-t border-gray-800/60 bg-gray-925/40">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <SectionHeading eyebrow="Blog" title="Lo ultimo del club" cta={{ to: path('/blog'), label: 'Ver todos' }} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latestPosts.map((post) => (
                <BlogPostCard key={post.id} post={post} />
              ))}
            </div>
            <Link
              to={path('/blog')}
              className="mt-6 flex items-center gap-1 text-sm font-medium text-primary-500 hover:underline sm:hidden"
            >
              Ver todos los posts <ArrowIcon />
            </Link>
          </div>
        </section>
      )}

      {/* Torneos */}
      {upcomingTournaments.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Torneos"
            title="Proximos torneos"
            cta={{ to: path('/torneos'), label: 'Ver todos' }}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingTournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} whatsappPhone={whatsappPhone} />
            ))}
          </div>
          <Link
            to={path('/torneos')}
            className="mt-6 flex items-center gap-1 text-sm font-medium text-primary-500 hover:underline sm:hidden"
          >
            Ver todos los torneos <ArrowIcon />
          </Link>
        </section>
      )}

      {/* Ranking */}
      {rankingCategories.length > 0 && (
        <section className="border-t border-gray-800/60 bg-gray-925/40">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <SectionHeading eyebrow="Ranking" title="Nuestras categorias" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rankingCategories.map((category) => {
                const top = rankingEntries
                  .filter((e) => e.categoryId === category.id)
                  .sort((a, b) => b.totalPoints - a.totalPoints)
                  .slice(0, 3)
                return (
                  <Link
                    key={category.id}
                    to={path(`/ranking?cat=${category.id}`)}
                    className="group flex flex-col rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-card transition-colors hover:border-primary-500/50"
                  >
                    <p className="text-base font-semibold text-gray-50">{category.name}</p>

                    <div className="mt-4 flex-1 space-y-2.5">
                      {top.length > 0 ? (
                        top.map((entry, i) => (
                          <div key={entry.id} className="flex items-center justify-between text-sm">
                            <span className="flex min-w-0 items-center gap-2 text-gray-300">
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-gray-950"
                                style={{ backgroundColor: MEDAL_COLORS[i] }}
                              >
                                {i + 1}
                              </span>
                              <span className="truncate">{entry.playerName}</span>
                            </span>
                            <span className="shrink-0 font-semibold text-primary-500">
                              {entry.totalPoints}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">Sin resultados todavia.</p>
                      )}
                    </div>

                    <span className="mt-5 flex items-center gap-1 text-sm font-medium text-primary-500">
                      Ver tabla completa <ArrowIcon />
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Contacto */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 sm:p-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
                Contacto
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-50 sm:text-3xl">
                Te esperamos en {venueName}
              </h2>
              {address && (
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                  <PinIcon />
                  {address}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-full bg-success px-6 py-3 text-sm font-semibold text-gray-950 hover:bg-success/90"
                >
                  <WhatsAppIcon />
                  Escribinos
                </a>
              )}
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-full border border-gray-700 px-6 py-3 text-sm font-medium text-gray-100 hover:bg-gray-800"
                >
                  <PinIcon />
                  Como llegar
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
