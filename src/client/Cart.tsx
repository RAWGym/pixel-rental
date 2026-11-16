import { useShop } from '../store/shop'
import { ShopCartPanel } from './Shop'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, ShoppingBag, Tag, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react'
import { Share2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, useMe } from '../store/store'
import { useNav } from '../store/nav'
import { ProductArt, Button, Stepper, Empty, AnimatedNumber, Segmented, cx, toast, haptic } from '../ui/kit'
import { DateBar, SectionTitle, ProductCard } from './common'
import { calcPrice, rentalDays, nextTier, DAY } from '../lib/pricing'
import { shareKit } from './Extras'
import { freeUnits } from '../lib/availability'
import { money, num, daysWord, plural } from '../lib/format'
import { related } from '../lib/related'

export function useCartTotals() {
  const { cart, products, settings, range, promo } = useStore(useShallow(s => ({ cart: s.cart, products: s.products, settings: s.settings, range: s.range, promo: s.promo })))
  const me = useMe()
  return useMemo(() => {
    const days = rentalDays(range.start, range.end)
    const lines = cart.map(c => ({ ...c, product: products.find(p => p.id === c.productId)! })).filter(l => l.product)
    const pr = calcPrice(lines.map(l => ({ price: l.product.price, qty: l.qty })), days, settings, promo)
    const count = lines.reduce((s, l) => s + l.qty, 0)
    return { days, lines, ...pr, count }
  }, [cart, products, settings, range, promo, me])
}

/** Корзина: аренда и магазин раздельно (свои итоги и оформление); переключатель, когда есть покупки */
export function CartScreen() {
  const shopN = useShop(s => s.cart.reduce((a, c) => a + c.qty, 0))
  const rentN = useStore(s => s.cart.reduce((a, c) => a + c.qty, 0))
  const [mode, setMode] = useState<'rent' | 'shop'>(() => (rentN === 0 && shopN > 0 ? 'shop' : 'rent'))
  if (!shopN) return <RentalCart />
  return (
    <div className="flex flex-col gap-4">
      <Segmented layoutId="cart-mode" value={mode} onChange={setMode} options={[{ value: 'rent', label: `Аренда${rentN ? ` · ${rentN}` : ''}` }, { value: 'shop', label: `Магазин · ${shopN}` }]} />
      {mode === 'rent' ? <RentalCart /> : <div className="pb-40 lg:pb-10"><ShopCartPanel embedded /></div>}
    </div>
  )
}

