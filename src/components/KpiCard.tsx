import { themeColor } from '@/lib/theme'
interface KpiCardProps {
  label: string
  value: string
  delta?: string
  icon?: string
  accentColor?: string
}

export function KpiCard({ label, value, delta, icon, accentColor = themeColor('brand-light') }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{label}</p>
        {icon && (
          <i className={`fa-solid ${icon} text-sm`} style={{ color: accentColor }} />
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none text-gray-50 lg:text-[32px]">
          {value}
        </span>
        {delta && <span className="text-xs font-medium text-primary-200">{delta}</span>}
      </div>
    </div>
  )
}
