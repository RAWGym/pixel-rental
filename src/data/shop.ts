/** Pixel Shop: продажа техники. Типы, каталог для демо (с pixel-shopkz.vercel.app) и фото. */
import zve10 from '../assets/shop/zve10.webp'
import r7 from '../assets/shop/r7.webp'
import d6d2 from '../assets/shop/6d2.webp'
import xe5 from '../assets/shop/xe5.webp'
import s1424 from '../assets/shop/s1424.webp'
import s1628 from '../assets/shop/s1628.webp'
import s2470ii from '../assets/shop/s2470ii.webp'
import s2470 from '../assets/shop/s2470.webp'
import s2870 from '../assets/shop/s2870.webp'
import s35 from '../assets/shop/s35.webp'
import g14 from '../assets/shop/g14.webp'
import g2470 from '../assets/shop/g2470.webp'
import g50 from '../assets/shop/g50.webp'

export type ShopCategory = 'cameras' | 'lenses'
export interface ShopProduct {
  id: string; sku?: string; brand: string; title: string; category: ShopCategory
  description?: string; specs: string[]; includes: string[]; condition: 'new' | 'used'
  price: number; oldPrice?: number; stock: number; active: boolean; sort: number; images: string[]; createdAt: number
}
export type ShopDelivery = 'pickup' | 'city' | 'kz'
export type ShopOrderStatus = 'whatsapp' | 'confirmed' | 'paid' | 'packed' | 'done' | 'cancelled'
export interface TradeIn { model: string; condition: 'excellent' | 'good' | 'defects'; complete?: string; shutter?: string; comment?: string }
export interface ShopOrderItem { productId: string; title: string; price: number; qty: number }
export interface ShopOrder {
  id: string; code: string; customerId?: string; name: string; phone: string; email?: string
  delivery: ShopDelivery; address?: string; payment: string; promo?: string
  subtotal: number; discount: number; deliveryFee: number | null; total: number
  tradein?: TradeIn; comment?: string; status: ShopOrderStatus; items: ShopOrderItem[]
  history: { at: number; by: string; text: string }[]; createdAt: number
}
export interface ShopPromo { code: string; percent?: number; amount?: number; active: boolean; validUntil?: number; maxUses?: number; uses: number }
export interface ShopSettings { waPhone: string; hours: string; deliveryCityFee: number; deliveryKzFee: number | null; payments: string[]; note?: string }

export const SHOP_STATUS: Record<ShopOrderStatus, { label: string; tone: 'warn' | 'info' | 'ok' | 'accent' | 'muted' | 'bad' }> = {
  whatsapp: { label: 'Ожидает связи в WhatsApp', tone: 'warn' }, confirmed: { label: 'Подтверждён', tone: 'info' }, paid: { label: 'Оплачен', tone: 'accent' },
  packed: { label: 'Собран', tone: 'accent' }, done: { label: 'Выдан', tone: 'ok' }, cancelled: { label: 'Отменён', tone: 'bad' },
}
export const TRADEIN_COND: Record<TradeIn['condition'], string> = { excellent: 'Отличное', good: 'Хорошее', defects: 'Есть дефекты' }
export const DELIVERY_LABEL: Record<ShopDelivery, string> = { pickup: 'Самовывоз', city: 'Доставка по Алматы', kz: 'Доставка по Казахстану' }
export const SHOP_CAT_LABEL: Record<ShopCategory, string> = { cameras: 'Камеры', lenses: 'Объективы' }

/** встроенные фото: в базе хранится asset:<id> */
const ASSETS: Record<string, string> = { zve10, r7, '6d2': d6d2, xe5, s1424, s1628, s2470ii, s2470, s2870, s35, g14, g2470, g50 }
export const shopImage = (ref?: string) => (!ref ? undefined : ref.startsWith('asset:') ? ASSETS[ref.slice(6)] : ref)

