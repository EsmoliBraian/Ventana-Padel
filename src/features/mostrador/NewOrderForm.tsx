import { useMemo, useState } from 'react'
import { useSalesStore } from '@/store/salesStore'
import { ErrorText } from '@/components/ErrorText'
import { turnoLabel, type Turno } from '@/lib/orders'

interface NewOrderFormProps {
  turnos: Turno[]
  presetTurnoKey?: string
  onCreated: (saleId: string) => void
  onBack: () => void
}

const FIELD_CLASS =
  'mt-1 w-full rounded-lg border border-mo-border bg-mo-surface-alt px-3 py-2 text-sm text-mo-text'

// Paso 1: nuevo pedido. Se asigna a un turno del dia o queda suelto (con un
// nombre opcional). El cantinero es opcional y recuerda los nombres usados.
export function NewOrderForm({ turnos, presetTurnoKey, onCreated, onBack }: NewOrderFormProps) {
  const createOrder = useSalesStore((s) => s.createOrder)
  const sales = useSalesStore((s) => s.sales)

  const [turnoKey, setTurnoKey] = useState(presetTurnoKey ?? '')
  const [customerName, setCustomerName] = useState('')
  const [cantinero, setCantinero] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const knownCantineros = useMemo(() => {
    const names = new Set<string>()
    for (const sale of sales) if (sale.cantinero) names.add(sale.cantinero)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [sales])

  async function handleCreate() {
    const turno = turnos.find((t) => t.key === turnoKey)
    setCreating(true)
    const { id, error: createError } = await createOrder({
      reservationId: turno?.reservationId,
      fixedSlotId: turno?.fixedSlotId,
      customerName: turno ? undefined : customerName,
      cantinero,
      comment,
    })
    setCreating(false)
    if (createError || !id) {
      setError(createError ?? 'No se pudo crear el pedido.')
      return
    }
    onCreated(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 bg-mo-accent px-4 py-3 text-mo-accent-contrast">
        <button type="button" onClick={onBack} aria-label="Volver a la lista" className="text-lg leading-none lg:hidden">
          ←
        </button>
        <h2 className="text-sm font-bold uppercase tracking-wide">Nuevo pedido</h2>
      </div>

      <div className="space-y-3 p-4">
        <label className="block text-sm text-mo-muted">
          Turno
          <select value={turnoKey} onChange={(e) => setTurnoKey(e.target.value)} className={FIELD_CLASS}>
            <option value="">Sin turno (venta suelta)</option>
            {turnos.map((t) => (
              <option key={t.key} value={t.key}>
                {turnoLabel(t)}
              </option>
            ))}
          </select>
        </label>

        {turnoKey === '' && (
          <label className="block text-sm text-mo-muted">
            Nombre (opcional)
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Para quién es el pedido"
              className={FIELD_CLASS}
            />
          </label>
        )}

        <label className="block text-sm text-mo-muted">
          Cantinero (opcional)
          <input
            value={cantinero}
            onChange={(e) => setCantinero(e.target.value)}
            list="mostrador-cantineros"
            placeholder="Quién atiende"
            className={FIELD_CLASS}
          />
          <datalist id="mostrador-cantineros">
            {knownCantineros.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm text-mo-muted">
          Comentario (opcional)
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={FIELD_CLASS} />
        </label>

        <ErrorText error={error} />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-mo-accent px-8 py-2 text-sm font-semibold text-mo-accent-contrast hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
