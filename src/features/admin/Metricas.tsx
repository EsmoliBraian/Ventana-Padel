import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSettingsStore } from '@/store/settingsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useSalesStore } from '@/store/salesStore'
import { useProductsStore } from '@/store/productsStore'
import { ChartCard } from '@/components/ChartCard'
import { reservationIdsWithAbsorbedFee } from '@/lib/salesRevenue'
import { formatCurrency, toDateKey, weekdayShort } from '@/lib/format'
import { methodColor, totalsByMethod } from '@/lib/payments'
import { usePaymentMethodsStore } from '@/store/paymentMethodsStore'
const OCCUPANCY_COLORS = ['#B8FF3B', '#2A2C31']

export function Metricas() {
  const settings = useSettingsStore()
  const courts = useCourtsStore((s) => s.courts)
  const reservations = useReservationsStore((s) => s.reservations)
  const sales = useSalesStore((s) => s.sales)
  const products = useProductsStore((s) => s.products)

  const feeAbsorbedReservationIds = useMemo(() => reservationIdsWithAbsorbedFee(sales), [sales])

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const date = toDateKey(d)
      const reservationsTotal = reservations
        .filter(
          (r) => r.date === date && r.status !== 'cancelado' && !feeAbsorbedReservationIds.has(r.id),
        )
        .reduce((sum, r) => sum + r.priceTotal, 0)
      const salesTotal = sales
        .filter((s) => s.date === date && s.paymentStatus === 'pagado')
        .reduce((sum, s) => sum + s.total, 0)
      return { label: weekdayShort(d), total: reservationsTotal + salesTotal }
    })
  }, [reservations, sales, feeAbsorbedReservationIds])

  const ingresos7dias = last7Days.reduce((sum, d) => sum + d.total, 0)

  const today = toDateKey(new Date())
  const occupancyData = useMemo(() => {
    const totalSlots = courts.length * (settings.closeHour - settings.openHour)
    const bookedSlots = reservations.filter(
      (r) => r.date === today && r.status !== 'cancelado',
    ).length
    const pct = totalSlots === 0 ? 0 : Math.round((bookedSlots / totalSlots) * 100)
    return { pct, data: [{ name: 'Ocupado', value: pct }, { name: 'Libre', value: 100 - pct }] }
  }, [settings, courts, reservations, today])

  const topProducts = useMemo(() => {
    const qtyByProduct = new Map<string, number>()
    for (const sale of sales) {
      for (const item of sale.items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty)
      }
    }
    return products
      .map((p) => ({ name: p.name, qty: qtyByProduct.get(p.id) ?? 0 }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 4)
  }, [sales, products])

  const paymentMethods = usePaymentMethodsStore((s) => s.methods)
  const paymentBreakdown = useMemo(() => {
    // Por linea de pago: una venta cobrada con dos medios suma en los dos.
    const totals = totalsByMethod(sales, paymentMethods.map((m) => m.name)).filter((t) => t.total > 0)
    const grandTotal = totals.reduce((sum, t) => sum + t.total, 0)
    return totals.map((t) => ({
      method: t.key,
      label: t.label,
      value: t.total,
      pct: grandTotal === 0 ? 0 : Math.round((t.total / grandTotal) * 100),
    }))
  }, [sales, paymentMethods])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-50">Métricas y reportes</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={`Ingresos (últimos 7 días) — ${formatCurrency(ingresos7dias)}`}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={last7Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#383A40" />
              <XAxis dataKey="label" stroke="#94979E" fontSize={12} />
              <YAxis stroke="#94979E" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#222325', border: '1px solid #393B42' }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#B8FF3B"
                fill="#B8FF3B"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Ocupación — ${occupancyData.pct}%`}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={occupancyData.data}
                dataKey="value"
                innerRadius={50}
                outerRadius={80}
                startAngle={90}
                endAngle={-270}
              >
                {occupancyData.data.map((entry, index) => (
                  <Cell key={entry.name} fill={OCCUPANCY_COLORS[index]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#222325', border: '1px solid #393B42' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Productos más vendidos">
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  {i + 1}. {p.name}
                </span>
                <span className="text-gray-100">{p.qty}</span>
              </div>
            ))}
            {topProducts.every((p) => p.qty === 0) && (
              <p className="text-sm text-gray-500">Sin ventas registradas todavía.</p>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Métodos de pago">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={paymentBreakdown} dataKey="value" innerRadius={40} outerRadius={70}>
                  {paymentBreakdown.map((entry) => (
                    <Cell key={entry.method} fill={methodColor(entry.method)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#222325', border: '1px solid #393B42' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 text-sm">
              {paymentBreakdown.map((entry) => (
                <div key={entry.method} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: methodColor(entry.method) }}
                  />
                  <span className="text-gray-300">{entry.label}</span>
                  <span className="text-gray-500">{entry.pct}%</span>
                </div>
              ))}
              {paymentBreakdown.length === 0 && (
                <p className="text-gray-500">Sin ventas registradas todavía.</p>
              )}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
