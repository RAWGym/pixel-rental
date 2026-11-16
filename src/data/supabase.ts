/**
 * SupabaseAdapter — общая база для сайта, PWA и приложения.
 * Включается, если заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY; иначе остаётся демо-режим (LocalAdapter).
 *
 * Экраны читают данные из zustand-стора (как кэш). Адаптер:
 *  1) hydrate() — наполняет стор из базы (каталог, наличие, настройки; клиенту — его брони; сотруднику — всё по правам);
 *  2) реализует PixelApi: вход по телефону, регистрация со сканами (приватный bucket), бронь через create_booking (атомарно), заявки;
 *  3) mirrorStoreWrites() — правки из админки (статусы броней, товары, единицы, клиенты, заявки, настройки) дублируются в базу.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useStore, type CheckoutForm } from '../store/store'
import type { PixelApi, Result } from './api'
import type { Booking, Customer, Lead, Product, Settings, Staff, Unit, Role } from './types'
import { availMap } from '../lib/availability'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const DEMO_OTP = import.meta.env.VITE_DEMO_OTP === 'true'
export const supabaseConfigured = !!(URL_ && KEY)

let sb: SupabaseClient | null = null
export const client = () => (sb ??= createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }))

const ok = <T,>(data: T): Result<T> => ({ ok: true, data })
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: (e as any)?.message ?? String(e) })
const ts = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0)
const iso = (t: number) => new Date(t).toISOString()
const st = () => useStore.getState()

/* ---------- строки базы → типы приложения ---------- */
const photoUrl = (p?: string | null) => (!p ? undefined : /^https?:|^data:|^\//.test(p) ? p : client().storage.from('product-photos').getPublicUrl(p).data.publicUrl)
const toProduct = (r: any): Product => ({
  id: r.id, name: r.name, kind: r.kind, brand: r.brand, category: r.category_id, price: r.price, deposit: r.deposit, isNew: r.is_new, hidden: r.hidden,
  specs: r.specs ?? [], includes: r.includes ?? [], gallery: (r.gallery ?? []).map(photoUrl), description: r.description ?? undefined, tags: r.tags ?? [], createdAt: ts(r.created_at),
})
const toUnit = (r: any): Unit => ({ id: r.id, productId: r.product_id, serial: r.serial, city: r.city, condition: r.condition, maintenance: r.maintenance, note: r.note ?? undefined })
const toCustomer = (r: any): Customer => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email ?? undefined, company: r.company ?? undefined, iin: r.iin ?? undefined,
  verification: r.verification, verified: r.verification === 'verified', blacklisted: r.blacklisted, note: r.note ?? undefined, tags: r.tags ?? [],
  rejectReason: r.reject_reason ?? undefined, consentAt: ts(r.consent_at) || undefined, reviewedAt: ts(r.reviewed_at) || undefined, createdAt: ts(r.created_at),
})
const toBooking = (r: any): Booking => ({
  id: r.id, code: r.code, customerId: r.customer_id, city: r.city, start: ts(r.start_at), end: ts(r.end_at), days: r.days,
  items: (r.booking_items ?? []).map((i: any) => ({ productId: i.product_id, qty: i.qty, price: i.price, unitIds: (r.booking_units ?? []).filter((u: any) => u.unit_id.startsWith(i.product_id + '#')).map((u: any) => u.unit_id) })),
  subtotal: r.subtotal, discount: r.discount, promo: r.promo ?? undefined, delivery: r.delivery, total: r.total, deposit: r.deposit, paid: r.paid,
  paymentStatus: r.payment_status, paymentMethod: r.payment_method, deliveryType: r.delivery_type, address: r.address ?? undefined, comment: r.comment ?? undefined,
  status: r.status, source: r.source, managerId: r.manager_id ?? undefined, awaitingVerification: r.awaiting_verification, createdAt: ts(r.created_at),
  history: (r.history ?? []).map((h: any) => ({ at: ts(h.at), by: h.by, text: h.text })),
})
const toLead = (r: any): Lead => ({ id: r.id, type: r.type, name: r.name, phone: r.phone, text: r.text, productId: r.product_id ?? undefined, city: r.city, status: r.status, assigneeId: r.assignee_id ?? undefined, createdAt: ts(r.created_at) })
const toStaff = (r: any): Staff => ({ id: r.id, name: r.name, phone: r.phone ?? '', roleId: r.role_id, city: r.city, active: r.active, pin: '', createdAt: ts(r.created_at) })
const toRole = (r: any): Role => ({ id: r.id, name: r.name, color: r.color, permissions: r.permissions, system: r.system })

