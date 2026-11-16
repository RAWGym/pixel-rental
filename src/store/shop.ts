/**
 * Состояние магазина Pixel Shop: каталог, корзина покупок (отдельно от аренды), заказы, настройки.
 * Демо: всё хранится в браузере. Общая база: каталог и заказы приходят из Supabase (data/supabase.ts → hydrateShop),
 * правки из админки дублируются туда же (mirrorShopWrites).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEMO_SHOP_PRODUCTS, DEFAULT_SHOP_SETTINGS, DEMO_SHOP_PROMOS, promoDiscount, shopName, type ShopOrder, type ShopOrderStatus, type ShopProduct, type ShopPromo, type ShopSettings, type ShopDelivery, type TradeIn } from '../data/shop'
import { useStore } from './store'

const LIVE_DB = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
export interface ShopLine { productId: string; qty: number }
export interface ShopCheckout {
  name: string; phone: string; email?: string; delivery: ShopDelivery; address?: string; payment: string
  promo?: string; comment?: string; tradein?: TradeIn
}

interface ShopState {
  products: ShopProduct[]
  orders: ShopOrder[]
  settings: ShopSettings
  promos: ShopPromo[]
  cart: ShopLine[]
  addToCart: (id: string, qty?: number) => void
  setQty: (id: string, qty: number) => void
  clearCart: () => void
  /** демо: оформить заказ локально (в общей базе — RPC create_shop_order) */
  placeOrderLocal: (f: ShopCheckout) => { ok: true; order: ShopOrder } | { ok: false; error: string }
  upsertProduct: (p: ShopProduct) => void
  removeProduct: (id: string) => void
  setOrderStatus: (id: string, s: ShopOrderStatus, note?: string) => void
  upsertOrder: (o: ShopOrder) => void
  updateSettings: (s: Partial<ShopSettings>) => void
  upsertPromo: (p: ShopPromo) => void
  removePromo: (code: string) => void
}

const who = () => { const s = useStore.getState(); return s.staff.find(x => x.id === s.staffId)?.name.split(' ')[0] ?? 'Система' }
const LABEL: Record<ShopOrderStatus, string> = { whatsapp: 'Ожидает связи в WhatsApp', confirmed: 'Подтверждён', paid: 'Оплачен', packed: 'Собран', done: 'Выдан', cancelled: 'Отменён, остаток возвращён' }

export const useShop = create<ShopState>()(persist((set, get) => ({
  products: DEMO_SHOP_PRODUCTS,
  orders: [],
  settings: DEFAULT_SHOP_SETTINGS,
  promos: DEMO_SHOP_PROMOS,
  cart: [],
  addToCart: (id, qty = 1) => set(s => {
    const p = s.products.find(x => x.id === id); const max = p?.stock ?? 0
    const ex = s.cart.find(c => c.productId === id)
    if (ex) return { cart: s.cart.map(c => c.productId === id ? { ...c, qty: Math.min(max, c.qty + qty) } : c) }
    return { cart: max > 0 ? [...s.cart, { productId: id, qty: Math.min(max, qty) }] : s.cart }
  }),
  setQty: (id, qty) => set(s => ({ cart: qty <= 0 ? s.cart.filter(c => c.productId !== id) : s.cart.map(c => c.productId === id ? { ...c, qty } : c) })),
  clearCart: () => set({ cart: [] }),
  placeOrderLocal: f => {
    const s = get()
    const lines = s.cart.map(c => ({ c, p: s.products.find(p => p.id === c.productId) })).filter(x => x.p && x.p.active)
    if (!lines.length) return { ok: false, error: 'Корзина пуста' }
    for (const { c, p } of lines) if (p!.stock < c.qty) return { ok: false, error: `${shopName(p!)}: в наличии ${p!.stock}` }
    const subtotal = lines.reduce((a, { c, p }) => a + p!.price * c.qty, 0)
    let discount = 0, promo: string | undefined
    if (f.promo?.trim()) {
      const pr = promoDiscount(s.promos.find(x => x.code.toUpperCase() === f.promo!.trim().toUpperCase()), subtotal)
      if (!pr.ok) return { ok: false, error: pr.error }
      discount = pr.discount; promo = pr.code
    }
    const deliveryFee = f.delivery === 'pickup' ? 0 : f.delivery === 'city' ? s.settings.deliveryCityFee : s.settings.deliveryKzFee
    const n = 1001 + s.orders.length
    const order: ShopOrder = {
      id: `so-${Date.now().toString(36)}`, code: `SP-${n}`, customerId: useStore.getState().meId ?? undefined, name: f.name.trim(), phone: f.phone, email: f.email,
      delivery: f.delivery, address: f.delivery === 'pickup' ? undefined : f.address, payment: f.payment, promo, subtotal, discount, deliveryFee,
      total: subtotal - discount + (deliveryFee ?? 0), tradein: f.tradein, comment: f.comment?.trim() || undefined, status: 'whatsapp',
      items: lines.map(({ c, p }) => ({ productId: p!.id, title: shopName(p!), price: p!.price, qty: c.qty })),
      history: [{ at: Date.now(), by: 'Клиент', text: 'Заказ создан, ожидает связи в WhatsApp' }], createdAt: Date.now(),
    }
    set({
      orders: [order, ...s.orders], cart: [],
      products: s.products.map(p => { const l = lines.find(x => x.p!.id === p.id); return l ? { ...p, stock: p.stock - l.c.qty } : p }),
      promos: promo ? s.promos.map(x => x.code === promo ? { ...x, uses: x.uses + 1 } : x) : s.promos,
    })
    return { ok: true, order }
  },
  upsertProduct: p => { set(s => ({ products: s.products.some(x => x.id === p.id) ? s.products.map(x => x.id === p.id ? p : x) : [...s.products, p] })); useStore.getState().log('Товар магазина сохранён', shopName(p)) },
  removeProduct: id => set(s => ({ products: s.products.filter(p => p.id !== id) })),
  setOrderStatus: (id, status, note) => {
    const o = get().orders.find(x => x.id === id); if (!o || o.status === 'cancelled') return
    set(s => ({
      orders: s.orders.map(x => x.id !== id ? x : { ...x, status, history: [...x.history, { at: Date.now(), by: who(), text: LABEL[status] + (note?.trim() ? `: ${note.trim()}` : '') }] }),
      // отмена возвращает остаток
      products: status === 'cancelled' ? s.products.map(p => { const i = o.items.find(it => it.productId === p.id); return i ? { ...p, stock: p.stock + i.qty } : p }) : s.products,
    }))
    useStore.getState().log(`Заказ магазина: ${LABEL[status]}`, o.code)
  },
  upsertOrder: o => set(s => ({ orders: s.orders.some(x => x.id === o.id) ? s.orders.map(x => x.id === o.id ? o : x) : [o, ...s.orders] })),
  updateSettings: patch => { set(s => ({ settings: { ...s.settings, ...patch } })); useStore.getState().log('Настройки магазина изменены') },
  upsertPromo: p => set(s => ({ promos: s.promos.some(x => x.code === p.code) ? s.promos.map(x => x.code === p.code ? p : x) : [...s.promos, p] })),
  removePromo: code => set(s => ({ promos: s.promos.filter(p => p.code !== code) })),
}), {
  name: 'pixel-shop-v1',
  version: 1,
  // с общей базой в браузере хранится только корзина
  partialize: s => (LIVE_DB ? { cart: s.cart } : { products: s.products, orders: s.orders, settings: s.settings, promos: s.promos, cart: s.cart }) as any,
}))

export const useShopCartCount = () => useShop(s => s.cart.reduce((a, c) => a + c.qty, 0))
