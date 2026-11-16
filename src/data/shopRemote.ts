/** Pixel Shop ↔ Supabase: каталог, заказы, промокоды, настройки. Модуль грузится лениво (вместе с клиентом Supabase). */
import { client } from './supabase'
import { useShop } from '../store/shop'
import { useStore } from '../store/store'
import type { Result } from './api'
import type { ShopOrder, ShopProduct, ShopPromo, ShopSettings, ShopOrderStatus } from './shop'
import type { ShopCheckout } from '../store/shop'

const ts = (s?: string | null) => (s ? new Date(s).getTime() : 0)
const ok = <T,>(data: T): Result<T> => ({ ok: true, data })
const fail = (e: any): { ok: false; error: string } => ({ ok: false, error: e?.message ?? String(e) })

const toProduct = (r: any): ShopProduct => ({
  id: r.id, sku: r.sku ?? undefined, brand: r.brand, title: r.title, category: r.category_id, description: r.description ?? undefined, specs: r.specs ?? [], includes: r.includes ?? [],
  condition: r.condition, price: r.price, oldPrice: r.old_price ?? undefined, stock: r.stock, active: r.is_active, sort: r.sort, images: r.images ?? [], createdAt: ts(r.created_at),
})
export const toShopOrder = (r: any): ShopOrder => ({
  id: r.id, code: r.code, customerId: r.customer_id ?? undefined, name: r.name, phone: r.phone, email: r.email ?? undefined, delivery: r.delivery_type, address: r.address ?? undefined,
  payment: r.payment, promo: r.promo ?? undefined, subtotal: r.subtotal, discount: r.discount, deliveryFee: r.delivery_fee, total: r.total, tradein: r.tradein ?? undefined,
  comment: r.comment ?? undefined, status: r.status, items: (r.shop_order_items ?? []).map((i: any) => ({ productId: i.product_id, title: i.title, price: i.price, qty: i.qty })),
  history: (r.history ?? []).map((h: any) => ({ at: ts(h.at), by: h.by, text: h.text })), createdAt: ts(r.created_at),
})
const toSettings = (r: any): ShopSettings => ({ waPhone: r.wa_phone, hours: r.hours, deliveryCityFee: r.delivery_city_fee, deliveryKzFee: r.delivery_kz_fee, payments: r.payments ?? [], note: r.note ?? undefined })
const toPromo = (r: any): ShopPromo => ({ code: r.code, percent: r.percent ?? undefined, amount: r.amount ?? undefined, active: r.active, validUntil: ts(r.valid_until) || undefined, maxUses: r.max_uses ?? undefined, uses: r.uses })
const ORDER_SELECT = '*, shop_order_items(product_id, title, price, qty)'

