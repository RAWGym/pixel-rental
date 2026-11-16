import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { buildAll } from '../data/seed'
import { verificationOf } from '../data/types'
import type { Booking, BookingStatus, CityId, Customer, Lead, Product, Role, Settings, Staff, Unit, AuditEntry, PaymentMethod, Permission } from '../data/types'
import { calcPrice, rentalDays, DAY } from '../lib/pricing'
import { freeUnits } from '../lib/availability'
import { uid } from '../lib/rng'

// Запись в localStorage откладываем на 400 мс: JSON.stringify всей базы на каждый клик тормозит
// Android WebView. При уходе со страницы / сворачивании — сохраняем сразу.
function debouncedStorage<S>(delay = 400): PersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    for (const [k, v] of pending) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* noop */ } }
    pending.clear()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  }
  return {
    getItem: k => {
      const p = pending.get(k)
      if (p) return p
      try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as StorageValue<S> : null } catch { return null }
    },
    setItem: (k, v) => { pending.set(k, v); if (timer) clearTimeout(timer); timer = setTimeout(flush, delay) },
    removeItem: k => { pending.delete(k); try { localStorage.removeItem(k) } catch { /* noop */ } },
  }
}

export interface CartLine { productId: string; qty: number }
export interface Range { start: number; end: number }

function defaultRange(): Range {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
  return { start: d.getTime(), end: d.getTime() + DAY }
}

export interface CheckoutForm {
  name: string; phone: string; email?: string; company?: string; comment?: string
  deliveryType: 'pickup' | 'delivery'; address?: string; paymentMethod: PaymentMethod; promo?: string
}

interface DB {
  products: Product[]; units: Unit[]; bookings: Booking[]; customers: Customer[]; leads: Lead[]
  roles: Role[]; staff: Staff[]; settings: Settings; audit: AuditEntry[]
}

interface State extends DB {
  seededAt: number
  city: CityId
  range: Range
  cart: CartLine[]
  favorites: string[]
  promo: string
  meId: string | null
  recent: string[]
  /** недавно просмотренные товары (для «Вы смотрели») */
  viewed: string[]
  /** товары в сравнении (до 3) */
  compare: string[]
  staffId: string | null

  setCity: (c: CityId) => void
  setRange: (r: Range) => void
  addToCart: (id: string, qty?: number) => void
  setQty: (id: string, qty: number) => void
  clearCart: () => void
  toggleFav: (id: string) => void
  setPromo: (p: string) => void
  pushRecent: (q: string) => void
  pushViewed: (id: string) => void
  toggleCompare: (id: string) => boolean
  clearCompare: () => void
  /** демо-сценарий для презентации */
  runDemo: () => void
  placeOrder: (f: CheckoutForm) => { ok: true; booking: Booking } | { ok: false; error: string }
  createLead: (l: Omit<Lead, 'id' | 'createdAt' | 'status'>) => void
  cancelMyBooking: (id: string) => void
  logout: () => void
  /** вход по телефону (после кода): найден клиент — входим, нет — null */
  signIn: (phone: string) => Customer | null
  /** регистрация нового клиента; профиль сразу уходит на проверку, если приложены сканы */
  register: (d: { phone: string; name: string; iin: string; email?: string; idFront?: string; idBack?: string }) => Customer
  /** отправить сканы удостоверения (повторно — после отказа) */
  submitId: (front: string, back: string) => void
  /** менеджер: подтвердить или отклонить профиль */
  reviewCustomer: (id: string, ok: boolean, reason?: string) => void

  staffLogin: (id: string, pin: string) => boolean
  staffLogout: () => void
  can: (p: Permission) => boolean
  log: (action: string, target?: string) => void
  setBookingStatus: (id: string, s: BookingStatus, note?: string) => void
  patchBooking: (id: string, patch: Partial<Booking>, note?: string) => void
  addPayment: (id: string, amount: number) => void
  upsertProduct: (p: Product) => void
  upsertUnit: (u: Unit) => void
  removeUnit: (id: string) => void
  upsertCustomer: (c: Customer) => void
  upsertLead: (l: Lead) => void
  upsertStaff: (s: Staff) => void
  upsertRole: (r: Role) => void
  removeRole: (id: string) => void
  updateSettings: (s: Partial<Settings>) => void
  resetDemo: () => void
}

