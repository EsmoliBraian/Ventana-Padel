import type { PaymentLine } from '@/lib/payments'
import type { PaymentMethodOption } from '@/types'

interface PaymentLinesEditorProps {
  lines: PaymentLine[]
  methods: PaymentMethodOption[]
  onChange: (lines: PaymentLine[]) => void
}

// Lineas de pago: cada una con su medio y su monto, para que paguen varias
// personas o con varios medios. Se usa al cerrar un pedido y al cobrar un fiado.
export function PaymentLinesEditor({ lines, methods, onChange }: PaymentLinesEditorProps) {
  function update(index: number, patch: Partial<PaymentLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={line.method}
            onChange={(e) => update(i, { method: e.target.value })}
            aria-label={`Medio de pago ${i + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-mo-border bg-mo-surface-alt px-2 py-1.5 text-sm text-mo-text"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-mo-muted">$</span>
          <input
            value={line.amount}
            onChange={(e) => update(i, { amount: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            aria-label={`Monto ${i + 1}`}
            className="w-24 rounded-lg border border-mo-border bg-mo-surface-alt px-2 py-1.5 text-right text-sm text-mo-text"
          />
          <button
            type="button"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            disabled={lines.length === 1}
            aria-label={`Quitar pago ${i + 1}`}
            className="px-1 text-mo-muted hover:text-mo-danger disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, { method: methods[0]?.name ?? '', amount: '' }])}
        className="text-xs font-medium text-mo-accent hover:underline"
      >
        + Agregar otro pago
      </button>
    </div>
  )
}
