/**
 * Единый слой данных для сайта и приложения.
 *
 * UI обращается к данным только через `api`; какой за ним бэкенд — локальный (zustand + localStorage)
 * или Supabase — интерфейс не знает. Сейчас работает LocalAdapter. Чтобы подключить Supabase,
 * достаточно реализовать PixelApi (SupabaseAdapter) и вызвать setApi() при старте.
 *
 * Чтения для экранов идут из кэша (useStore): адаптер обязан держать его актуальным —
 * LocalAdapter и есть этот кэш, SupabaseAdapter будет наполнять его через hydrate() и realtime.
 */
import { useStore, type CheckoutForm } from '../store/store'
import type { Booking, BookingStatus, CityId, Customer, Lead, Product, Settings, Staff, Unit } from './types'
import { availMap, type Avail } from '../lib/availability'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface PixelApi {
  readonly name: string
  // --- каталог ---
  listProducts(): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  listUnits(): Promise<Unit[]>
  availability(city: CityId, start: number, end: number): Promise<Map<string, Avail>>
  getSettings(): Promise<Settings>
  // --- клиент ---
  requestOtp(phone: string): Promise<Result<{ sentTo: string }>>
  verifyOtp(phone: string, code: string): Promise<Result<{ customer: Customer | null }>>
  register(d: { phone: string; name: string; iin: string; email?: string; idFront?: string; idBack?: string }): Promise<Result<Customer>>
  submitId(front: string, back: string): Promise<Result<null>>
  signOut(): Promise<void>
  myBookings(): Promise<Booking[]>
  placeOrder(f: CheckoutForm): Promise<Result<Booking>>
  cancelBooking(id: string): Promise<Result<null>>
  createLead(l: Omit<Lead, 'id' | 'createdAt' | 'status'>): Promise<Result<null>>
  // --- админка ---
  listBookings(): Promise<Booking[]>
  listCustomers(): Promise<Customer[]>
  listStaff(): Promise<Staff[]>
  setBookingStatus(id: string, s: BookingStatus, note?: string): Promise<Result<null>>
  reviewCustomer(id: string, ok: boolean, reason?: string): Promise<Result<null>>
  upsertProduct(p: Product): Promise<Result<null>>
  upsertUnit(u: Unit): Promise<Result<null>>
  updateSettings(s: Partial<Settings>): Promise<Result<null>>
}

/** демо-код подтверждения; в Supabase — настоящий SMS/WhatsApp OTP */
export const DEMO_OTP = '1234'

const ok = <T,>(data: T): Result<T> => ({ ok: true, data })
const st = () => useStore.getState()

export const LocalAdapter: PixelApi = {
  name: 'local',
  listProducts: async () => st().products,
  getProduct: async id => st().products.find(p => p.id === id) ?? null,
  listUnits: async () => st().units,
  availability: async (city, start, end) => { const s = st(); return availMap(s.units, s.bookings, city, start, end) },
  getSettings: async () => st().settings,

  requestOtp: async phone => {
    const d = phone.replace(/\D/g, '')
    if (d.length < 11) return { ok: false, error: 'Проверьте номер' }
    return ok({ sentTo: phone })
  },
  verifyOtp: async (phone, code) => {
    if (code !== DEMO_OTP) return { ok: false, error: 'Неверный код' }
    return ok({ customer: st().signIn(phone) })
  },
  register: async d => {
    if (!d.name.trim()) return { ok: false, error: 'Укажите имя' }
    if (!/^\d{12}$/.test(d.iin)) return { ok: false, error: 'ИИН — 12 цифр' }
    return ok(st().register(d))
  },
  submitId: async (front, back) => { st().submitId(front, back); return ok(null) },
  signOut: async () => st().logout(),
  myBookings: async () => { const s = st(); return s.bookings.filter(b => b.customerId === s.meId) },
  placeOrder: async f => { const r = st().placeOrder(f); return r.ok ? ok(r.booking) : r },
  cancelBooking: async id => { st().cancelMyBooking(id); return ok(null) },
  createLead: async l => { st().createLead(l); return ok(null) },

  listBookings: async () => st().bookings,
  listCustomers: async () => st().customers,
  listStaff: async () => st().staff,
  setBookingStatus: async (id, s, note) => { st().setBookingStatus(id, s, note); return ok(null) },
  reviewCustomer: async (id, okk, reason) => { st().reviewCustomer(id, okk, reason); return ok(null) },
  upsertProduct: async p => { st().upsertProduct(p); return ok(null) },
  upsertUnit: async u => { st().upsertUnit(u); return ok(null) },
  updateSettings: async s => { st().updateSettings(s); return ok(null) },
}

let current: PixelApi = LocalAdapter
/** активный бэкенд */
export const api: PixelApi = new Proxy({} as PixelApi, { get: (_t, k) => (current as any)[k] })
export function setApi(a: PixelApi) { current = a }
