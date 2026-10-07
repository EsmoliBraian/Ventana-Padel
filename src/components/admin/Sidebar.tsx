import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { useAdminAuthStore } from '@/store/adminAuthStore'
import { useSalesStore } from '@/store/salesStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { todayKey } from '@/lib/format'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  badge?: 'openOrders' | 'pendingReservations'
}

interface NavGroup {
  label: string
  icon: string
  // Cada hijo lleva un punto de color en vez de icono.
  children: { to: string; label: string; dot: string }[]
}

type NavEntry = NavItem | NavGroup

const MENU: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', icon: 'fa-gauge', end: true },
  { to: '/admin/mostrador', label: 'Mostrador', icon: 'fa-cash-register', badge: 'openOrders' },
  { to: '/admin/reservas', label: 'Reservas', icon: 'fa-calendar-check', badge: 'pendingReservations' },
  { to: '/admin/horarios', label: 'Horarios', icon: 'fa-clock' },
  { to: '/admin/productos', label: 'Productos', icon: 'fa-cart-shopping' },
  { to: '/admin/ventas', label: 'Ventas del día', icon: 'fa-receipt' },
  { to: '/admin/metricas', label: 'Métricas', icon: 'fa-chart-line' },
  {
    label: 'Sitio público',
    icon: 'fa-globe',
    children: [
      { to: '/admin/slides', label: 'Blog / Novedades', dot: 'bg-brand-300' },
      { to: '/admin/torneos', label: 'Torneos', dot: 'bg-[#F78FB3]' },
      { to: '/admin/ranking', label: 'Ranking', dot: 'bg-danger-icon' },
    ],
  },
]

const OTHER: NavItem[] = [{ to: '/admin/configuracion', label: 'Configuración', icon: 'fa-gear' }]

const COLLAPSED_KEY = 'playxp.sidebar.collapsed'

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

// Etiqueta flotante que aparece al pasar el mouse cuando el menu esta plegado.
function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-100 shadow-card group-hover:block"
    >
      {label}
    </span>
  )
}