const ROWS: [string, string, string, ShopCategory, string[], number, number][] = [
  ['zve10', 'Sony', 'ZV-E10', 'cameras', ['4K', 'APS-C'], 239990, 1], ['r7', 'Canon', 'EOS R7', 'cameras', ['32.5 МП', 'APS-C'], 519000, 1],
  ['6d2', 'Canon', 'EOS 6D Mark II', 'cameras', ['26.2 МП', 'Full frame'], 300000, 1], ['xe5', 'Fujifilm', 'X-E5 kit', 'cameras', ['40 МП', 'APS-C', 'Kit'], 600000, 1],
  ['s1424', 'Sigma', '14-24mm f/2.8', 'lenses', ['14-24 мм', 'f/2.8'], 550000, 1], ['s1628', 'Sigma', '16-28mm f/2.8', 'lenses', ['16-28 мм', 'f/2.8'], 300000, 1],
  ['s2470ii', 'Sigma', '24-70mm f/2.8 II', 'lenses', ['24-70 мм', 'f/2.8', 'II'], 420000, 2], ['s2470', 'Sigma', '24-70mm f/2.8', 'lenses', ['24-70 мм', 'f/2.8'], 356000, 2],
  ['s2870', 'Sigma', '28-70mm f/2.8', 'lenses', ['28-70 мм', 'f/2.8'], 299990, 1], ['s35', 'Sigma', '35mm', 'lenses', ['35 мм', 'Canon EF'], 280000, 1],
  ['g14', 'Sony', 'FE 14mm f/1.8 GM', 'lenses', ['14 мм', 'f/1.8', 'G Master'], 400000, 1], ['g2470', 'Sony', 'FE 24-70mm f/2.8 GM', 'lenses', ['24-70 мм', 'f/2.8', 'G Master'], 600000, 1],
  ['g50', 'Sony', 'FE 50mm f/1.4 GM', 'lenses', ['50 мм', 'f/1.4', 'G Master'], 525000, 1],
]
export const DEMO_SHOP_PRODUCTS: ShopProduct[] = ROWS.map(([id, brand, title, category, specs, price, stock], i) => ({
  id, brand, title, category, specs, includes: [], condition: 'new', price, stock, active: true, sort: i + 1, images: [`asset:${id}`], createdAt: Date.UTC(2026, 10, 1 + i),
}))
export const DEFAULT_SHOP_SETTINGS: ShopSettings = { waPhone: '77075077971', hours: 'Круглосуточно', deliveryCityFee: 3000, deliveryKzFee: null, payments: ['Kaspi перевод', 'Kaspi рассрочка', 'Наличные', 'Карта при получении'] }
export const DEMO_SHOP_PROMOS: ShopPromo[] = [{ code: 'SHOP5', percent: 5, active: true, uses: 0 }]

export const shopName = (p: Pick<ShopProduct, 'brand' | 'title'>) => `${p.brand} ${p.title}`

/** скидка по промокоду (та же формула, что в базе) */
export function promoDiscount(p: ShopPromo | undefined, subtotal: number): { ok: true; discount: number; code: string } | { ok: false; error: string } {
  if (!p || !p.active) return { ok: false, error: 'Промокод не найден' }
  if (p.validUntil && p.validUntil < Date.now()) return { ok: false, error: 'Срок промокода истёк' }
  if (p.maxUses != null && p.uses >= p.maxUses) return { ok: false, error: 'Промокод уже использован' }
  return { ok: true, code: p.code, discount: Math.min(subtotal, Math.round((subtotal * (p.percent ?? 0)) / 100) + (p.amount ?? 0)) }
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ | /g, ' ') + ' ₸'
/** текст для WhatsApp: аккуратно, с переносами строк, не длиннее ~3900 символов */
export function waMessage(o: ShopOrder, opts: { address?: string } = {}): string {
  const L: string[] = [`Здравствуйте! Хочу оформить заказ ${o.code} в Pixel Shop.`, '', 'Товары:']
  o.items.forEach((i, n) => L.push(`${n + 1}. ${i.title}, ${i.qty} шт × ${fmt(i.price)}`))
  L.push('')
  if (o.promo) L.push(`Промокод ${o.promo}: скидка ${fmt(o.discount)}`)
  L.push(o.delivery === 'pickup' ? `Получение: самовывоз${opts.address ? `, ${opts.address}` : ''}` : `Получение: ${DELIVERY_LABEL[o.delivery]}, ${o.address ?? ''}`)
  if (o.delivery !== 'pickup') L.push(o.deliveryFee == null ? 'Стоимость доставки уточните, пожалуйста' : `Доставка: ${fmt(o.deliveryFee)}`)
  L.push(`Оплата: ${o.payment}`)
  if (o.tradein) {
    const t = o.tradein
    L.push('', 'Трейд-ин:', `Модель: ${t.model}`, `Состояние: ${TRADEIN_COND[t.condition]}`)
    if (t.complete) L.push(`Комплект: ${t.complete}`)
    if (t.shutter) L.push(`Пробег затвора: ${t.shutter}`)
    if (t.comment) L.push(`Комментарий: ${t.comment}`)
    L.push('Фото пришлю в этом чате.')
  }
  L.push('', `Итого к оплате: ${fmt(o.total)}${o.delivery !== 'pickup' && o.deliveryFee == null ? ' + доставка' : ''}`, `Имя: ${o.name}`, `Телефон: ${o.phone}`)
  if (o.comment) L.push(`Комментарий: ${o.comment}`)
  const text = L.join('\n')
  if (text.length > 3800 && o.tradein?.comment && o.tradein.comment.length > 200) return waMessage({ ...o, tradein: { ...o.tradein, comment: o.tradein.comment.slice(0, 200) + '…' } }, opts)
  return text.slice(0, 3900)
}
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