function RentalCart() {
  const setRange = useStore(s => s.setRange)
  const { setQty, units, bookings, city, range, settings, promo, setPromo, products, clearCart, addToCart } = useStore(useShallow(s => ({ setQty: s.setQty, units: s.units, bookings: s.bookings, city: s.city, range: s.range, settings: s.settings, promo: s.promo, setPromo: s.setPromo, products: s.products, clearCart: s.clearCart, addToCart: s.addToCart })))
  const go = useNav(s => s.go), tab = useNav(s => s.tab)
  const t = useCartTotals()
  const [code, setCode] = useState(promo)
  const conflicts = t.lines.filter(l => freeUnits(units, bookings, l.productId, city, range.start, range.end).length < l.qty)
  const nt = nextTier(t.days, settings)
  const upsell = useMemo(() => {
    const ids = new Set(t.lines.map(l => l.productId))
    const out = new Map<string, any>()
    for (const l of t.lines) for (const r of related(l.product, products)) if (!ids.has(r.id) && ['batteries', 'memory', 'filters', 'stands', 'grip', 'softboxes', 'cables'].includes(r.category)) out.set(r.id, r)
    return [...out.values()].slice(0, 6)
  }, [t.lines, products])

  if (!t.lines.length) return (
    <Empty icon={<ShoppingBag className="size-7" />} title="Корзина пока пустая" text="Добавляйте технику из каталога или возьмите готовый сетап под задачу."
      action={<div className="flex gap-2"><Button onClick={() => tab('catalog')}>В каталог</Button><Button variant="soft" onClick={() => go('kit')}>Собрать комплект</Button></div>} />
  )

  const applyPromo = () => {
    const p = settings.promos.find(x => x.active && x.code.toUpperCase() === code.trim().toUpperCase())
    if (p) { setPromo(p.code); haptic(); toast(`Промокод ${p.code}: −${p.percent}%`) } else toast('Такого промокода нет', { tone: 'bad' })
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 pb-40 lg:pb-10">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold flex-1">Корзина</h1>
          <button className="press h-9 px-3 mr-1 rounded-xl bg-surface-2 text-sm flex items-center gap-1.5" onClick={() => shareKit(t.lines.map(l => ({ productId: l.productId, qty: l.qty })))}><Share2 className="size-4" />Поделиться</button>
          <button className="text-sm text-muted hover:text-bad" onClick={() => { const snap = useStore.getState().cart; clearCart(); toast('Корзина очищена', { action: { label: 'Вернуть', fn: () => snap.forEach(c => addToCart(c.productId, c.qty)) } }) }}>Очистить</button>
        </div>
        <DateBar />
        {conflicts.length > 0 && (
          <div className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm flex gap-2"><AlertTriangle className="size-4 text-bad shrink-0 mt-0.5" />
            <span>На эти даты не всё свободно: {conflicts.map(c => c.product.name).join(', ')}. Уменьшите количество или поменяйте даты.</span></div>
        )}
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {t.lines.map(l => {
              const free = freeUnits(units, bookings, l.productId, city, range.start, range.end).length
              const bad = free < l.qty
              return (
                <motion.li key={l.productId} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, marginTop: -8 }} transition={{ duration: 0.25 }}
                  className="overflow-hidden">
                  <div className={cx('flex gap-3 p-3 rounded-2xl bg-surface border', bad ? 'border-bad/50' : 'border-line')}>
                    <button onClick={() => go('product', { id: l.productId })} className="shrink-0"><ProductArt p={l.product} size="sm" className="size-[72px] rounded-xl" /></button>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <button onClick={() => go('product', { id: l.productId })} className="text-left font-semibold leading-snug line-clamp-2">{l.product.name}</button>
                      <div className="text-xs text-muted tnum">{num(l.product.price)} ₸/сут{bad ? <span className="text-bad font-sans"> · свободно {free}</span> : ''}</div>
                      <div className="flex items-center justify-between mt-auto gap-2">
                        <Stepper size="sm" value={l.qty} max={Math.max(free, l.qty)} onChange={n => setQty(l.productId, n)} />
                        <div className="flex items-center gap-1">
                          <span className="tnum font-semibold text-sm">{money(l.product.price * l.qty * t.days)}</span>
                          <button aria-label="Убрать" onClick={() => { setQty(l.productId, 0); toast('Убрали из корзины', { action: { label: 'Вернуть', fn: () => addToCart(l.productId, l.qty) } }) }} className="size-8 grid place-items-center rounded-lg text-muted hover:text-bad hover:bg-surface-2"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>

        {upsell.length > 0 && (
          <section className="mt-4">
            <SectionTitle>Не забудьте</SectionTitle>
            <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-1">
              {upsell.map((p, i) => <div key={p.id} className="shrink-0 w-[160px] flex"><ProductCard p={p} index={i} /></div>)}
            </div>
          </section>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 self-start w-full flex flex-col gap-3">
        <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1"><Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
              <input id="promo" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Промокод" className="field pl-9 h-11 tnum" /></div>
            <Button variant="soft" onClick={applyPromo} disabled={!code}>Применить</Button>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">{t.count} {plural(t.count, 'позиция', 'позиции', 'позиций')} × {daysWord(t.days)}</span><span className="tnum">{money(t.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">В сутки</span><span className="tnum">{money(t.perDay)}</span></div>
            {t.discount > 0 && <div className="flex justify-between text-ok"><span>Скидка {t.percent}%{t.promo && t.promo.percent >= (t.tier?.percent ?? 0) ? ` · ${t.promo.code}` : ' за срок'}</span><span className="tnum">−{money(t.discount)}</span></div>}
            {nt && (
              <button onClick={() => { setRange({ start: range.start, end: range.end + (nt.days - t.days) * DAY }); haptic(15); toast(`Продлили до ${daysWord(nt.days)}: скидка −${nt.percent}%`) }}
                className="press mt-1 flex items-center justify-between gap-3 rounded-xl bg-accent/[0.08] px-3 py-2.5 text-left">
                <span className="text-sm">Ещё {plural(nt.days - t.days, '1 сутки', `${nt.days - t.days} суток`, `${nt.days - t.days} суток`)}, скидка <b className="text-accent">−{nt.percent}%</b></span>
                <span className="text-xs font-semibold text-accent shrink-0">Продлить</span>
              </button>
            )}
          </div>
          <div className="flex justify-between items-baseline pt-3 border-t border-line">
            <span className="font-semibold">К оплате</span>
            <span className="tnum text-xl font-semibold"><AnimatedNumber value={t.total} format={n => money(n)} /></span>
          </div>
          <Button size="lg" block className="hidden lg:flex" disabled={conflicts.length > 0} onClick={() => go('checkout')}>Оформить бронь <ChevronRight className="size-5" /></Button>
        </div>
      </aside>

      <div className="lg:hidden fixed left-0 right-0 z-40 gutter pb-3" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <Button size="lg" block disabled={conflicts.length > 0} onClick={() => go('checkout')} className="shadow-2xl shadow-black/60">
          Оформить · <span className="tnum"><AnimatedNumber value={t.total} format={n => money(n)} /></span>
        </Button>
      </div>
    </div>
  )
}