const BOOKING_SELECT = '*, booking_items(product_id, qty, price), booking_units(unit_id)'

async function dataUrlToBlob(u: string) { return (await fetch(u)).blob() }

/* ---------- загрузка данных в стор ---------- */
export async function hydrate() {
  const c = client()
  const [{ data: products }, { data: units }, { data: settings }, { data: session }] = await Promise.all([
    c.from('products').select('*').order('created_at', { ascending: false }),
    c.from('product_units').select('*'),
    c.from('settings').select('*').eq('id', 1).maybeSingle(),
    c.auth.getSession(),
  ])
  const patch: any = {}
  if (products?.length) patch.products = products.map(toProduct)
  if (units?.length) patch.units = units.map(toUnit)
  if (settings) patch.settings = { ...st().settings, tiers: settings.tiers, deliveryFee: settings.delivery_fee, depositForNew: settings.deposit_for_new, nightFee: settings.night_fee, minHours: settings.min_hours, points: settings.points } as Settings
  const uid = session.session?.user.id
  if (uid) {
    const { data: staffRow } = await c.from('staff').select('*').eq('user_id', uid).maybeSingle()
    if (staffRow) {
      // сотрудник: брони, клиенты, заявки, команда — в пределах прав (RLS отфильтрует лишнее)
      const [b, cu, l, s, r] = await Promise.all([
        c.from('bookings').select(BOOKING_SELECT).order('created_at', { ascending: false }).limit(5000),
        c.from('customers').select('*'), c.from('leads').select('*').order('created_at', { ascending: false }),
        c.from('staff').select('*'), c.from('roles').select('*'),
      ])
      Object.assign(patch, { bookings: (b.data ?? []).map(toBooking), customers: (cu.data ?? []).map(toCustomer), leads: (l.data ?? []).map(toLead), staff: (s.data ?? []).map(toStaff), roles: (r.data ?? []).map(toRole), staffId: staffRow.id })
    } else {
      const { data: me } = await c.from('customers').select('*').eq('user_id', uid).maybeSingle()
      if (me) {
        const { data: b } = await c.from('bookings').select(BOOKING_SELECT).eq('customer_id', me.id).order('created_at', { ascending: false })
        Object.assign(patch, { customers: [toCustomer(me)], meId: me.id, bookings: (b ?? []).map(toBooking) })
      }
    }
  }
  // чужие брони не видны: для расчёта «свободно / занято до …» берём обезличенные периоды занятости
  if (!patch.staffId) {
    patch.staffId = null; patch.staff = []
    const { data: busy } = await c.rpc('busy_periods', { p_from: iso(Date.now() - 7 * 864e5), p_to: iso(Date.now() + 120 * 864e5) })
    const mine: Booking[] = patch.bookings ?? []
    const mineUnits = new Set(mine.flatMap(b => b.items.flatMap(i => i.unitIds)))
    const ghosts: Booking[] = ((busy ?? []) as any[]).filter(r => !mineUnits.has(r.unit_id)).map((r, i) => {
      const pid = (patch.units ?? st().units).find((u: Unit) => u.id === r.unit_id)?.productId ?? ''
      return { id: `busy-${i}`, code: '', customerId: '', city: 'almaty', items: [{ productId: pid, qty: 1, price: 0, unitIds: [r.unit_id] }], start: ts(r.start_at), end: ts(r.end_at), days: 1,
        subtotal: 0, discount: 0, delivery: 0, total: 0, deposit: 0, paid: 0, paymentStatus: 'unpaid', paymentMethod: 'kaspi', deliveryType: 'pickup', status: r.issued ? 'issued' : 'confirmed', source: 'app', createdAt: 0, history: [] }
    })
    patch.bookings = [...mine, ...ghosts]
    if (!patch.customers) patch.customers = []
    patch.leads = []
  }
  useStore.setState(patch)
}

