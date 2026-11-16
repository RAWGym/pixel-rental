import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Search, X, ShoppingBag, Check, Copy, MessageCircle, Repeat, Truck, Store, CreditCard, PackageSearch, Wallet, Tag } from 'lucide-react'
import { useNav, useRoute } from '../store/nav'
import { useStore, useMe } from '../store/store'
import { useShop, type ShopCheckout } from '../store/shop'
import { DELIVERY_LABEL, SHOP_CAT_LABEL, SHOP_STATUS, TRADEIN_COND, promoDiscount, shopImage, shopName, waLink, waMessage, type ShopCategory, type ShopDelivery, type ShopOrder, type ShopProduct, type TradeIn } from '../data/shop'
import { Button, IconBtn, Badge, Empty, Field, Stepper, Segmented, Toggle, cx, toast, haptic } from '../ui/kit'
import { placeLine, money, dShort, hm, normalizeQuery, plural } from '../lib/format'
import { isNative, postNative } from '../lib/native'
import { trMessage } from '../i18n'
import { PIXEL_D, LOGO_W, LOGO_H } from '../ui/logoPaths'

const LIVE = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const remote = () => import('../data/shopRemote')

/** «SHOP PIXEL»: «PIXEL» из логотипа, «SHOP» той же высотой, что «RENTAL» (временно, до файла логотипа магазина) */
export function ShopLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} className={className} role="img" aria-label="Shop Pixel">
      <text x="700" y="166" textAnchor="end" letterSpacing="14" fill="var(--color-logo, var(--color-accent))" fontSize="140" fontWeight="800" fontFamily="Segoe UI, Roboto, system-ui, sans-serif">SHOP</text>
      <path fill="var(--color-logo, var(--color-accent))" d={PIXEL_D} />
    </svg>
  )
}

function Photo({ p, className, big }: { p: ShopProduct; className?: string; big?: boolean }) {
  const src = shopImage(p.images[0])
  return (
    <div className={cx('relative bg-white grid place-items-center overflow-hidden', className)}>
      {src ? <img src={src} alt={shopName(p)} loading={big ? 'eager' : 'lazy'} decoding="async" className="size-full object-contain p-[6%]" /> : <ShoppingBag className="size-8 text-black/30" />}
      {p.oldPrice && p.oldPrice > p.price && <span className="absolute top-2 left-2 h-6 px-2 rounded-full bg-accent text-accent-ink text-xs font-semibold grid place-items-center">−{Math.round((1 - p.price / p.oldPrice) * 100)}%</span>}
    </div>
  )
}

function stockText(p: ShopProduct) { return p.stock <= 0 ? 'Нет в наличии' : `В наличии · ${p.stock} шт` }

