export type CityId = 'almaty' | 'astana'
export type CategoryId =
  | 'kits' | 'cameras' | 'lenses' | 'light' | 'sound' | 'gimbals' | 'batteries' | 'drones'
  | 'memory' | 'grip' | 'monitors' | 'misc' | 'softboxes' | 'filters' | 'stands' | 'cables'

export interface Product {
  id: string
  name: string        // чистое имя для показа
  kind: string        // тип: «Фотоаппарат», «Объектив»…
  brand: string
  category: CategoryId
  price: number       // ₸/сутки
  deposit: number     // ₸
  isNew: boolean
  hidden?: boolean
  specs: string[]
  /** что выдаётся вместе с товаром; если пусто — показываем стандартный состав категории */
  includes?: string[]
  /** дополнительные фото (полный размер); первое фото берётся из photoData */
  gallery?: string[]
  description?: string
  tags: string[]
  createdAt: number
}

export type UnitCondition = 'new' | 'good' | 'worn' | 'repair'
export interface Unit {
  id: string
  productId: string
  serial: string
  city: CityId
  condition: UnitCondition
  maintenance: boolean
  note?: string
}

export type BookingStatus = 'new' | 'confirmed' | 'issued' | 'returned' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentMethod = 'kaspi' | 'card' | 'cash' | 'invoice'
export type Source = 'app' | 'phone' | 'instagram' | 'whatsapp' | 'walk-in'

export interface BookingItem { productId: string; qty: number; price: number; unitIds: string[] }
export interface HistoryEntry { at: number; by: string; text: string }

export interface Booking {
  id: string
  code: string
  customerId: string
  city: CityId
  items: BookingItem[]
  start: number
  end: number
  days: number
  subtotal: number
  discount: number
  promo?: string
  delivery: number
  total: number
  deposit: number
  paid: number
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  deliveryType: 'pickup' | 'delivery'
  address?: string
  comment?: string
  status: BookingStatus
  source: Source
  managerId?: string
  /** оформлена до подтверждения профиля — менеджер сначала проверяет документы */
  awaitingVerification?: boolean
  createdAt: number
  history: HistoryEntry[]
}

/** проверка личности: скан удостоверения смотрит менеджер */
export type Verification = 'none' | 'pending' | 'verified' | 'rejected'

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  company?: string
  iin?: string
  /** статус проверки; у старых записей нет — тогда смотрим на verified */
  verification?: Verification
  idFront?: string   // скан лицевой стороны (data URL, сжатый JPEG)
  idBack?: string    // скан обратной стороны
  consentAt?: number // согласие на обработку персональных данных
  rejectReason?: string
  reviewedAt?: number
  verified: boolean
  blacklisted: boolean
  note?: string
  createdAt: number
  tags: string[]
}

export type LeadType = 'selection' | 'waitlist' | 'callback' | 'question' | 'production'
export type LeadStatus = 'new' | 'in_progress' | 'done' | 'lost'
export interface Lead {
  id: string
  type: LeadType
  name: string
  phone: string
  text: string
  productId?: string
  city: CityId
  status: LeadStatus
  assigneeId?: string
  createdAt: number
  dates?: { start: number; end: number }
}

export type Permission =
  | 'dashboard' | 'bookings.view' | 'bookings.edit' | 'bookings.cancel' | 'calendar'
  | 'products.view' | 'products.edit' | 'pricing.edit' | 'units.edit'
  | 'leads' | 'customers' | 'customers.blacklist' | 'staff' | 'settings' | 'finance'

export interface Role { id: string; name: string; color: string; permissions: Permission[]; system?: boolean }
export interface Staff { id: string; name: string; phone: string; roleId: string; city: CityId | 'all'; active: boolean; pin: string; createdAt: number }

export interface DiscountTier { days: number; percent: number }
export interface PromoCode { code: string; percent: number; active: boolean; uses: number; note?: string }
export interface Settings {
  tiers: DiscountTier[]
  promos: PromoCode[]
  deliveryFee: Record<CityId, number>
  depositForNew: boolean
  nightFee: number
  minHours: number
  points: Record<CityId, { address: string; hours: string; open: number; close: number; phone: string }>
}

export interface AuditEntry { id: string; at: number; staffId: string; action: string; target?: string }

export const verificationOf = (c: Pick<Customer, 'verification' | 'verified'> | null | undefined): Verification =>
  !c ? 'none' : c.verification ?? (c.verified ? 'verified' : 'none')
export const VERIFICATION_LABEL: Record<Verification, string> = { none: 'Не пройдена', pending: 'На проверке', verified: 'Подтверждён', rejected: 'Отклонён' }