/* ---------- PixelApi ---------- */
export const SupabaseAdapter: PixelApi = {
  name: 'supabase',
  listProducts: async () => st().products,
  getProduct: async id => st().products.find(p => p.id === id) ?? null,
  listUnits: async () => st().units,
  availability: async (city, start, end) => {
    const { data, error } = await client().rpc('availability', { p_city: city, p_start: iso(start), p_end: iso(end) })
    if (error || !data) { const s = st(); return availMap(s.units, s.bookings, city, start, end) }
    const m = new Map<string, { total: number; free: number; otherFree: number; next: number | null }>()
    for (const r of data as any[]) m.set(r.product_id, { total: r.total, free: r.free, otherFree: 0, next: null })
    return m
  },
  getSettings: async () => st().settings,

  requestOtp: async phone => {
    if (DEMO_OTP) return ok({ sentTo: phone })
    const { error } = await client().auth.signInWithOtp({ phone: phone.replace(/[^\d+]/g, '') })
    return error ? fail(error) : ok({ sentTo: phone })
  },
  verifyOtp: async (phone, code) => {
    const c = client()
    if (DEMO_OTP) {
      // демо: код 1234 → анонимная сессия (только при VITE_DEMO_OTP=true, в проде — настоящий SMS)
      if (code !== '1234') return { ok: false, error: 'Неверный код' }
      const { error } = await c.auth.signInAnonymously(); if (error) return fail(error)
    } else {
      const { error } = await c.auth.verifyOtp({ phone: phone.replace(/[^\d+]/g, ''), token: code, type: 'sms' }); if (error) return fail(error)
    }
    const { data: { user } } = await c.auth.getUser()
    const { data: me } = await c.from('customers').select('*').eq('user_id', user!.id).maybeSingle()
    if (!me) return ok({ customer: null })
    const cu = toCustomer(me)
    useStore.setState(s => ({ customers: [cu, ...s.customers.filter(x => x.id !== cu.id)], meId: cu.id }))
    await hydrate()
    return ok({ customer: cu })
  },
  register: async d => {
    const c = client()
    const { data: { user } } = await c.auth.getUser()
    if (!user) return { ok: false, error: 'Сначала подтвердите номер' }
    const hasId = !!(d.idFront && d.idBack)
    const { data, error } = await c.from('customers').insert({ user_id: user.id, name: d.name.trim(), phone: d.phone, email: d.email, iin: d.iin, verification: hasId ? 'pending' : 'none', consent_at: hasId ? iso(Date.now()) : null }).select().single()
    if (error) return fail(error)
    if (hasId) { const r = await uploadScans(data.id, user.id, d.idFront!, d.idBack!); if (!r.ok) return r }
    const cu = toCustomer(data)
    useStore.setState(s => ({ customers: [cu, ...s.customers], meId: cu.id }))
    return ok(cu)
  },
  submitId: async (front, back) => {
    const c = client()
    const { data: { user } } = await c.auth.getUser()
    const me = st().customers.find(x => x.id === st().meId)
    if (!user || !me) return { ok: false, error: 'Войдите заново' }
    const r = await uploadScans(me.id, user.id, front, back); if (!r.ok) return r
    await c.from('customers').update({ verification: 'pending', consent_at: iso(Date.now()), reject_reason: null }).eq('id', me.id)
    st().submitId('', '') // локально: статус «на проверке» (сами сканы в стор не кладём)
    return ok(null)
  },
  signOut: async () => { await client().auth.signOut(); st().logout() },
  myBookings: async () => { const s = st(); return s.bookings.filter(b => b.customerId === s.meId) },
  placeOrder: async (f: CheckoutForm) => {
    const s = st()
    const { data, error } = await client().rpc('create_booking', {
      p_city: s.city, p_start: iso(s.range.start), p_end: iso(s.range.end),
      p_items: s.cart.map(l => ({ product_id: l.productId, qty: l.qty })),
      p_payment_method: f.paymentMethod, p_delivery_type: f.deliveryType, p_address: f.address ?? null, p_comment: f.comment ?? null, p_promo: f.promo || s.promo || null,
    })
    if (error) return fail(error)
    const { data: full } = await client().from('bookings').select(BOOKING_SELECT).eq('id', (data as any).id).single()
    const b = toBooking(full ?? data)
    useStore.setState(x => ({ bookings: [b, ...x.bookings], cart: [], promo: '' }))
    return ok(b)
  },
  cancelBooking: async id => { const { error } = await client().rpc('cancel_my_booking', { p_id: id }); if (error) return fail(error); st().cancelMyBooking(id); return ok(null) },
  createLead: async l => {
    const { error } = await client().from('leads').insert({ type: l.type, name: l.name, phone: l.phone, text: l.text, product_id: l.productId ?? null, city: l.city })
    if (error) return fail(error); st().createLead(l); return ok(null)
  },

  listBookings: async () => st().bookings,
  listCustomers: async () => st().customers,
  listStaff: async () => st().staff,
  setBookingStatus: async (id, s, note) => { st().setBookingStatus(id, s, note); return ok(null) },
  reviewCustomer: async (id, okk, reason) => {
    const { error } = await client().rpc('review_customer', { p_id: id, p_ok: okk, p_reason: reason ?? null })
    if (error) return fail(error); st().reviewCustomer(id, okk, reason); return ok(null)
  },
  upsertProduct: async p => { st().upsertProduct(p); return ok(null) },
  upsertUnit: async u => { st().upsertUnit(u); return ok(null) },
  updateSettings: async s => { st().updateSettings(s); return ok(null) },
}