export async function hydrateShop() {
  const c = client()
  const [{ data: prods }, { data: set }] = await Promise.all([c.from('shop_products').select('*').order('sort'), c.from('shop_settings').select('*').eq('id', 1).maybeSingle()])
  const patch: any = {}
  if (prods) patch.products = prods.map(toProduct)
  if (set) patch.settings = toSettings(set)
  const st = useStore.getState()
  const can = (p: any) => st.can(p)
  if (st.staffId && (can('shop') || can('shop.view'))) {
    const { data: orders } = await c.from('shop_orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(2000)
    patch.orders = (orders ?? []).map(toShopOrder)
    if (can('shop')) { const { data: promos } = await c.from('shop_promos').select('*').order('code'); patch.promos = (promos ?? []).map(toPromo) }
  } else if (st.meId) {
    const { data: orders } = await c.from('shop_orders').select(ORDER_SELECT).order('created_at', { ascending: false })
    patch.orders = (orders ?? []).map(toShopOrder)
  } else patch.orders = []
  useShop.setState(patch)
}

/** заказ: атомарно в базе (остаток, промокод, доставка) */
export async function createShopOrder(f: ShopCheckout): Promise<Result<ShopOrder>> {
  const c = client()
  const cart = useShop.getState().cart
  const { data, error } = await c.rpc('create_shop_order', {
    p_items: cart.map(l => ({ product_id: l.productId, qty: l.qty })), p_name: f.name, p_phone: f.phone, p_delivery_type: f.delivery, p_payment: f.payment,
    p_address: f.address ?? null, p_promo: f.promo || null, p_comment: f.comment ?? null, p_tradein: f.tradein ?? null, p_email: f.email ?? null,
  })
  if (error) return fail(error)
  // гость не может прочитать заказ из таблицы — собираем из ответа и корзины
  const s = useShop.getState()
  const order: ShopOrder = { ...toShopOrder(data), items: cart.map(l => { const p = s.products.find(x => x.id === l.productId)!; return { productId: l.productId, title: `${p.brand} ${p.title}`, price: p.price, qty: l.qty } }) }
  useShop.setState(x => ({ orders: [order, ...x.orders], cart: [], products: x.products.map(p => { const l = cart.find(i => i.productId === p.id); return l ? { ...p, stock: Math.max(0, p.stock - l.qty) } : p }) }))
  return ok(order)
}

export async function checkShopPromo(code: string, subtotal: number): Promise<Result<{ code: string; discount: number }>> {
  const { data, error } = await client().rpc('check_shop_promo', { p_code: code, p_subtotal: subtotal })
  if (error) return fail(error)
  return (data as any).ok ? ok({ code: (data as any).code, discount: (data as any).discount }) : { ok: false, error: (data as any).error }
}

export async function setShopOrderStatusRemote(id: string, status: ShopOrderStatus, note?: string): Promise<Result<ShopOrder>> {
  const c = client()
  const { error } = await c.rpc('set_shop_order_status', { p_id: id, p_status: status, p_note: note ?? null })
  if (error) return fail(error)
  const { data } = await c.from('shop_orders').select(ORDER_SELECT).eq('id', id).single()
  const o = toShopOrder(data)
  useShop.getState().upsertOrder(o)
  if (status === 'cancelled') { const { data: prods } = await c.from('shop_products').select('*').order('sort'); if (prods) useShop.setState({ products: prods.map(toProduct) }) }
  return ok(o)
}

/** правки каталога, настроек и промокодов из админки → база */
export function mirrorShopWrites() {
  const c = client()
  const s = useShop.getState()
  const warn = (e: any) => { if (e) console.warn('[shop]', e.message ?? e) }
  const wrap = <K extends keyof typeof s>(key: K, after: (...a: any[]) => Promise<unknown>) => {
    const orig = s[key] as any
    useShop.setState({ [key]: (...a: any[]) => { const r = orig(...a); after(...a).catch(warn); return r } } as any)
  }
  wrap('upsertProduct', async (p: ShopProduct) => warn((await c.from('shop_products').upsert({
    id: p.id, sku: p.sku ?? null, brand: p.brand, title: p.title, category_id: p.category, description: p.description ?? null, specs: p.specs, includes: p.includes, condition: p.condition,
    price: p.price, old_price: p.oldPrice ?? null, stock: p.stock, is_active: p.active, sort: p.sort, images: p.images, updated_at: new Date().toISOString(),
  })).error))
  wrap('removeProduct', async (id: string) => warn((await c.from('shop_products').update({ is_active: false }).eq('id', id)).error))
  wrap('updateSettings', async () => { const x = useShop.getState().settings; warn((await c.from('shop_settings').update({ wa_phone: x.waPhone, hours: x.hours, delivery_city_fee: x.deliveryCityFee, delivery_kz_fee: x.deliveryKzFee, payments: x.payments, note: x.note ?? null }).eq('id', 1)).error) })
  wrap('upsertPromo', async (p: ShopPromo) => warn((await c.from('shop_promos').upsert({ code: p.code, percent: p.percent ?? null, amount: p.amount ?? null, active: p.active, valid_until: p.validUntil ? new Date(p.validUntil).toISOString() : null, max_uses: p.maxUses ?? null, uses: p.uses })).error))
  wrap('removePromo', async (code: string) => warn((await c.from('shop_promos').delete().eq('code', code)).error))
}

/** живые заказы для сотрудников магазина */
let ch: ReturnType<ReturnType<typeof client>['channel']> | null = null
export function startShopRealtime() {
  if (ch) return
  const c = client()
  ch = c.channel('px-shop')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_orders' }, async p => {
      const id = (p.new as any)?.id; if (!id) return
      const { data } = await c.from('shop_orders').select(ORDER_SELECT).eq('id', id).maybeSingle()
      if (data) useShop.getState().upsertOrder(toShopOrder(data))
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shop_products' }, p => { if ((p.new as any)?.id) useShop.setState(s => ({ products: s.products.map(x => x.id === (p.new as any).id ? toProduct(p.new) : x) })) })
    .subscribe()
}

/** фото товара в публичный bucket shop-photos */
export async function uploadShopPhoto(productId: string, file: Blob): Promise<Result<string>> {
  const c = client()
  const path = `${productId}/${Date.now().toString(36)}.webp`
  const { error } = await c.storage.from('shop-photos').upload(path, file, { contentType: file.type || 'image/webp', upsert: false })
  if (error) return fail(error)
  return ok(c.storage.from('shop-photos').getPublicUrl(path).data.publicUrl)
}
