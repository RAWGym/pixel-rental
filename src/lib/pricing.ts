import type { Settings } from '../data/types'

export const HOUR = 3600000
export const DAY = 86400000

export function rentalDays(start: number, end: number) {
  return Math.max(1, Math.ceil((end - start - 60000) / DAY))
}

export function tierFor(days: number, settings: Settings) {
  return [...settings.tiers].sort((a, b) => b.days - a.days).find(t => days >= t.days)
}

export function calcPrice(items: { price: number; qty: number }[], days: number, settings: Settings, promo?: string, deliveryFee = 0) {
  const perDay = items.reduce((s, i) => s + i.price * i.qty, 0)
  const subtotal = perDay * days
  const tier = tierFor(days, settings)
  const p = promo ? settings.promos.find(x => x.active && x.code.toUpperCase() === promo.toUpperCase()) : undefined
  const percent = Math.max(tier?.percent ?? 0, p?.percent ?? 0)
  const discount = Math.round((subtotal * percent) / 100 / 10) * 10
  return { perDay, subtotal, percent, tier, promo: p, discount, delivery: deliveryFee, total: subtotal - discount + deliveryFee }
}

export function nextTier(days: number, settings: Settings) {
  return [...settings.tiers].sort((a, b) => a.days - b.days).find(t => t.days > days)
}