// с подключённой базой демо-история (≈1800 броней за год) не нужна — экономим ~300 мс на старте
const LIVE_DB = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
function fresh(): DB & { seededAt: number } {
  const d = buildAll({ history: !LIVE_DB })
  return { ...d, audit: [], seededAt: Date.now() }
}

export const useStore = create<State>()(persist((set, get) => ({
  ...fresh(),
  city: 'almaty',
  range: defaultRange(),
  cart: [],
  favorites: [],
  promo: '',
  meId: null,
  recent: [],
  viewed: [],
  compare: [],
  staffId: null,

  setCity: city => set({ city }),
  setRange: range => set({ range }),
  addToCart: (productId, qty = 1) => set(s => {
    const ex = s.cart.find(c => c.productId === productId)
    return { cart: ex ? s.cart.map(c => c.productId === productId ? { ...c, qty: c.qty + qty } : c) : [...s.cart, { productId, qty }] }
  }),
  setQty: (productId, qty) => set(s => ({ cart: qty <= 0 ? s.cart.filter(c => c.productId !== productId) : s.cart.map(c => c.productId === productId ? { ...c, qty } : c) })),
  clearCart: () => set({ cart: [], promo: '' }),
  toggleFav: id => set(s => ({ favorites: s.favorites.includes(id) ? s.favorites.filter(f => f !== id) : [id, ...s.favorites] })),
  setPromo: promo => set({ promo }),
  pushRecent: q => set(s => ({ recent: [q, ...s.recent.filter(r => r !== q)].slice(0, 6) })),
  toggleCompare: id => {
    const c = get().compare ?? []
    if (c.includes(id)) { set({ compare: c.filter(x => x !== id) }); return true }
    if (c.length >= 3) return false
    set({ compare: [...c, id] }); return true
  },
  clearCompare: () => set({ compare: [] }),
  runDemo: () => {
    get().resetDemo()
    const s = get()
    const find = (r: RegExp) => s.products.find(p => r.test(p.name))?.id
    const ids = (rs: RegExp[]) => rs.map(find).filter((x): x is string => !!x)
    const me = s.customers.find(c => c.id === 'c1') ?? s.customers[0]
    const now = Date.now()
    const day0 = new Date(); day0.setHours(10, 0, 0, 0)
    const mk = (code: string, items: string[], startIn: number, days: number, status: BookingStatus): Booking => {
      const its = items.map(pid => { const p = s.products.find(p => p.id === pid)!; const u = s.units.find(u => u.productId === pid && u.city === 'almaty'); return { productId: pid, qty: 1, price: p.price, unitIds: u ? [u.id] : [] } })
      const start = day0.getTime() + startIn * DAY, end = start + days * DAY
      const pr = calcPrice(its, days, s.settings)
      return { id: uid('b'), code, customerId: me.id, city: 'almaty', items: its, start, end, days, subtotal: pr.subtotal, discount: pr.discount, delivery: 0, total: pr.total, deposit: 0,
        paid: status === 'returned' ? pr.total : 0, paymentStatus: status === 'returned' ? 'paid' : 'unpaid', paymentMethod: 'kaspi', deliveryType: 'pickup', status, source: 'app', createdAt: start - 2 * DAY,
        history: [{ at: start - 2 * DAY, by: 'Клиент', text: 'Бронь создана в приложении' }] }
    }
    const demoBookings = [
      mk('PX-2041', ids([/^sony fx3$/i, /sony 35mm gm/i, /ronin rs 4/i, /aputure 600x/i]), 3, 2, 'confirmed'),
      mk('PX-1987', ids([/^sony a7 iv$/i, /dji mic 2 duo/i, /amaran 150c/i]), -12, 3, 'returned'),
      mk('PX-1950', ids([/mini 5 pro \(dji/i, /набор фильтров dji mini 5/i]), -30, 1, 'returned'),
    ]
    set({
      customers: s.customers.map(c => c.id === me.id ? { ...c, name: 'Айдана Сейткали', verified: true, verification: 'verified', iin: '950312400123', email: 'aidana@example.com', tags: ['Постоянный'] } : c),
      bookings: [...demoBookings, ...s.bookings],
      meId: me.id, city: 'almaty',
      favorites: ids([/^sony fx3$/i, /sony 85mm gm/i, /aputure 600x/i, /dji mic 3/i, /ronin rs 4/i, /nova p300 kit/i]),
      viewed: ids([/^sony fx3$/i, /^sony a7 iv$/i, /ronin rs 4/i, /aputure 300x/i, /dji mic 2 duo/i]),
      compare: ids([/^sony fx3$/i, /^sony a7 iv$/i]),
      // в корзине — только то, что свободно на демо-даты: презентация без красных плашек
      cart: ids([/^sony a7 iv$/i, /^sony a7 iii$/i, /^sony fx30$/i, /sony 24-70mm gm f2\.8/i, /sigma art 24-70mm f2\.8 dg dn sony/i, /dji mic 2 duo/i, /dji mic 3/i, /hollyland lark max/i, /aputure 300x/i, /amaran 150c/i])
        .filter(pid => freeUnits(s.units, [...demoBookings, ...s.bookings], pid, 'almaty', s.range.start, s.range.end).length > 0)
        .filter((pid, i, a) => a.indexOf(pid) === i).slice(0, 3).map(productId => ({ productId, qty: 1 })),
    })
  },
  pushViewed: id => set(s => (s.viewed?.[0] === id ? {} : { viewed: [id, ...(s.viewed ?? []).filter(v => v !== id)].slice(0, 12) })),

  placeOrder: f => {
    const s = get()
    const { start, end } = s.range
    const days = rentalDays(start, end)
    // проверяем и закрепляем единицы
    const items: Booking['items'] = []
    for (const line of s.cart) {
      const p = s.products.find(p => p.id === line.productId)
      if (!p) continue
      const fu = freeUnits(s.units, s.bookings, p.id, s.city, start, end)
      if (fu.length < line.qty) return { ok: false, error: `${p.name}: на эти даты свободно ${fu.length} шт.` }
      items.push({ productId: p.id, qty: line.qty, price: p.price, unitIds: fu.slice(0, line.qty).map(u => u.id) })
    }
    if (!items.length) return { ok: false, error: 'Корзина пуста' }
    const phoneKey = f.phone.replace(/\D/g, '')
    const customers = [...s.customers]
    // оформить может только вошедший клиент; телефон берём из профиля
    let cust = s.customers.find(c => c.id === s.meId) ?? s.customers.find(c => c.phone.replace(/\D/g, '') === phoneKey)
    if (!cust) return { ok: false, error: 'Войдите, чтобы оформить бронь' }
    if (f.email || f.company) { cust = { ...cust, email: f.email || cust.email, company: f.company || cust.company }; const i = customers.findIndex(c => c.id === cust!.id); customers[i] = cust }
    if (cust.blacklisted) return { ok: false, error: 'Не получилось оформить онлайн. Позвоните нам, разберёмся.' }
    const delivery = f.deliveryType === 'delivery' ? s.settings.deliveryFee[s.city] : 0
    const pr = calcPrice(items, days, s.settings, f.promo || s.promo, delivery)
    const awaiting = verificationOf(cust) !== 'verified'
    const deposit = s.settings.depositForNew && !cust.verified ? items.reduce((a, i) => a + (s.products.find(p => p.id === i.productId)?.deposit ?? 0) * i.qty, 0) : 0
    const n = 1040 + s.bookings.length + 1
    const b: Booking = {
      id: uid('b'), code: `PX-${n}`, customerId: cust.id, city: s.city, items, start, end, days,
      subtotal: pr.subtotal, discount: pr.discount, promo: pr.promo?.code, delivery, total: pr.total, deposit, paid: 0,
      paymentStatus: 'unpaid', paymentMethod: f.paymentMethod, deliveryType: f.deliveryType, address: f.address, comment: f.comment,
      status: 'new', source: 'app', awaitingVerification: awaiting || undefined, createdAt: Date.now(),
      history: [{ at: Date.now(), by: 'Клиент', text: awaiting ? 'Бронь создана в приложении · ждёт верификации профиля' : 'Бронь создана в приложении' }],
    }
    const promos = pr.promo ? s.settings.promos.map(p => p.code === pr.promo!.code ? { ...p, uses: p.uses + 1 } : p) : s.settings.promos
    set({ bookings: [b, ...s.bookings], customers, meId: cust.id, cart: [], promo: '', settings: { ...s.settings, promos } })
    return { ok: true, booking: b }
  },
  createLead: l => set(s => ({ leads: [{ ...l, id: uid('l'), createdAt: Date.now(), status: 'new' }, ...s.leads] })),
  cancelMyBooking: id => set(s => ({ bookings: s.bookings.map(b => b.id === id ? { ...b, status: 'cancelled', history: [...b.history, { at: Date.now(), by: 'Клиент', text: 'Отменена клиентом' }] } : b) })),
  logout: () => set({ meId: null }),
  signIn: phone => {
    const key = phone.replace(/\D/g, '').slice(-10)
    const c = get().customers.find(c => c.phone.replace(/\D/g, '').slice(-10) === key) ?? null
    if (c) set({ meId: c.id })
    return c
  },
  register: d => {
    const hasId = !!(d.idFront && d.idBack)
    const c: Customer = {
      id: uid('c'), name: d.name.trim(), phone: d.phone, email: d.email, iin: d.iin, verified: false, blacklisted: false,
      verification: hasId ? 'pending' : 'none', idFront: d.idFront, idBack: d.idBack, consentAt: hasId ? Date.now() : undefined,
      createdAt: Date.now(), tags: ['Новый'],
    }
    set(s => ({ customers: [c, ...s.customers], meId: c.id }))
    return c
  },
  submitId: (front, back) => set(s => ({ customers: s.customers.map(c => c.id === s.meId ? { ...c, idFront: front, idBack: back, verification: 'pending', rejectReason: undefined, consentAt: Date.now() } : c) })),
  reviewCustomer: (id, ok, reason) => {
    const s = get()
    set({
      customers: s.customers.map(c => c.id === id ? { ...c, verification: ok ? 'verified' : 'rejected', verified: ok, rejectReason: ok ? undefined : reason, reviewedAt: Date.now() } : c),
      // подтвердили — снимаем пометку с его броней
      bookings: ok ? s.bookings.map(b => b.customerId === id && b.awaitingVerification ? { ...b, awaitingVerification: false, history: [...b.history, { at: Date.now(), by: 'Система', text: 'Профиль клиента подтверждён' }] } : b) : s.bookings,
    })
    get().log(ok ? 'Профиль подтверждён' : `Профиль отклонён: ${reason ?? ''}`, s.customers.find(c => c.id === id)?.name)
  },

  staffLogin: (id, pin) => {
    const st = get().staff.find(s => s.id === id && s.active)
    if (!st || st.pin !== pin) return false
    set({ staffId: id })
    get().log('Вход в админку')
    return true
  },
  staffLogout: () => set({ staffId: null }),
  can: p => {
    const s = get()
    const st = s.staff.find(x => x.id === s.staffId)
    const role = s.roles.find(r => r.id === st?.roleId)
    return !!role?.permissions.includes(p)
  },
  log: (action, target) => set(s => ({ audit: [{ id: uid('a'), at: Date.now(), staffId: s.staffId ?? '?', action, target }, ...s.audit].slice(0, 300) })),
  setBookingStatus: (id, status, note) => {
    const LABEL: Record<BookingStatus, string> = { new: 'Новая', confirmed: 'Подтверждена', issued: 'Выдана клиенту', returned: 'Возвращена', cancelled: 'Отменена' }
    get().patchBooking(id, { status }, note ? `${LABEL[status]}: ${note}` : LABEL[status])
  },
  patchBooking: (id, patch, note) => {
    const s = get()
    const who = s.staff.find(x => x.id === s.staffId)?.name.split(' ')[0] ?? 'Система'
    set({ bookings: s.bookings.map(b => b.id === id ? { ...b, ...patch, history: note ? [...b.history, { at: Date.now(), by: who, text: note }] : b.history } : b) })
    const b = s.bookings.find(b => b.id === id)
    if (note) get().log(note, b?.code)
  },
  addPayment: (id, amount) => {
    const b = get().bookings.find(b => b.id === id)
    if (!b) return
    const paid = Math.min(b.total, b.paid + amount)
    get().patchBooking(id, { paid, paymentStatus: paid >= b.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid' }, `Оплата ${new Intl.NumberFormat('ru-RU').format(amount)} ₸`)
  },
  upsertProduct: p => { set(s => ({ products: s.products.some(x => x.id === p.id) ? s.products.map(x => x.id === p.id ? p : x) : [p, ...s.products] })); get().log('Товар сохранён', p.name) },
  upsertUnit: u => { set(s => ({ units: s.units.some(x => x.id === u.id) ? s.units.map(x => x.id === u.id ? u : x) : [...s.units, u] })); get().log('Единица сохранена', u.serial) },
  removeUnit: id => { const u = get().units.find(x => x.id === id); set(s => ({ units: s.units.filter(x => x.id !== id) })); get().log('Единица списана', u?.serial) },
  upsertCustomer: c => { set(s => ({ customers: s.customers.some(x => x.id === c.id) ? s.customers.map(x => x.id === c.id ? c : x) : [c, ...s.customers] })); get().log('Клиент сохранён', c.name) },
  upsertLead: l => set(s => ({ leads: s.leads.some(x => x.id === l.id) ? s.leads.map(x => x.id === l.id ? l : x) : [l, ...s.leads] })),
  upsertStaff: st => { set(s => ({ staff: s.staff.some(x => x.id === st.id) ? s.staff.map(x => x.id === st.id ? st : x) : [...s.staff, st] })); get().log('Сотрудник сохранён', st.name) },
  upsertRole: r => { set(s => ({ roles: s.roles.some(x => x.id === r.id) ? s.roles.map(x => x.id === r.id ? r : x) : [...s.roles, r] })); get().log('Роль сохранена', r.name) },
  removeRole: id => set(s => ({ roles: s.roles.filter(r => r.id !== id) })),
  updateSettings: patch => { set(s => ({ settings: { ...s.settings, ...patch } })); get().log('Настройки изменены') },
  resetDemo: () => set({ ...fresh(), cart: [], favorites: [], meId: null, promo: '', range: defaultRange(), viewed: [], compare: [] }),
}), {
  name: 'pixel-rental-v1',
  storage: debouncedStorage<State>(),
  // v2: в демо-данных появилась история за год — старые сохранения пересоздаём
  // v3: с подключённой базой серверные данные больше не хранятся в браузере — старый кэш сбрасываем
  version: 3,
  migrate: () => ({}) as any,
  // источник правды для броней, клиентов, заявок, товаров и сотрудников — база; в браузере только личное
  partialize: (s: State) => (LIVE_DB
    ? { city: s.city, range: s.range, cart: s.cart, favorites: s.favorites, promo: s.promo, recent: s.recent, viewed: s.viewed, compare: s.compare, seededAt: s.seededAt }
    : s) as any,
  onRehydrateStorage: () => state => {
    // демо-данные «стареют»: пересоздаём, если прошло больше 3 дней
    if (state && Date.now() - state.seededAt > 3 * DAY) state.resetDemo()
    if (state && state.range.start < Date.now() - DAY) state.setRange(defaultRange())
  },
}))

export const useMe = () => useStore(s => s.customers.find(c => c.id === s.meId) ?? null)
export const useProduct = (id?: string) => useStore(s => s.products.find(p => p.id === id))
