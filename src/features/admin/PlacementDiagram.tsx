import { AD_PLACEMENTS, type AdPlacement } from '@/lib/ads'
import type { AdFormat } from '@/types'

interface PlacementDiagramProps {
  format: AdFormat
  selected: string
  onSelect: (key: string) => void
}

// Bloques fijos de cada pantalla (lo que no es publicidad), en una grilla de
// 100 x 100. Solo sirven de referencia visual.
const SCREENS: { id: AdPlacement['diagram']['screen']; title: string; blocks: { label: string; x: number; y: number; w: number; h: number }[] }[] = [
  {
    id: 'inicio',
    title: 'Inicio del complejo',
    blocks: [
      { label: 'Portada y botón de reservar', x: 8, y: 6, w: 84, h: 23 },
      { label: 'Sobre nosotros', x: 8, y: 41, w: 84, h: 9 },
      { label: 'Novedades y torneos', x: 8, y: 54, w: 54, h: 12 },
      { label: 'Contacto', x: 8, y: 79, w: 84, h: 7 },
      { label: 'Pie', x: 8, y: 95, w: 84, h: 3 },
    ],
  },
  {
    id: 'reserva',
    title: 'Reserva confirmada',
    blocks: [
      { label: 'Tu reserva', x: 20, y: 12, w: 60, h: 22 },
      { label: 'Botón de WhatsApp', x: 20, y: 40, w: 60, h: 10 },
    ],
  },
]

// Esquema simple del sitio que marca donde queda cada ubicacion. Las zonas
// que admiten el formato elegido se pueden tocar para elegirlas.
export function PlacementDiagram({ format, selected, onSelect }: PlacementDiagramProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {SCREENS.map((screen) => (
        <figure key={screen.id} className="m-0">
          <figcaption className="mb-1 text-xs text-gray-500">{screen.title}</figcaption>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
            {screen.blocks.map((block) => (
              <div
                key={block.label}
                title={block.label}
                className="absolute flex items-center justify-center overflow-hidden rounded-sm bg-gray-800 px-1 text-center text-[9px] leading-tight text-gray-500"
                style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.w}%`, height: `${block.h}%` }}
              >
                {block.label}
              </div>
            ))}
            {AD_PLACEMENTS.filter((p) => p.diagram.screen === screen.id).map((placement) => {
              const allowed = placement.formats.includes(format)
              const isSelected = placement.key === selected
              return (
                <button
                  key={placement.key}
                  type="button"
                  disabled={!allowed}
                  onClick={() => onSelect(placement.key)}
                  aria-pressed={isSelected}
                  aria-label={`Ubicación: ${placement.label}`}
                  title={allowed ? placement.label : `${placement.label} (no admite este formato)`}
                  className={`absolute flex items-center justify-center overflow-hidden rounded-sm border px-1 text-center text-[9px] font-semibold leading-tight ${
                    isSelected
                      ? 'border-primary-500 bg-primary-500 text-gray-950'
                      : allowed
                        ? 'border-dashed border-primary-500/70 bg-primary-500/10 text-primary-500 hover:bg-primary-500/25'
                        : 'border-dashed border-gray-700 text-gray-700'
                  }`}
                  style={{
                    left: `${placement.diagram.x}%`,
                    top: `${placement.diagram.y}%`,
                    width: `${placement.diagram.w}%`,
                    height: `${placement.diagram.h}%`,
                  }}
                >
                  {placement.label}
                </button>
              )
            })}
          </div>
        </figure>
      ))}
    </div>
  )
}