async function uploadScans(customerId: string, uid: string, front: string, back: string): Promise<Result<null>> {
  const c = client()
  for (const [side, url] of [['front', front], ['back', back]] as const) {
    const path = `${uid}/${side}-${Date.now()}.jpg`
    const { error } = await c.storage.from('id-scans').upload(path, await dataUrlToBlob(url), { contentType: 'image/jpeg', upsert: true })
    if (error) return fail(error)
    const { error: e2 } = await c.from('id_scans').upsert({ customer_id: customerId, side, path }, { onConflict: 'customer_id,side' })
    if (e2) return fail(e2)
  }
  return ok(null)
}

/** Сканы для проверяющего: подписанные ссылки на 10 минут (bucket приватный) */
export async function scanUrls(customerId: string) {
  const { data } = await client().from('id_scans').select('side, path').eq('customer_id', customerId)
  const out: { front?: string; back?: string } = {}
  for (const r of data ?? []) { const { data: s } = await client().storage.from('id-scans').createSignedUrl(r.path, 600); if (s) (out as any)[r.side] = s.signedUrl }
  return out
}

/* ---------- правки из админки → база ---------- */
export function mirrorStoreWrites() {
  const c = client()
  const s = useStore.getState()
  const warn = (e: any) => { if (e) console.warn('[supabase]', e.message ?? e) }
  const wrap = <K extends keyof typeof s>(key: K, after: (...args: any[]) => Promise<unknown> | void) => {
    const orig = s[key] as any
    useStore.setState({ [key]: (...args: any[]) => { const r = orig(...args); Promise.resolve(after(...args)).catch(warn); return r } } as any)
  }
  const pushBooking = async (id: string) => {
    const b = st().bookings.find(x => x.id === id); if (!b) return
    const { error } = await c.from('bookings').update({ status: b.status, paid: b.paid, payment_status: b.paymentStatus, manager_id: b.managerId ?? null, history: b.history.map(h => ({ ...h, at: iso(h.at) })), comment: b.comment ?? null, address: b.address ?? null }).eq('id', id)
    warn(error)
  }
  wrap('setBookingStatus', (id: string) => pushBooking(id))
  wrap('patchBooking', (id: string) => pushBooking(id))
  wrap('addPayment', (id: string) => pushBooking(id))
  wrap('upsertProduct', async (p: Product) => warn((await c.from('products').upsert({ id: p.id, name: p.name, kind: p.kind, brand: p.brand, category_id: p.category, price: p.price, deposit: p.deposit, is_new: p.isNew, hidden: !!p.hidden, specs: p.specs, includes: p.includes ?? [], description: p.description ?? null, tags: p.tags, updated_at: iso(Date.now()) })).error))
  wrap('upsertUnit', async (u: Unit) => warn((await c.from('product_units').upsert({ id: u.id, product_id: u.productId, serial: u.serial, city: u.city, condition: u.condition, maintenance: u.maintenance, note: u.note ?? null })).error))
  wrap('removeUnit', async (id: string) => warn((await c.from('product_units').delete().eq('id', id)).error))
  wrap('upsertCustomer', async (cu: Customer) => warn((await c.from('customers').upsert({ id: cu.id, name: cu.name, phone: cu.phone, email: cu.email ?? null, company: cu.company ?? null, blacklisted: cu.blacklisted, note: cu.note ?? null, tags: cu.tags })).error))
  wrap('upsertLead', async (l: Lead) => warn((await c.from('leads').update({ status: l.status, assignee_id: l.assigneeId ?? null }).eq('id', l.id)).error))
  wrap('updateSettings', async () => { const x = st().settings; warn((await c.from('settings').update({ tiers: x.tiers, delivery_fee: x.deliveryFee, deposit_for_new: x.depositForNew, night_fee: x.nightFee, min_hours: x.minHours, points: x.points }).eq('id', 1)).error) })
  wrap('log', async (action: string, target?: string) => warn((await c.from('audit_log').insert({ staff_id: st().staffId, action, target: target ?? null })).error))
}