function Badge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-50 px-1.5 text-[11px] font-semibold text-gray-950 ${
        collapsed ? 'absolute -right-1 -top-1' : 'ml-auto'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SectionTitle({ title, collapsed }: { title: string; collapsed: boolean }) {
  return (
    <p
      className={`mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 ${
        collapsed ? 'text-center' : 'px-3'
      }`}
    >
      {title}
    </p>
  )
}

interface NavContentProps {
  collapsed: boolean
  onNavigate: () => void
  onToggleCollapsed?: () => void
}

function NavContent({ collapsed, onNavigate, onToggleCollapsed }: NavContentProps) {
  const venueName = useSettingsStore((s) => s.venueName)
  const logoUrl = useSettingsStore((s) => s.logoUrl)
  const logout = useAdminAuthStore((s) => s.logout)
  const location = useLocation()

  const openOrders = useSalesStore((s) => s.sales.filter((sale) => sale.status === 'en_curso').length)
  const today = todayKey()
  const pendingReservations = useReservationsStore(
    (s) => s.reservations.filter((r) => r.status === 'reservado' && r.date >= today).length,
  )
  const badges = { openOrders, pendingReservations }

  // Un grupo arranca abierto si alguna de sus pantallas es la actual.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const entry of MENU) {
      if (isGroup(entry)) initial[entry.label] = entry.children.some((c) => location.pathname.startsWith(c.to))
    }
    return initial
  })

  const itemClass = (isActive: boolean) =>
    `group relative flex items-center rounded-xl text-sm font-medium transition-colors duration-150 ${
      collapsed ? 'mx-auto h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5'
    } ${isActive ? 'bg-gray-800 text-gray-50' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'}`

  function renderItem(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        aria-label={item.label}
        className={({ isActive }) => itemClass(isActive)}
      >
        {({ isActive }) => (
          <>
            <i
              className={`fa-solid ${item.icon} w-5 text-center text-base ${
                isActive ? 'text-primary-500' : 'text-gray-500 group-hover:text-gray-300'
              }`}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {item.badge && <Badge count={badges[item.badge]} collapsed={collapsed} />}
            {collapsed && <Tooltip label={item.label} />}
          </>
        )}
      </NavLink>
    )
  }

  function renderGroup(group: NavGroup) {
    const hasActiveChild = group.children.some((c) => location.pathname.startsWith(c.to))
    const open = collapsed || (openGroups[group.label] ?? false)

    return (
      <div key={group.label}>
        {collapsed ? (
          <div role="img" aria-label={group.label} className={`${itemClass(hasActiveChild)} cursor-default`}>
            <i className={`fa-solid ${group.icon} w-5 text-center text-base ${hasActiveChild ? 'text-primary-500' : 'text-gray-500'}`} />
            <Tooltip label={group.label} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label]: !open }))}
            aria-expanded={open}
            className={`${itemClass(hasActiveChild && !open)} w-full`}
          >
            <i
              className={`fa-solid ${group.icon} w-5 text-center text-base ${
                hasActiveChild ? 'text-primary-500' : 'text-gray-500 group-hover:text-gray-300'
              }`}
            />
            <span className="truncate">{group.label}</span>
            <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} ml-auto text-[10px] text-gray-500`} />
          </button>
        )}

        {open && (
          <div className={collapsed ? 'mt-1 space-y-1' : 'mt-1 space-y-1 pl-4'}>
            {group.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                aria-label={child.label}
                className={({ isActive }) =>
                  `group relative flex items-center rounded-xl text-sm transition-colors duration-150 ${
                    collapsed ? 'mx-auto h-9 w-10 justify-center' : 'gap-3 px-3 py-2'
                  } ${
                    isActive
                      ? 'bg-gray-800 font-medium text-gray-50'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'
                  }`
                }
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${child.dot}`} />
                {!collapsed && <span className="truncate">{child.label}</span>}
                {collapsed && <Tooltip label={child.label} />}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={`flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between gap-2 px-2'}`}>
        <div className={`flex min-w-0 items-center gap-2.5 ${collapsed ? 'order-2' : ''}`}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-full bg-primary-500" />
          )}
          {!collapsed && <span className="truncate font-semibold text-gray-50">{venueName}</span>}
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
            title={collapsed ? 'Expandir menú' : 'Plegar menú'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-200"
          >
            <i className={`fa-solid fa-angles-${collapsed ? 'right' : 'left'} text-xs`} />
          </button>
        )}
      </div>

      <nav className="flex-1" aria-label="Menú principal">
        <SectionTitle title="Menú" collapsed={collapsed} />
        <div className="space-y-1">{MENU.map((entry) => (isGroup(entry) ? renderGroup(entry) : renderItem(entry)))}</div>

        <SectionTitle title="Otros" collapsed={collapsed} />
        <div className="space-y-1">
          {OTHER.map(renderItem)}
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className={`${itemClass(false)} ${collapsed ? '' : 'w-full'}`}
          >
            <i className="fa-solid fa-arrow-right-from-bracket w-5 text-center text-base text-gray-500 group-hover:text-gray-300" />
            {!collapsed && <span>Cerrar sesión</span>}
            {collapsed && <Tooltip label="Cerrar sesión" />}
          </button>
        </div>
      </nav>
    </>
  )
}

export function Sidebar() {
  const venueName = useSettingsStore((s) => s.venueName)
  const logoUrl = useSettingsStore((s) => s.logoUrl)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Plegado: solo iconos. Se recuerda en este navegador.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // Sin almacenamiento (modo privado): el menu igual funciona.
    }
  }, [collapsed])

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 p-4 lg:hidden">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="h-6 w-6 rounded-full bg-primary-500" />
          )}
          <span className="font-semibold text-gray-50">{venueName}</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-gray-300 hover:bg-gray-800"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="flex w-64 flex-col overflow-y-auto bg-gray-900 p-4">
            <NavContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="Cerrar menu"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/60"
          />
        </div>
      )}

      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-gray-800 bg-gray-900 py-4 transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-[4.5rem] px-2' : 'w-60 px-3'
        }`}
      >
        <NavContent
          collapsed={collapsed}
          onNavigate={() => {}}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />
      </aside>
    </>
  )
}
