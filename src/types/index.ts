export type Sport = 'padel' | 'futbol5' | 'futbol7' | 'tenis' | 'otro'

export interface Court {
  id: string
  name: string
  price: number
  sport: Sport
}

// Pasos de la lista de primeros pasos del Dashboard que el dueño ya hizo.
export interface OnboardingState {
  courts?: boolean
  hours?: boolean
  link?: boolean
  dismissed?: boolean
}

export type PlanStatus = 'trial' | 'active' | 'expired'

export interface Settings {
  id: string
  ownerId: string
  slug: string
  venueName: string
  whatsappPhone: string
  logoUrl?: string
  slotDurationMinutes: number
  openHour: number
  closeHour: number
  about: string
  address: string
  instagramUrl?: string
  onboarding: OnboardingState
  planStatus: PlanStatus
  trialEndsAt?: string // fecha y hora ISO; solo en prueba
  isDemo: boolean // complejo de ejemplo publico: sus reservas no se guardan
}

export interface ClosedDate {
  id: string
  date: string // YYYY-MM-DD
  reason?: string
}

export interface FixedSlot {
  id: string
  courtId: string
  weekday: number // 0 = domingo ... 6 = sabado, igual que Date.getDay()
  time: string // HH:00
  customerName: string
}

export type ReservationStatus = 'reservado' | 'confirmado' | 'cancelado'

export interface Reservation {
  id: string
  courtId: string
  date: string // YYYY-MM-DD
  time: string // HH:00
  players: number
  status: ReservationStatus
  customerName?: string
  createdVia: 'user' | 'admin'
  priceTotal: number
}

export interface Category {
  id: string
  name: string
}

export interface Product {
  id: string
  name: string
  description: string
  categoryId?: string
  price: number
  sku?: string // codigo propio o de barras, unico dentro del complejo
  trackStock: boolean
  stock: number // existencia actual; solo cambia por movimientos de stock
  stockMin?: number // avisar cuando el stock llega a este numero
}

// Lo que se carga al crear o editar un producto: el stock no se edita a mano.
export type ProductInput = Omit<Product, 'id' | 'stock'>

export type StockMovementType = 'inicial' | 'entrada' | 'venta' | 'devolucion' | 'merma' | 'ajuste'

export interface StockMovement {
  id: string
  productId: string
  type: StockMovementType
  qty: number // positivo entra, negativo sale
  note: string
  createdAt: string
}

// Las ventas guardan el nombre del medio de pago tal como estaba al cobrar
// (los medios son configurables por complejo). 'mixto' = mas de una linea.
export interface PaymentMethodOption {
  id: string
  name: string
}

export interface SaleItem {
  id?: string // id de la linea guardada; falta en lineas todavia sin confirmar
  productId: string
  qty: number
  unitPrice: number
  comment?: string
}

export interface SalePayment {
  method: string
  amount: number
}

// pendiente: pedido en curso, todavia sin cobrar.
export type PaymentStatus = 'pagado' | 'adeuda' | 'pendiente'

export type SaleStatus = 'en_curso' | 'cerrada'

export interface SaleDiscount {
  type: 'porcentaje' | 'fijo'
  value: number
  reason: string
}

// Una venta es un pedido del Mostrador: nace en curso, se le suman productos
// y se cierra al cobrar (o al dejarlo como fiado).
export interface Sale {
  id: string
  number?: number // correlativo por complejo, lo asigna la base
  status: SaleStatus
  date: string // YYYY-MM-DD: dia de apertura mientras esta en curso, de cierre despues
  createdAt?: string
  closedAt?: string
  items: SaleItem[]
  total: number
  paymentMethod: string | null
  paymentStatus: PaymentStatus
  customerName?: string
  reservationId?: string
  fixedSlotId?: string
  cantinero?: string
  comment: string
  // Precio de cancha incluido. null = venta anterior al Mostrador, donde no
  // se guardaba aparte (ver saleIncludesReservationFee).
  courtFee: number | null
  discount?: SaleDiscount
  payments: SalePayment[]
}

export interface Tournament {
  id: string
  name: string
  date: string // YYYY-MM-DD
  description: string
  imageUrl?: string
  published: boolean
}

export interface HeroSlide {
  id: string
  imageUrl: string
  title: string
  subtitle: string
  body: string
  order: number
  published: boolean
}

export type RankingInstance =
  | 'fase_grupos'
  | 'dieciseisavos'
  | 'octavos'
  | 'cuartos'
  | 'semis'
  | 'finalista'
  | 'campeon'

export interface RankingCategory {
  id: string
  name: string
  description: string // nivel de la categoria, por ejemplo "Intermedio"
}

export interface RankingEntry {
  id: string
  categoryId: string
  playerName: string
  totalPoints: number
  bestInstance: RankingInstance
}
