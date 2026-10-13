import type { ReservationStatus } from '@/types'

const STYLES: Record<ReservationStatus, string> = {
  reservado: 'bg-warning-bg text-warning border border-warning-border/40',
  confirmado: 'bg-success-bg text-success border border-success-border/40',
  cancelado: 'bg-danger-bg text-danger border border-danger-border/40',
}

const LABELS: Record<ReservationStatus, string> = {
  reservado: 'Pendiente',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
}

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