/* ---------- вход сотрудников (email + пароль) ---------- */
import { create } from 'zustand'
/** recovery — пришли по ссылке «сбросить пароль»; pendingRole — аккаунт есть, но роль ещё не выдана */
export const useStaffAuth = create<{ ready: boolean; recovery: boolean; email: string | null; pendingRole: boolean }>(() => ({ ready: false, recovery: false, email: null, pendingRole: false }))

let authInit = false
export function initStaffAuth() {
  if (authInit || !supabaseConfigured) return
  authInit = true
  const c = client()
  c.auth.getSession().then(async ({ data }) => {
    useStaffAuth.setState({ email: data.session?.user.email ?? null })
    if (data.session?.user.email) await afterStaffSignIn()
    useStaffAuth.setState({ ready: true })
  })
  c.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') useStaffAuth.setState({ recovery: true })
    if (ev === 'SIGNED_OUT') { useStaffAuth.setState({ email: null, pendingRole: false }); useStore.setState({ staffId: null }) }
    if (ev === 'SIGNED_IN') useStaffAuth.setState({ email: session?.user.email ?? null })
  })
}

async function afterStaffSignIn() {
  await hydrate()
  const isStaff = !!st().staffId
  useStaffAuth.setState({ pendingRole: !isStaff })
  if (isStaff) startRealtime()
}