function ShopCard({ p }: { p: ShopProduct }) {
  const go = useNav(s => s.go)
  const add = useShop(s => s.addToCart)
  const inCart = useShop(s => s.cart.find(c => c.productId === p.id)?.qty ?? 0)
  const can = p.stock > inCart
  return (
    <div className="card-lift group flex flex-col bg-surface rounded-2xl overflow-hidden min-w-0">
      <button onClick={() => go('shopProduct', { id: p.id })} className="text-left" aria-label={shopName(p)}><Photo p={p} className="aspect-square" /></button>
      <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="text-xs text-muted uppercase tracking-wide">{p.brand}</div>
        <button onClick={() => go('shopProduct', { id: p.id })} className="text-left font-medium leading-snug line-clamp-2">{p.title}</button>
        <div className="flex flex-wrap gap-1">{p.specs.slice(0, 3).map(s => <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">{s}</span>)}</div>
        <div className="mt-auto pt-1 flex items-end justify-between gap-2">
          <div className="min-w-0"><div className="tnum font-semibold">{money(p.price)}</div>{p.oldPrice && p.oldPrice > p.price && <div className="tnum text-xs text-faint line-through">{money(p.oldPrice)}</div>}
            <div className={cx('text-xs', p.stock > 0 ? 'text-ok' : 'text-faint')}>{stockText(p)}</div></div>
          <button aria-label="В корзину" disabled={!can} onClick={() => { add(p.id); haptic(); toast(`${shopName(p)}: в корзине`, { action: { label: 'Корзина', fn: () => go('shopCart') } }) }}
            className="press size-10 shrink-0 grid place-items-center rounded-xl bg-accent text-accent-ink disabled:bg-surface-3 disabled:text-faint">{inCart ? <span className="tnum text-sm font-semibold">{inCart}</span> : <ShoppingBag className="size-[18px]" />}</button>
        </div>
      </div>
    </div>
  )
}

type Sort = 'default' | 'cheap' | 'expensive' | 'new'
export function ShopScreen() {
  const back = useNav(s => s.back), go = useNav(s => s.go)
  const products = useShop(s => s.products)
  const cartN = useShop(s => s.cart.reduce((a, c) => a + c.qty, 0))
  const [cat, setCat] = useState<ShopCategory | 'all'>('all')
  const [brands, setBrands] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('default')
  const [inStock, setInStock] = useState(false)
  const [q, setQ] = useState('')
  const base = useMemo(() => products.filter(p => p.active && (cat === 'all' || p.category === cat) && (!q.trim() || normalizeQuery(`${p.brand} ${p.title} ${p.specs.join(' ')}`).replace(/[\s-]/g, '').includes(normalizeQuery(q).replace(/[\s-]/g, '')))), [products, cat, q])
  const allBrands = useMemo(() => { const m = new Map<string, number>(); for (const p of base) m.set(p.brand, (m.get(p.brand) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }, [base])
  const list = useMemo(() => {
    const l = base.filter(p => (!brands.length || brands.includes(p.brand)) && (!inStock || p.stock > 0))
    return [...l].sort((a, b) => sort === 'cheap' ? a.price - b.price : sort === 'expensive' ? b.price - a.price : sort === 'new' ? b.createdAt - a.createdAt : (Number(b.stock > 0) - Number(a.stock > 0)) || a.sort - b.sort)
  }, [base, brands, inStock, sort])
  useEffect(() => { setBrands([]) }, [cat])
  const chip = (on: boolean) => cx('press shrink-0 h-9 px-3.5 rounded-full text-sm whitespace-nowrap flex items-center gap-1.5 transition-colors duration-200', on ? 'bg-fg text-bg font-medium' : 'bg-surface text-fg/85 hover:text-fg')
  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-3">
        <IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn>
        <ShopLogo className="h-[22px] desk:h-7 w-auto" />
        <button onClick={() => go('shopCart')} className="ml-auto relative h-10 px-3.5 rounded-xl bg-surface-2 flex items-center gap-2 text-sm font-medium"><ShoppingBag className="size-4" />Корзина{cartN > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-ink text-xs font-semibold grid place-items-center tnum">{cartN}</span>}</button>
      </div>
      <section className="rounded-3xl bg-surface p-4 sm:p-6 flex flex-col gap-3">
        <h1 className="text-[clamp(22px,5vw,30px)] leading-tight font-semibold">Фото- и видеотехника в наличии</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          {[[CreditCard, 'Рассрочка'], [Repeat, 'Трейд-ин'], [Truck, 'Доставка по Казахстану']].map(([I, t]: any) => <span key={t} className="h-8 px-3 rounded-full bg-surface-2 flex items-center gap-1.5"><I className="size-4 text-accent" />{t}</span>)}
        </div>
      </section>
      <div className="relative"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="shop-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Сони, 24-70, GM…" className="field pl-10 h-12" />{q && <button aria-label="Очистить" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md hover:bg-surface-3"><X className="size-4" /></button>}</div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {(['all', 'cameras', 'lenses'] as const).map(c => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>{c === 'all' ? 'Все' : SHOP_CAT_LABEL[c]}</button>)}
      </div>
      {allBrands.length >= 2 && (
        <div role="group" aria-label="Бренды" className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 desk:flex-wrap">
          <button aria-pressed={!brands.length} onClick={() => setBrands([])} className={chip(!brands.length)}>Все бренды</button>
          {allBrands.map(([b, n]) => <button key={b} aria-pressed={brands.includes(b)} onClick={() => setBrands(brands.includes(b) ? brands.filter(x => x !== b) : [...brands, b])} className={chip(brands.includes(b))}>{b}<span className="text-xs opacity-50 tnum">{n}</span></button>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setInStock(v => !v)} className={cx('press h-9 px-3.5 rounded-full text-sm flex items-center gap-1.5', inStock ? 'bg-ok/15 text-ok font-medium' : 'bg-surface-2 text-fg/85')}><span className={cx('size-1.5 rounded-full', inStock ? 'bg-ok' : 'bg-faint')} />В наличии</button>
        <select aria-label="Сортировка" value={sort} onChange={e => setSort(e.target.value as Sort)} className="field h-9 py-0 w-auto text-sm"><option value="default">Популярные</option><option value="cheap">Дешевле</option><option value="expensive">Дороже</option><option value="new">Новинки</option></select>
        <span className="ml-auto text-sm text-faint tnum">{list.length} {plural(list.length, 'позиция', 'позиции', 'позиций')}</span>
      </div>
      {list.length ? <div className="stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 wide:grid-cols-6 gap-3">{list.map(p => <ShopCard key={p.id} p={p} />)}</div>
        : <Empty icon={<PackageSearch className="size-7" />} title="Ничего не нашли" text="Снимите фильтры или напишите нам в WhatsApp." action={<Button variant="soft" onClick={() => { setQ(''); setBrands([]); setInStock(false); setCat('all') }}>Сбросить</Button>} />}
    </div>
  )
}

export function ShopProductScreen() {
  const route = useRoute()
  const back = useNav(s => s.back), go = useNav(s => s.go)
  const p = useShop(s => s.products.find(x => x.id === route.params?.id))
  const inCart = useShop(s => s.cart.find(c => c.productId === route.params?.id)?.qty ?? 0)
  const add = useShop(s => s.addToCart), setQty = useShop(s => s.setQty)
  const [want, setWant] = useState(1)
  const [img, setImg] = useState(0)
  if (!p) return <Empty icon={<PackageSearch className="size-7" />} title="Товар не найден" action={<Button variant="soft" onClick={back}>Назад</Button>} />
  const images = p.images.length ? p.images : ['']
  const doAdd = () => { add(p.id, want); haptic(); toast('Добавлено в корзину', { action: { label: 'Корзина', fn: () => go('shopCart') } }) }
  return (
    <div className="pb-32 desk:pb-10">
      <div className="flex items-center gap-3 py-1 mb-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><ShopLogo className="h-5 w-auto" /></div>
      <div className="grid desk:grid-cols-[minmax(0,1fr)_minmax(0,440px)] gap-6 desk:gap-12 items-start">
        <div className="flex flex-col gap-3">
          <div className="rounded-3xl overflow-hidden"><Photo p={{ ...p, images: [images[img]] }} className="aspect-square desk:aspect-[4/3]" big /></div>
          {images.length > 1 && <div className="flex gap-2">{images.map((src, i) => <button key={i} onClick={() => setImg(i)} className={cx('size-16 rounded-xl overflow-hidden bg-white', i === img && 'ring-2 ring-accent')}><img src={shopImage(src)} alt="" className="size-full object-contain p-1" /></button>)}</div>}
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          <div>
            <div className="text-sm text-muted">{p.brand} · {SHOP_CAT_LABEL[p.category]}{p.condition === 'used' ? ' · б/у' : ''}</div>
            <h1 className="text-2xl font-semibold leading-tight mt-1">{shopName(p)}</h1>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap"><span className="text-2xl font-semibold tnum">{money(p.price)}</span>{p.oldPrice && p.oldPrice > p.price && <span className="text-faint line-through tnum">{money(p.oldPrice)}</span>}</div>
            <div className={cx('mt-2 text-sm flex items-center gap-1.5', p.stock > 0 ? 'text-ok' : 'text-faint')}><span className={cx('size-2 rounded-full', p.stock > 0 ? 'bg-ok' : 'bg-faint')} />{stockText(p)}</div>
          </div>
          <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
            {inCart > 0 ? <div className="flex gap-2"><Stepper value={inCart} max={p.stock} onChange={v => setQty(p.id, v)} /><Button block size="lg" className="hidden desk:flex" onClick={() => go('shopCart')}>В корзине · перейти</Button></div>
              : <>{p.stock > 1 && <div className="flex items-center justify-between"><span className="text-sm text-muted">Количество</span><Stepper size="sm" value={want} min={1} max={p.stock} onChange={setWant} /></div>}
                <Button block size="lg" className="hidden desk:flex" disabled={p.stock <= 0} onClick={doAdd}><ShoppingBag className="size-5" />{p.stock > 0 ? 'В корзину' : 'Нет в наличии'}</Button></>}
            <div className="grid grid-cols-3 gap-2 text-xs text-muted text-center">
              {[[CreditCard, 'Рассрочка'], [Repeat, 'Трейд-ин'], [Truck, 'Доставка']].map(([I, t]: any) => <div key={t} className="rounded-xl bg-surface-2 py-2.5 flex flex-col items-center gap-1"><I className="size-4 text-accent" />{t}</div>)}
            </div>
          </div>
          {p.description && <p className="text-muted leading-relaxed">{p.description}</p>}
          {p.specs.length > 0 && <div><div className="font-semibold mb-2">Характеристики</div><dl className="rounded-2xl bg-surface overflow-hidden text-sm">{p.specs.map((s, i) => { const k = s.indexOf(':'); return <div key={s} className={cx('px-4 py-2.5 flex gap-4', i % 2 && 'bg-surface-2/60')}>{k > 0 ? <><dt className="text-muted w-2/5 shrink-0">{s.slice(0, k)}</dt><dd>{s.slice(k + 1).trim()}</dd></> : <dd>{s}</dd>}</div> })}</dl></div>}
          {p.includes.length > 0 && <div className="rounded-2xl bg-surface p-4"><div className="font-semibold mb-2">Комплектация</div><ul className="flex flex-col gap-1.5 text-sm">{p.includes.map(i => <li key={i} className="flex gap-2.5"><span className="size-1.5 rounded-full bg-accent mt-[7px] shrink-0" />{i}</li>)}</ul></div>}
        </div>
      </div>
      {/* телефон: цена и кнопка внизу */}
      <div className="desk:hidden fixed left-0 right-0 z-40 gutter pb-2" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3 bg-surface-3 rounded-2xl p-2 pl-4 shadow-xl shadow-black/50">
          <div className="flex-1 min-w-0"><div className="tnum font-semibold">{money(p.price)}</div><div className="text-xs text-muted truncate">{stockText(p)}</div></div>
          {inCart ? <Button className="h-11" onClick={() => go('shopCart')}>Корзина · {inCart}</Button> : <Button className="h-11 px-5" disabled={p.stock <= 0} onClick={doAdd}>В корзину</Button>}
        </div>
      </div>
    </div>
  )
}

/** Корзина магазина и оформление на одном экране: промокод, получение, оплата, трейд-ин, контакты */
export function ShopCartPanel({ embedded }: { embedded?: boolean }) {
  const go = useNav(s => s.go), replace = useNav(s => s.replace)
  const me = useMe()
  const { products, cart, settings, promos, setQty } = useShop()
  const point = useStore(s => s.settings.points.almaty)
  const lines = cart.map(c => ({ c, p: products.find(p => p.id === c.productId) })).filter(x => x.p) as { c: { productId: string; qty: number }; p: ShopProduct }[]
  const subtotal = lines.reduce((a, { c, p }) => a + p.price * c.qty, 0)
  const [promoIn, setPromoIn] = useState('')
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null)
  const [promoErr, setPromoErr] = useState('')
  const [delivery, setDelivery] = useState<ShopDelivery>('pickup')
  const [address, setAddress] = useState('')
  const [payment, setPayment] = useState(settings.payments[0] ?? '')
  const [ti, setTi] = useState(false)
  const [trade, setTrade] = useState<TradeIn>({ model: '', condition: 'good' })
  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '+7 ')
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (me) { setName(n => n || me.name); setPhone(p => (p.replace(/\D/g, '').length > 1 ? p : me.phone)) } }, [me?.id])
  useEffect(() => { setPromo(null) }, [subtotal])
  const fee = delivery === 'pickup' ? 0 : delivery === 'city' ? settings.deliveryCityFee : settings.deliveryKzFee
  const discount = promo?.discount ?? 0
  const total = subtotal - discount + (fee ?? 0)

  const applyPromo = async () => {
    setPromoErr('')
    if (!promoIn.trim()) return
    if (LIVE) { const r = await (await remote()).checkShopPromo(promoIn.trim(), subtotal); if (r.ok) setPromo(r.data); else { setPromo(null); setPromoErr(r.error) } }
    else { const r = promoDiscount(promos.find(x => x.code.toUpperCase() === promoIn.trim().toUpperCase()), subtotal); if (r.ok) setPromo({ code: r.code, discount: r.discount }); else { setPromo(null); setPromoErr(r.error) } }
  }
  const submit = async () => {
    setErr('')
    if (name.trim().length < 2) return setErr('Укажите имя')
    if (phone.replace(/\D/g, '').length < 11) return setErr('Укажите телефон')
    if (delivery !== 'pickup' && address.trim().length < 5) return setErr('Укажите адрес доставки')
    if (ti && trade.model.trim().length < 2) return setErr('Укажите, какую технику сдаёте в трейд-ин')
    const f: ShopCheckout = { name, phone, delivery, address: delivery === 'pickup' ? undefined : address, payment, promo: promo?.code, comment, tradein: ti ? { ...trade, model: trade.model.trim() } : undefined }
    setBusy(true)
    try {
      let order: ShopOrder
      if (LIVE) { const r = await (await remote()).createShopOrder(f); if (!r.ok) return setErr(r.error); order = r.data }
      else { const r = useShop.getState().placeOrderLocal(f); if (!r.ok) return setErr(r.error); order = r.order }
      haptic(30)
      const text = trMessage(waMessage(order, { address: placeLine(point) }))
      openWhatsApp(waLink(settings.waPhone, text))
      ;(embedded ? go : replace)('shopDone', { id: order.id })
    } finally { setBusy(false) }
  }

  if (!lines.length) return (
    <Empty icon={<ShoppingBag className="size-7" />} title="Корзина магазина пуста" text="Камеры и объективы в наличии, с рассрочкой и трейд-ином." action={<Button onClick={() => go('shop')}>В магазин</Button>} />
  )
  const radio = (on: boolean) => cx('press flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm border transition-colors', on ? 'border-accent bg-accent/[0.07]' : 'border-line hover:border-line-2')
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">
        <div className="rounded-2xl bg-surface divide-y divide-line">
          {lines.map(({ c, p }) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <button onClick={() => go('shopProduct', { id: p.id })}><Photo p={p} className="size-16 rounded-xl shrink-0" /></button>
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{shopName(p)}</div><div className="text-sm text-muted tnum">{money(p.price)}</div></div>
              <Stepper size="sm" value={c.qty} min={0} max={p.stock} onChange={v => setQty(p.id, v)} />
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-3">
          <div className="label">Получение</div>
          {(['pickup', 'city', 'kz'] as const).map(d => (
            <button key={d} onClick={() => setDelivery(d)} className={radio(delivery === d)}>
              {d === 'pickup' ? <Store className="size-5 text-accent shrink-0" /> : <Truck className="size-5 text-accent shrink-0" />}
              <span className="flex-1 min-w-0"><span className="block font-medium">{DELIVERY_LABEL[d]}</span><span className="block text-xs text-muted">{d === 'pickup' ? `${placeLine(point)} · ${settings.hours}` : d === 'city' ? money(settings.deliveryCityFee) : settings.deliveryKzFee == null ? 'Стоимость уточнит менеджер' : money(settings.deliveryKzFee)}</span></span>
              {delivery === d && <Check className="size-4 text-accent" />}
            </button>
          ))}
          {delivery !== 'pickup' && <Field label="Адрес доставки"><input id="sh-addr" className="field" value={address} onChange={e => setAddress(e.target.value)} placeholder={delivery === 'city' ? 'Улица, дом, квартира' : 'Город, улица, дом'} /></Field>}
        </section>

        <section className="flex flex-col gap-3">
          <div className="label">Оплата</div>
          <div className="grid sm:grid-cols-2 gap-2">{settings.payments.map(m => <button key={m} onClick={() => setPayment(m)} className={radio(payment === m)}><Wallet className="size-4 text-accent shrink-0" /><span className="flex-1">{m}</span>{payment === m && <Check className="size-4 text-accent" />}</button>)}</div>
        </section>

        <section className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3"><span><span className="block font-medium">Хочу сдать технику в трейд-ин</span><span className="block text-xs text-muted">Оценку делает менеджер, итоговая цена уточняется</span></span><Toggle checked={ti} onChange={setTi} /></label>
          {ti && (
            <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3 fade-in">
              <Field label="Что сдаёте"><input id="ti-model" className="field" value={trade.model} onChange={e => setTrade({ ...trade, model: e.target.value })} placeholder="Например, Sony A7 III" /></Field>
              <div><div className="text-xs text-muted mb-1.5">Состояние</div><Segmented layoutId="ti-cond" value={trade.condition} onChange={v => setTrade({ ...trade, condition: v })} options={(Object.keys(TRADEIN_COND) as TradeIn['condition'][]).map(k => ({ value: k, label: TRADEIN_COND[k] }))} /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Комплект"><input id="ti-set" className="field" value={trade.complete ?? ''} onChange={e => setTrade({ ...trade, complete: e.target.value })} placeholder="Коробка, АКБ, зарядка" /></Field>
                <Field label="Пробег затвора"><input id="ti-shutter" className="field" inputMode="numeric" value={trade.shutter ?? ''} onChange={e => setTrade({ ...trade, shutter: e.target.value })} placeholder="Для камер, если знаете" /></Field>
              </div>
              <Field label="Комментарий"><textarea id="ti-comment" rows={2} className="field resize-none" value={trade.comment ?? ''} onChange={e => setTrade({ ...trade, comment: e.target.value })} /></Field>
              <div className="text-xs text-muted">Фото техники отправьте в чате WhatsApp после заказа.</div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="label">Контакты</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Имя"><input id="sh-name" className="field" autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Телефон"><input id="sh-phone" className="field tnum" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          </div>
          <Field label="Комментарий к заказу"><textarea id="sh-comment" rows={2} className="field resize-none" value={comment} onChange={e => setComment(e.target.value)} /></Field>
        </section>
      </div>

      <aside className="lg:sticky lg:top-[76px] rounded-2xl bg-surface p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1"><Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="sh-promo" className="field h-11 pl-9 uppercase" placeholder="Промокод" value={promoIn} onChange={e => { setPromoIn(e.target.value); setPromoErr('') }} onKeyDown={e => e.key === 'Enter' && applyPromo()} /></div>
          <Button variant="soft" className="h-11" onClick={applyPromo}>Применить</Button>
        </div>
        {promoErr && <div className="text-sm text-bad -mt-1">{promoErr}</div>}
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted">Товары</span><span className="tnum">{money(subtotal)}</span></div>
          {promo && <div className="flex justify-between text-ok"><span>Промокод {promo.code}</span><span className="tnum">−{money(promo.discount)}</span></div>}
          {delivery !== 'pickup' && <div className="flex justify-between"><span className="text-muted">Доставка</span><span className="tnum">{fee == null ? 'уточнит менеджер' : money(fee)}</span></div>}
        </div>
        <div className="flex justify-between items-baseline pt-3 border-t border-line"><span className="font-semibold">Итого</span><span className="tnum text-xl font-semibold">{money(total)}</span></div>
        {err && <div className="text-sm text-bad">{err}</div>}
        <Button size="lg" block disabled={busy} onClick={submit}><MessageCircle className="size-5" />{busy ? 'Оформляем…' : 'Заказать'}</Button>
        <div className="text-xs text-muted">Откроется WhatsApp с готовым сообщением о заказе. Менеджер подтвердит наличие и оплату.</div>
      </aside>
    </div>
  )
}

/** WhatsApp: в приложении (Expo) открываем внешним приложением, на сайте — новой вкладкой */
function openWhatsApp(url: string) {
  if (isNative()) { postNative({ type: 'open-url', url }); return }
  const w = window.open(url, '_blank', 'noopener')
  if (!w) location.href = url
}

export function ShopCartScreen() {
  const back = useNav(s => s.back)
  return (
    <div className="flex flex-col gap-5 pb-40 lg:pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Корзина магазина</h1></div>
      <ShopCartPanel />
    </div>
  )
}

export function ShopDone() {
  const route = useRoute()
  const tab = useNav(s => s.tab), go = useNav(s => s.go)
  const o = useShop(s => s.orders.find(x => x.id === route.params?.id))
  const wa = useShop(s => s.settings.waPhone)
  const point = useStore(s => s.settings.points.almaty)
  if (!o) return null
  const text = trMessage(waMessage(o, { address: placeLine(point) }))
  const link = waLink(wa, text)
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Сообщение скопировано') } catch { toast('Не удалось скопировать') } }
  return (
    <div className="max-w-md mx-auto text-center flex flex-col items-center gap-5 pt-8 pb-10">
      <div className="size-20 grid place-items-center rounded-3xl bg-accent text-accent-ink fade-in"><Check className="size-10" strokeWidth={3} /></div>
      <div><h1 className="font-display text-2xl font-semibold">Заказ {o.code} создан</h1><p className="text-muted mt-1">Если WhatsApp не открылся, нажмите кнопку ещё раз или скопируйте текст.</p></div>
      <div className="w-full grid gap-2">
        <Button size="lg" block onClick={() => openWhatsApp(link)}><MessageCircle className="size-5" />Открыть WhatsApp</Button>
        <Button size="lg" block variant="soft" onClick={copy}><Copy className="size-5" />Скопировать сообщение</Button>
      </div>
      <pre className="w-full text-left text-xs text-muted whitespace-pre-wrap rounded-2xl bg-surface p-4 max-h-64 overflow-y-auto font-sans">{text}</pre>
      <div className="flex gap-4 text-sm"><button className="text-accent font-medium" onClick={() => go('shopOrders')}>Мои покупки</button><button className="text-muted" onClick={() => tab('home')}>На главную</button></div>
    </div>
  )
}

export function ShopOrders() {
  const back = useNav(s => s.back), go = useNav(s => s.go)
  const me = useMe()
  const orders = useShop(s => s.orders)
  const mine = orders.filter(o => !me || !o.customerId || o.customerId === me.id)
  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Мои покупки</h1></div>
      {mine.length ? <div className="grid gap-3 lg:grid-cols-2">{mine.map(o => (
        <div key={o.id} className="rounded-2xl bg-surface p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2"><span className="font-semibold tnum">{o.code}</span><Badge tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Badge><span className="ml-auto text-xs text-muted">{dShort(o.createdAt)}, {hm(o.createdAt)}</span></div>
          <div className="text-sm text-muted truncate">{o.items.map(i => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ')}</div>
          <div className="flex justify-between text-sm"><span className="text-muted">{DELIVERY_LABEL[o.delivery]} · {o.payment}</span><span className="tnum font-semibold">{money(o.total)}</span></div>
        </div>
      ))}</div> : <Empty icon={<ShoppingBag className="size-7" />} title="Покупок пока нет" action={<Button onClick={() => go('shop')}>В магазин</Button>} />}
    </div>
  )
}
