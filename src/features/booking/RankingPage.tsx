import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useRankingCategoriesStore } from '@/store/rankingCategoriesStore'
import { useRankingStore } from '@/store/rankingStore'
import type { RankingEntry } from '@/types'

const MEDAL_COLORS = ['#FFD700', '#C7CBD1', '#CD7F32']

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6" strokeLinecap="round" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PodiumCard({ entry, place }: { entry: RankingEntry; place: number }) {
  const color = MEDAL_COLORS[place - 1]
  const isFirst = place === 1
  return (
    <div
      className={`flex flex-col items-center rounded-xl border bg-gray-900 p-4 ${
        isFirst ? 'border-primary-500/50 shadow-glow-sm' : 'border-gray-800'
      }`}
      style={isFirst ? { order: 0 } : { order: place === 2 ? -1 : 1 }}
    >
      <div className="relative">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-base font-bold text-gray-950"
          style={{ backgroundColor: color }}
        >
          {initials(entry.playerName)}
        </div>
        <span
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-gray-950"
          style={{ backgroundColor: color }}
        >
          {place}
        </span>
      </div>
      <p className="mt-2 max-w-full truncate text-sm font-medium text-gray-100">
        {entry.playerName}
      </p>
      <p className="text-base font-bold text-primary-500">{entry.totalPoints}</p>
    </div>
  )
}

export function RankingPage() {
  const venueName = useSettingsStore((s) => s.venueName)
  const categories = useRankingCategoriesStore((s) => s.categories)
  const entries = useRankingStore((s) => s.entries)
  const [searchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('cat')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [shared, setShared] = useState(false)

  const activeCategoryId = selectedCategoryId || categoryFromUrl || categories[0]?.id || ''
  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const activeCategoryName = activeCategory?.name ?? ''
  const categoryEntries = useMemo(
    () =>
      entries
        .filter((e) => e.categoryId === activeCategoryId)
        .sort((a, b) => b.totalPoints - a.totalPoints),
    [entries, activeCategoryId],
  )
  const podium = categoryEntries.slice(0, 3)
  const rest = categoryEntries.slice(3)

  async function handleShare() {
    const url = window.location.href
    const text = `Ranking${activeCategoryName ? ` - ${activeCategoryName}` : ''} de ${venueName}`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url })
      } catch {
        // user cancelled the native share sheet, nothing to do
      }
      return
    }
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
          <TrophyIcon />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
            Ranking
          </p>
          <h1 className="text-2xl font-semibold text-gray-50 sm:text-3xl">{venueName}</h1>
        </div>
      </div>

      {categories.length === 0 && (
        <p className="text-sm text-gray-500">Todavía no hay ranking cargado.</p>
      )}

      {categories.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategoryId(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                c.id === activeCategoryId
                  ? 'bg-primary-500 text-gray-950'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <>
          {activeCategory?.description && (
            <p className="mb-4 text-sm text-gray-400">
              {activeCategory.name} · {activeCategory.description}
            </p>
          )}
          {podium.length > 0 && (
            <div className="mb-6 grid grid-cols-3 items-end gap-3 sm:max-w-md">
              {podium.map((entry, i) => (
                <PodiumCard key={entry.id} entry={entry} place={i + 1} />
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-card sm:p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400">
                  <th className="pb-3 pr-3">Pos.</th>
                  <th className="pb-3 pr-3">Jugador</th>
                  <th className="pb-3 pr-3 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((entry, i) => (
                  <tr key={entry.id} className="border-t border-gray-800/60">
                    <td className="py-3 pr-3 font-semibold text-gray-500">{i + 4}</td>
                    <td className="py-3 pr-3 text-gray-100">{entry.playerName}</td>
                    <td className="py-3 pr-3 text-right font-semibold text-primary-500">
                      {entry.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categoryEntries.length === 0 && (
              <p className="text-sm text-gray-500">Todavía no hay resultados en esta categoría.</p>
            )}
          </div>

          {categoryEntries.length > 0 && (
            <button
              type="button"
              onClick={handleShare}
              className="mt-6 flex items-center justify-center gap-2 rounded-full bg-primary-500 px-6 py-3 text-sm font-medium text-gray-950 hover:bg-primary-400"
            >
              <ShareIcon />
              {shared ? 'Link copiado!' : 'Compartir ranking'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
