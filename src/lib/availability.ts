import type { Booking, CityId, Unit } from '../data/types'

const ACTIVE = new Set(['new', 'confirmed', 'issued'])
export const isActive = (b: Booking) => ACTIVE.has(b.status)

export function busyUnitIds(bookings: Booking[], start: number, end: number, exceptId?: string) {
  const s = new Set<string>()
  for (const b of bookings) {
    if (!isActive(b) || b.id === exceptId) continue
    // уже вернули: свободно; выдано и просрочено: занято до возврата
    const bEnd = b.status === 'issued' ? Math.max(b.end, Date.now()) : b.end
    if (start < bEnd && b.start < end) for (const it of b.items) for (const u of it.unitIds) s.add(u)
  }
  return s
}

export function freeUnits(units: Unit[], bookings: Booking[], productId: string, city: CityId | 'all', start: number, end: number, exceptId?: string) {
  const busy = busyUnitIds(bookings, start, end, exceptId)
  return units.filter(u => u.productId === productId && (city === 'all' || u.city === city) && !u.maintenance && u.condition !== 'repair' && !busy.has(u.id))
}

export function totalUnits(units: Unit[], productId: string, city: CityId | 'all') {
  return units.filter(u => u.productId === productId && (city === 'all' || u.city === city) && !u.maintenance && u.condition !== 'repair').length
}

/** ближайшее время, когда освободится хотя бы одна единица */
export function nextFree(units: Unit[], bookings: Booking[], productId: string, city: CityId, from: number) {
  const mine = units.filter(u => u.productId === productId && u.city === city && !u.maintenance)
  if (!mine.length) return null
  let best = Infinity
  for (const u of mine) {
    let t = from
    const bs = bookings.filter(b => isActive(b) && b.items.some(i => i.unitIds.includes(u.id))).sort((a, b) => a.start - b.start)
    for (const b of bs) { const e = b.status === 'issued' ? Math.max(b.end, Date.now()) : b.end; if (b.start <= t && e > t) t = e }
    best = Math.min(best, t)
  }
  return best === Infinity ? null : best
}

/** загрузка по дням: доля занятых единиц в каждый день */
export function dayLoad(units: Unit[], bookings: Booking[], productId: string, city: CityId, dayStart: number) {
  const total = totalUnits(units, productId, city)
  if (!total) return { free: 0, total: 0 }
  const f = freeUnits(units, bookings, productId, city, dayStart + 9 * 3600000, dayStart + 21 * 3600000).length
  return { free: f, total }
}

export interface Avail { total: number; free: number; otherFree: number; next: number | null }
const EMPTY: Avail = { total: 0, free: 0, otherFree: 0, next: null }

/** Наличие сразу по всем товарам: занятые единицы считаются один раз.
 *  Кэш на один набор аргументов (сравнение по ссылке) — все карточки делят один результат. */
type AvailCache = { units: Unit[]; bookings: Booking[]; city: CityId; start: number; end: number; map: Map<string, Avail> }
let caches: AvailCache[] = [] // несколько последних наборов: «мои даты» и «сегодня» не вытесняют друг друга
export function availMap(units: Unit[], bookings: Booking[], city: CityId, start: number, end: number): Map<string, Avail> {
  const hit = caches.find(c => c.units === units && c.bookings === bookings && c.city === city && c.start === start && c.end === end)
  if (hit) return hit.map
  const busy = busyUnitIds(bookings, start, end)
  const map = new Map<string, Avail>()
  for (const u of units) {
    if (u.maintenance || u.condition === 'repair') continue
    let a = map.get(u.productId)
    if (!a) { a = { total: 0, free: 0, otherFree: 0, next: null }; map.set(u.productId, a) }
    const isFree = !busy.has(u.id)
    if (u.city === city) { a.total++; if (isFree) a.free++ }
    else if (isFree) a.otherFree++
  }
  // ближайшее окно для занятых товаров: индекс «единица → брони» строим один раз
  const busyProducts = new Set<string>()
  for (const [pid, a] of map) if (a.free === 0 && a.total > 0) busyProducts.add(pid)
  if (busyProducts.size) {
    const byUnit = new Map<string, Booking[]>()
    for (const b of bookings) {
      if (!isActive(b)) continue
      for (const it of b.items) if (busyProducts.has(it.productId)) for (const id of it.unitIds) {
        const l = byUnit.get(id); if (l) l.push(b); else byUnit.set(id, [b])
      }
    }
    const now = Date.now()
    for (const u of units) {
      if (u.city !== city || u.maintenance || !busyProducts.has(u.productId)) continue
      let t = start
      for (const b of (byUnit.get(u.id) ?? []).sort((x, y) => x.start - y.start)) { const e = b.status === 'issued' ? Math.max(b.end, now) : b.end; if (b.start <= t && e > t) t = e }
      const a = map.get(u.productId)!
      a.next = a.next === null ? t : Math.min(a.next, t)
    }
  }
  caches = [{ units, bookings, city, start, end, map }, ...caches].slice(0, 3)
  return map
}
export const availOf = (m: Map<string, Avail>, productId: string) => m.get(productId) ?? EMPTY

/** Загрузка товара по дням (n дней от from): индекс «единица → брони» строится один раз */
export function dayStrip(units: Unit[], bookings: Booking[], productId: string, city: CityId, from: number, n: number) {
  const mine = units.filter(u => u.productId === productId && u.city === city && !u.maintenance && u.condition !== 'repair')
  const ids = new Set(mine.map(u => u.id))
  const spans: { unit: string; s: number; e: number }[] = []
  const now = Date.now()
  for (const b of bookings) {
    if (!isActive(b)) continue
    const e = b.status === 'issued' ? Math.max(b.end, now) : b.end
    for (const it of b.items) if (it.productId === productId) for (const id of it.unitIds) if (ids.has(id)) spans.push({ unit: id, s: b.start, e })
  }
  const DAYMS = 86400000
  return Array.from({ length: n }, (_, i) => {
    const t = from + i * DAYMS, s = t + 9 * 3600000, e = t + 21 * 3600000
    const busy = new Set<string>()
    for (const sp of spans) if (s < sp.e && sp.s < e) busy.add(sp.unit)
    return { t, total: mine.length, free: mine.length - busy.size }
  })
}
