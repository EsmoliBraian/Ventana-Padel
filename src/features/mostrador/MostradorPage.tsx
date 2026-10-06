import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSalesStore } from '@/store/salesStore'
import { useReservationsStore } from '@/store/reservationsStore'
import { useFixedSlotsStore } from '@/store/fixedSlotsStore'
import { useCourtsStore } from '@/store/courtsStore'
import { buildTurnos, byNumber, orderOwnerLabel, ordersOfTurno, turnoKeyOfSale } from '@/lib/orders'
import { OrdersTable } from './OrdersTable'
import { TurnosList } from './TurnosList'
import { NewOrderForm } from './NewOrderForm'
import { OrderPanel, type PendingItem } from './OrderPanel'

type Tab = 'turnos' | 'mostrador'

// Que muestra el panel derecho: el formulario de pedido nuevo o un pedido.
type PanelState = { kind: 'new'; turnoKey?: string } | { kind: 'order'; saleId: string }

const CLOSED_SHOWN = 5

export function MostradorPage() {
  const sales = useSalesStore((s) => s.sales)
  const reservations = useReservationsStore((s) => s.reservations)
  const fixedSlots = useFixedSlotsStore((s) => s.fixedSlots)
  const courts = useCourtsStore((s) => s.courts)
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('mostrador')
  const [panel, setPanel] = useState<PanelState>({ kind: 'new' })
  // En celular el panel se abre encima de la lista.
  const [panelOpenOnMobile, setPanelOpenOnMobile] = useState(false)
  // Productos sin confirmar de cada pedido: se conservan al cambiar de pedido.
  const [pendingByOrder, setPendingByOrder] = useState<Record<string, PendingItem[]>>({})

  const turnos = useMemo(
    () => buildTurnos(reservations, fixedSlots, courts, sales),
    [reservations, fixedSlots, courts, sales],
  )

  const looseOrders = useMemo(() => sales.filter((s) => turnoKeyOfSale(s) === null), [sales])
  const looseOpen = useMemo(
    () => looseOrders.filter((s) => s.status === 'en_curso').sort(byNumber),
    [looseOrders],
  )
  const looseClosed = useMemo(
    () =>
      looseOrders
        .filter((s) => s.status === 'cerrada')
        .sort((a, b) => byNumber(b, a))
        .slice(0, CLOSED_SHOWN),
    [looseOrders],
  )
  const openCount = sales.filter((s) => s.status === 'en_curso').length
  const turnoOpenCount = openCount - looseOpen.length

  // Llegada desde el Dashboard: ?turno=<reserva> o ?fijo=<turno fijo> abre el
  // pedido en curso de ese turno, o el formulario para crearlo.
  useEffect(() => {
    const reservationId = searchParams.get('turno')
    const fixedSlotId = searchParams.get('fijo')
    if (!reservationId && !fixedSlotId) return
    const turnoKey = reservationId ? `r:${reservationId}` : `f:${fixedSlotId}`
    const turno = turnos.find((t) => t.key === turnoKey)
    const existing = turno ? ordersOfTurno(turno, sales).find((s) => s.status === 'en_curso') : undefined
    setTab('turnos')
    setPanel(existing ? { kind: 'order', saleId: existing.id } : { kind: 'new', turnoKey })
    setPanelOpenOnMobile(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, turnos, sales])

  const selectedSale = panel.kind === 'order' ? sales.find((s) => s.id === panel.saleId) : undefined
  const selectedId = selectedSale?.id ?? null
  const selectedTurno = selectedSale ? turnos.find((t) => t.key === turnoKeyOfSale(selectedSale)) : undefined

  function selectOrder(saleId: string) {
    setPanel({ kind: 'order', saleId })
    setPanelOpenOnMobile(true)
  }

  function openNew(turnoKey?: string) {
    setPanel({ kind: 'new', turnoKey })
    setPanelOpenOnMobile(true)
  }

  function handleCreated(saleId: string) {
    const created = useSalesStore.getState().sales.find((s) => s.id === saleId)
    setTab(created && turnoKeyOfSale(created) ? 'turnos' : 'mostrador')
    selectOrder(saleId)
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold ${active ? 'bg-mo-surface text-mo-text' : 'text-mo-muted hover:text-mo-text'}`

  return (
    <div className="-mx-4 -mb-4 flex min-h-[calc(100vh-6rem)] flex-col bg-mo-bg lg:-mx-6 lg:-mb-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex items-end bg-mo-header/60 px-2 pt-2" role="tablist" aria-label="Tipo de pedido">
          <button type="button" role="tab" aria-selected={tab === 'turnos'} onClick={() => setTab('turnos')} className={tabClass(tab === 'turnos')}>
            Turnos{turnoOpenCount > 0 ? ` (${turnoOpenCount})` : ''}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'mostrador'} onClick={() => setTab('mostrador')} className={tabClass(tab === 'mostrador')}>
            Mostrador{looseOpen.length > 0 ? ` (${looseOpen.length})` : ''}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 bg-mo-header px-4 py-3">
          <h1 className="text-base font-bold uppercase tracking-wide text-mo-text">
            {tab === 'turnos' ? 'Turnos' : 'Mostrador'}
          </h1>
          <button
            type="button"
            onClick={() => openNew()}
            className="rounded-lg bg-mo-bg px-4 py-2 text-sm font-semibold text-mo-text hover:bg-mo-surface-alt"
          >
            + Nuevo pedido
          </button>
        </div>

        <div className="space-y-6 p-4">
          {tab === 'turnos' ? (
            <TurnosList
              turnos={turnos}
              sales={sales}
              selectedId={selectedId}
              onSelect={selectOrder}
              onNewOrder={(turnoKey) => openNew(turnoKey)}
            />
          ) : (
            <>
              <OrdersTable
                title="En curso"
                orders={looseOpen}
                selectedId={selectedId}
                emptyText="Sin ventas en curso."
                ownerHeader="Cliente"
                ownerLabel={(sale) => orderOwnerLabel(sale, turnos)}
                onSelect={selectOrder}
              />
              <OrdersTable
                title={`Cerradas (últimas ${CLOSED_SHOWN})`}
                orders={looseClosed}
                selectedId={selectedId}
                emptyText="Todavía no hay ventas cerradas."
                ownerHeader="Cliente"
                ownerLabel={(sale) => orderOwnerLabel(sale, turnos)}
                onSelect={selectOrder}
              />
            </>
          )}
        </div>
      </div>

      <aside
        aria-label="Pedido seleccionado"
        className={`bg-mo-surface lg:static lg:block lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-mo-border ${
          panelOpenOnMobile ? 'fixed inset-0 z-40 overflow-y-auto' : 'hidden'
        }`}
      >
        <div className="h-full">
          {panel.kind === 'order' && selectedSale ? (
            <OrderPanel
              key={selectedSale.id}
              sale={selectedSale}
              turno={selectedTurno}
              turnoOrders={selectedTurno ? ordersOfTurno(selectedTurno, sales) : []}
              pending={pendingByOrder[selectedSale.id] ?? []}
              onPendingChange={(items) => setPendingByOrder((prev) => ({ ...prev, [selectedSale.id]: items }))}
              onBack={() => setPanelOpenOnMobile(false)}
              onVoided={() => {
                setPanel({ kind: 'new' })
                setPanelOpenOnMobile(false)
              }}
            />
          ) : panel.kind === 'order' ? (
            <div className="p-6 text-sm text-mo-muted">
              <p>Este pedido ya no existe: se anuló desde otro dispositivo.</p>
              <button type="button" onClick={() => openNew()} className="mt-3 text-mo-accent hover:underline">
                Crear un pedido nuevo
              </button>
            </div>
          ) : (
            <NewOrderForm
              key={panel.kind === 'new' ? (panel.turnoKey ?? 'suelto') : 'nuevo'}
              turnos={turnos}
              presetTurnoKey={panel.kind === 'new' ? panel.turnoKey : undefined}
              onCreated={handleCreated}
              onBack={() => setPanelOpenOnMobile(false)}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