export async function staffSignIn(email: string, password: string): Promise<Result<null>> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  if (error) return fail(error.message === 'Invalid login credentials' ? { message: 'Неверный email или пароль' } : error)
  await afterStaffSignIn()
  return ok(null)
}
export async function staffSignUp(email: string, password: string, name: string): Promise<Result<{ confirm: boolean }>> {
  const redirect = `${location.origin}/admin`
  const { data, error } = await client().auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: redirect } })
  if (error) return fail(error)
  if (data.session) await afterStaffSignIn()
  return ok({ confirm: !data.session })
}
export async function staffResetPassword(email: string): Promise<Result<null>> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` })
  return error ? fail(error) : ok(null)
}
export async function staffSetPassword(password: string): Promise<Result<null>> {
  const { error } = await client().auth.updateUser({ password })
  if (error) return fail(error)
  useStaffAuth.setState({ recovery: false })
  await afterStaffSignIn()
  return ok(null)
}
export async function staffSignOut() {
  stopRealtime()
  await client().auth.signOut()
  useStore.setState({ staffId: null })
}

/** бронь из админки: подбор единиц и защита от двойной брони — в базе */
export async function staffCreateBooking(d: { customerId: string | null; newName?: string; newPhone?: string; city: string; start: number; end: number; items: { productId: string; qty: number }[]; source?: string }): Promise<Result<Booking>> {
  const c = client()
  const { data, error } = await c.rpc('staff_create_booking', {
    p_customer_id: d.customerId, p_new_name: d.newName ?? null, p_new_phone: d.newPhone ?? null, p_city: d.city,
    p_start: iso(d.start), p_end: iso(d.end), p_items: d.items.map(i => ({ product_id: i.productId, qty: i.qty })), p_source: d.source ?? 'phone',
  })
  if (error) return fail(error)
  const [{ data: full }, { data: cust }] = await Promise.all([
    c.from('bookings').select(BOOKING_SELECT).eq('id', (data as any).id).single(),
    c.from('customers').select('*').eq('id', (data as any).customer_id).single(),
  ])
  const b = toBooking(full ?? data)
  useStore.setState(s => ({ bookings: [b, ...s.bookings.filter(x => x.id !== b.id)], customers: cust && !s.customers.some(x => x.id === cust.id) ? [toCustomer(cust), ...s.customers] : s.customers }))
  return ok(b)
}

/* ---------- живые обновления ---------- */
let channel: ReturnType<SupabaseClient['channel']> | null = null
function startRealtime() {
  if (channel) return
  const c = client()
  const upsert = <T extends { id: string }>(key: 'bookings' | 'leads' | 'customers', item: T) =>
    useStore.setState(s => ({ [key]: [item, ...(s[key] as any[]).filter(x => x.id !== item.id)] } as any))
  // удалённые в базе записи исчезают и из админки
  const remove = (key: 'bookings' | 'leads' | 'customers', id?: string) => { if (id) useStore.setState(s => ({ [key]: (s[key] as any[]).filter(x => x.id !== id) } as any)) }
  channel = c.channel('px-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async p => {
      if (p.eventType === 'DELETE') return remove('bookings', (p.old as any)?.id)
      const id = (p.new as any)?.id; if (!id) return
      const { data } = await c.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
      if (data) upsert('bookings', toBooking(data))
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, p => { if (p.eventType === 'DELETE') remove('leads', (p.old as any)?.id); else if ((p.new as any)?.id) upsert('leads', toLead(p.new)) })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, p => { if (p.eventType === 'DELETE') remove('customers', (p.old as any)?.id); else if ((p.new as any)?.id) upsert('customers', toCustomer(p.new)) })
    .subscribe()
  // вернулись на вкладку (или появилась сеть) — полная сверка со списком в базе
  const resync = () => { if (document.visibilityState === 'visible') hydrate().catch(() => {}) }
  document.addEventListener('visibilitychange', resync)
  addEventListener('online', resync)
}
function stopRealtime() { if (channel) { client().removeChannel(channel); channel = null } }
