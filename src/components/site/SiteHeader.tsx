import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useVenuePath } from '@/lib/venuePath'

const NAV_LINKS = [
  { to: '', label: 'Inicio', end: true },
  { to: '/blog', label: 'Blog', end: false },
  { to: '/torneos', label: 'Torneos', end: false },
  { to: '/ranking', label: 'Ranking', end: false },
]

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  )
}

export function SiteHeader() {
  const venueName = useSettingsStore((s) => s.venueName)
  const logoUrl = useSettingsStore((s) => s.logoUrl)
  const [menuOpen, setMenuOpen] = useState(false)
  const path = useVenuePath()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive ? 'text-primary-500' : 'text-gray-300 hover:text-gray-50'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to={path()} className="flex min-w-0 items-center gap-2.5" onClick={() => setMenuOpen(false)}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
          )}
          <span className="truncate text-base font-semibold text-gray-50">{venueName}</span>
        </Link>

        <nav className="hidden items-center gap-7 sm:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={path(link.to)} end={link.end} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={path('/reservar')}
            className="hidden shrink-0 rounded-full bg-primary-500 px-5 py-2 text-sm font-semibold text-gray-950 shadow-glow-sm hover:bg-primary-400 sm:block"
          >
            Reservar
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-800 text-gray-300 hover:bg-gray-900 sm:hidden"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-gray-800/60 bg-gray-950/95 px-5 py-4 sm:hidden">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={path(link.to)}
                end={link.end}
                onClick={() => setMenuOpen(false)}
                className={navClass}
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to={path('/reservar')}
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-primary-500 px-5 py-2.5 text-center text-sm font-semibold text-gray-950 hover:bg-primary-400"
            >
              Reservar
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
