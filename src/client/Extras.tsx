import { useMemo, useRef, useState, useEffect } from 'react'
import { ChevronLeft, Share2, Check, X, ArrowRight, Columns3, Sparkles, CalendarRange, Store, Mic, Smartphone, Radio, Clapperboard, Aperture, Plane, Heart, Megaphone } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { SCENES, TIERS, resolveKit, type Tier } from '../data/scenes'
import { ProductArt, Button, IconBtn, Segmented, Empty, cx, haptic, toast } from '../ui/kit'
import { DateBar, useAvailMap } from './common'
import { calcPrice, rentalDays } from '../lib/pricing'
import { money, daysWord, dShort } from '../lib/format'
import type { Product } from '../data/types'

export const SCENE_ICON: Record<string, any> = { interview: Mic, vlog: Smartphone, podcast: Radio, clip: Clapperboard, product: Aperture, aerial: Plane, wedding: Heart, ads: Megaphone }

/* ---------- Поделиться комплектом ссылкой ---------- */
/** #kit=id*qty,id*qty — ссылка открывает тот же комплект на сайте и в приложении */
export function kitLink(lines: { productId: string; qty: number }[]) {
  const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://app.pixelrental.kz/'
  return `${base}#kit=${lines.map(l => `${encodeURIComponent(l.productId)}*${l.qty}`).join(',')}`
}
export async function shareKit(lines: { productId: string; qty: number }[], title = 'Комплект Pixel Rental') {
  const url = kitLink(lines)
  try {
    if (navigator.share) await navigator.share({ title, text: title, url })
    else { await navigator.clipboard.writeText(url); toast('Ссылка на комплект скопирована') }
  } catch { /* отменили */ }
}
/** при запуске: если открыли ссылку на комплект — кладём его в корзину */
export function importKitFromHash() {
  const m = location.hash.match(/^#kit=(.+)$/)
  if (!m) return false
  const s = useStore.getState()
  let n = 0
  for (const part of m[1].split(',')) {
    const [id, q] = part.split('*'); const pid = decodeURIComponent(id)
    if (s.products.some(p => p.id === pid)) { s.addToCart(pid, Math.max(1, Math.min(9, Number(q) || 1))); n++ }
  }
  history.replaceState(null, '', location.pathname + location.search)
  if (n) { setTimeout(() => { useNav.getState().tab('cart'); toast(`Комплект по ссылке: ${n} позиций в корзине`) }, 300) }
  return n > 0
}

/* ---------- «Что снимаем?» — экран сценария ---------- */
export function SceneScreen() {
  const route = useRoute()
  const back = useNav(s => s.back), tab = useNav(s => s.tab), go = useNav(s => s.go)
  const scene = SCENES.find(s => s.id === route.params?.id) ?? SCENES[0]
  const [tier, setTier] = useState<Tier>(route.params?.tier ?? 'optimal')
  const { products, range, settings, cart, addToCart } = useStore(useShallow(s => ({ products: s.products, range: s.range, settings: s.settings, cart: s.cart, addToCart: s.addToCart })))
  const avail = useAvailMap()
  const kits = useMemo(() => Object.fromEntries(TIERS.map(t => [t.id, resolveKit(scene.kits[t.id], products)])) as Record<Tier, { product: Product; qty: number }[]>, [scene, products])
  const items = kits[tier]
  const [off, setOff] = useState<string[]>([])
  useEffect(() => setOff([]), [tier, scene.id])
  const days = rentalDays(range.start, range.end)
  const rows = items.map(i => { const free = avail.get(i.product.id)?.free ?? 0; return { ...i, free, take: Math.min(i.qty, free) } })
  const chosen = rows.filter(r => !off.includes(r.product.id) && r.take > 0)
  const busy = rows.filter(r => r.take < r.qty)
  const pr = calcPrice(chosen.map(r => ({ price: r.product.price, qty: r.take })), days, settings)
  const perDay = (t: Tier) => kits[t].reduce((s, i) => s + i.product.price * i.qty, 0)
  const Icon = SCENE_ICON[scene.id] ?? Sparkles
  const inCart = new Set(cart.map(c => c.productId))

  const takeAll = () => {
    chosen.forEach(r => addToCart(r.product.id, r.take))
    haptic(30)
    toast(busy.length ? `В корзине ${chosen.length} из ${rows.length}: остальное занято на эти даты` : `Комплект «${scene.title}» в корзине`, { action: { label: 'Корзина', fn: () => tab('cart') } })
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5 pb-40 desk:pb-10">
      <div className="flex items-center gap-3">
        <IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn>
        <div className="flex-1" />
        <IconBtn label="Поделиться комплектом" onClick={() => shareKit(chosen.map(r => ({ productId: r.product.id, qty: r.take })), `Комплект «${scene.title}» · Pixel Rental`)}><Share2 className="size-4" /></IconBtn>
      </div>
      <div className="flex items-start gap-4">
        <span className="size-12 shrink-0 grid place-items-center rounded-2xl bg-accent/12 text-accent"><Icon className="size-6" /></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">{scene.title}</h1>
          <p className="text-muted mt-1">{scene.subtitle}</p>
          <p className="text-xs text-faint mt-1">{scene.tags}</p>
        </div>
      </div>

      {/* уровни комплекта */}
      <div className="grid grid-cols-3 gap-2">
        {TIERS.map(t => (
          <button key={t.id} onClick={() => { setTier(t.id); haptic(5) }}
            className={cx('press rounded-2xl p-3 text-left transition-colors duration-200 min-w-0', tier === t.id ? 'bg-surface-3 ring-1 ring-accent/60' : 'bg-surface')}>
            <div className="text-sm font-semibold truncate">{t.label}</div>
            <div className="text-xs text-muted tnum truncate">{money(perDay(t.id))}/сут</div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted -mt-2">{TIERS.find(t => t.id === tier)!.hint}</p>

      <DateBar />

      {/* состав */}
      <div className="rounded-2xl bg-surface overflow-hidden divide-y divide-line/60">
        {rows.map(r => {
          const isOff = off.includes(r.product.id) || r.take === 0
          return (
            <div key={r.product.id} className={cx('flex items-center gap-3 p-3 transition-opacity duration-200', isOff && 'opacity-50')}>
              <button onClick={() => go('product', { id: r.product.id })} className="shrink-0"><ProductArt p={r.product} size="sm" className="size-14 rounded-xl" /></button>
              <button onClick={() => go('product', { id: r.product.id })} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium line-clamp-2">{r.product.name}</div>
                <div className="text-xs text-muted tnum">
                  {r.qty > 1 ? `${r.qty} × ` : ''}{money(r.product.price)}/сут
                  {r.take < r.qty && <span className="text-bad"> · {r.take === 0 ? 'занято на даты' : `свободно ${r.take}`}</span>}
                  {inCart.has(r.product.id) && <span className="text-ok"> · уже в корзине</span>}
                </div>
              </button>
              {r.take > 0 && (
                <button aria-label={isOff ? 'Вернуть в комплект' : 'Убрать из комплекта'} onClick={() => { setOff(o => o.includes(r.product.id) ? o.filter(x => x !== r.product.id) : [...o, r.product.id]); haptic(5) }}
                  className={cx('press size-9 shrink-0 grid place-items-center rounded-xl', isOff ? 'bg-surface-2 text-muted' : 'bg-accent/15 text-accent')}>
                  {isOff ? <X className="size-4" /> : <Check className="size-4" strokeWidth={2.5} />}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* итог */}
      <div className="rounded-2xl bg-surface p-4 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-3"><span className="text-muted">{chosen.length} поз. × {daysWord(days)}</span><span className="tnum">{money(pr.subtotal)}</span></div>
        {pr.discount > 0 && <div className="flex justify-between gap-3 text-ok"><span>Скидка за срок {pr.percent}%</span><span className="tnum">−{money(pr.discount)}</span></div>}
        <div className="flex justify-between gap-3 text-base font-semibold pt-2 mt-1 border-t border-line"><span>Итого</span><span className="tnum">{money(pr.total)}</span></div>
        {busy.length > 0 && <div className="text-xs text-muted pt-1">Часть техники занята с {dShort(range.start)}. Поменяйте даты или возьмите без неё.</div>}
      </div>
      <div className="hidden desk:block"><Button block size="lg" disabled={!chosen.length} onClick={takeAll}>Всё в корзину · {money(pr.total)}</Button></div>

      <div className="desk:hidden fixed left-0 right-0 z-40 gutter pb-2" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
        <Button block size="lg" className="shadow-xl shadow-black/50" disabled={!chosen.length} onClick={takeAll}>Всё в корзину · {money(pr.total)}</Button>
      </div>
    </div>
  )
}

/* ---------- Сравнение ---------- */
export function CompareScreen() {
  const back = useNav(s => s.back), go = useNav(s => s.go), tab = useNav(s => s.tab)
  const { products, compare, toggleCompare, clearCompare, addToCart, range } = useStore(useShallow(s => ({ products: s.products, compare: s.compare ?? [], toggleCompare: s.toggleCompare, clearCompare: s.clearCompare, addToCart: s.addToCart, range: s.range })))
  const avail = useAvailMap()
  const list = compare.map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p)
  const min = Math.min(...list.map(p => p.price))
  const days = rentalDays(range.start, range.end)
  const maxSpecs = Math.max(0, ...list.map(p => p.specs.length))

  if (list.length === 0) return (
    <div className="max-w-md mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="text-xl font-semibold">Сравнение</h1></div>
      <Empty icon={<Columns3 className="size-7" />} title="Пока нечего сравнивать" text="На странице товара нажмите «Сравнить». Можно положить рядом до трёх позиций." action={<Button onClick={() => tab('catalog')}>В каталог</Button>} />
    </div>
  )

  const Row = ({ label, render }: { label: string; render: (p: Product) => React.ReactNode }) => (
    <>
      <div className="col-span-full text-xs text-muted pt-3">{label}</div>
      {list.map(p => <div key={p.id} className="text-sm min-w-0">{render(p)}</div>)}
    </>
  )

  return (
    <div className="flex flex-col gap-4 pb-10 max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn>
        <h1 className="text-xl font-semibold flex-1">Сравнение</h1>
        <button className="text-sm text-muted" onClick={() => { clearCompare(); back() }}>Очистить</button>
      </div>
      <div className="overflow-x-auto scrollbar-none -mx-4 px-4 desk:mx-0 desk:px-0">
        <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(140px, 1fr))`, minWidth: list.length * 150 }}>
          {list.map(p => (
            <div key={p.id} className="relative flex flex-col gap-2 min-w-0">
              <button onClick={() => go('product', { id: p.id })}><ProductArt p={p} className="aspect-square w-full rounded-2xl" /></button>
              <button aria-label="Убрать из сравнения" onClick={() => toggleCompare(p.id)} className="press absolute top-2 right-2 size-8 grid place-items-center rounded-full bg-bg/80"><X className="size-4" /></button>
              <div className="text-sm font-medium line-clamp-2 h-9 leading-[18px]">{p.name}</div>
            </div>
          ))}
          <Row label="Цена за сутки" render={p => <span className="font-semibold tnum">{money(p.price)}</span>} />
          <Row label="Разница" render={p => p.price === min ? <span className="text-ok">самый доступный</span> : <span className="tnum text-muted">+{money(p.price - min)}/сут</span>} />
          <Row label={`За ваши даты (${daysWord(days)})`} render={p => <span className="tnum">{money(p.price * days)}</span>} />
          <Row label="Наличие на даты" render={p => { const a = avail.get(p.id); return <span className="flex items-center gap-1.5"><span className={cx('size-2 rounded-full', !a?.total ? 'bg-faint' : a.free ? 'bg-ok' : 'bg-bad')} />{!a?.total ? 'нет в городе' : a.free ? `свободно ${a.free}` : 'занято'}</span> }} />
          <Row label="Залог для новых" render={p => <span className="tnum">{p.deposit ? money(p.deposit) : '—'}</span>} />
          <Row label="Тип · бренд" render={p => `${p.kind} · ${p.brand}`} />
          {Array.from({ length: maxSpecs }, (_, i) => <Row key={i} label={i === 0 ? 'Характеристики' : ''} render={p => p.specs[i] ?? <span className="text-faint">—</span>} />)}
          <div className="col-span-full h-3" />
          {list.map(p => <Button key={p.id} size="sm" variant="soft" disabled={!(avail.get(p.id)?.free)} onClick={() => { addToCart(p.id); haptic(); toast(`${p.name} — в корзине`) }}>В корзину</Button>)}
        </div>
      </div>
    </div>
  )
}

/** Плашка «Сравнение · N» над таббаром */
export function CompareBar() {
  const n = useStore(s => (s.compare ?? []).length)
  const top = useNav(s => s.stack[s.stack.length - 1].name)
  const root = useNav(s => s.stack[0].name)
  const go = useNav(s => s.go)
  // только там, где выбирают технику: главная, каталог, избранное
  if (n < 2 || !['home', 'catalog', 'favorites'].includes(top) || (top === 'home' && root !== 'home')) return null
  return (
    <button onClick={() => go('compare')} className="press fade-in fixed z-[45] left-1/2 -translate-x-1/2 h-10 pl-3.5 pr-3 rounded-full bg-fg text-bg text-sm font-semibold flex items-center gap-2 shadow-xl shadow-black/40"
      style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}>
      <Columns3 className="size-4" />Сравнение · {n}<ArrowRight className="size-4" />
    </button>
  )
}

/* ---------- Онбординг: 3 экрана при первом запуске ---------- */
const SLIDES = [
  { icon: Clapperboard, title: 'Техника под любую съёмку', text: 'Камеры, оптика, свет, звук и дроны. Выберите задачу — соберём комплект на бюджет, оптимум или про.' },
  { icon: CalendarRange, title: 'Сразу видно, что свободно', text: 'Укажите даты — каталог покажет свободную технику и посчитает цену со скидкой за срок.' },
  { icon: Store, title: 'Забирайте 24/7', text: 'Алматы, Толе би 176 — круглосуточно. Астана, Бокейхана 6. Или привезём на площадку.' },
]
const OB_KEY = 'px-onboarded'
export function Onboarding() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(OB_KEY) && window.innerWidth < 1024 } catch { return false } })
  const [i, setI] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const f = () => setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', f, { passive: true }); return () => el.removeEventListener('scroll', f)
  }, [show])
  if (!show) return null
  const done = () => { try { localStorage.setItem(OB_KEY, '1') } catch { /* noop */ } setLeaving(true); setTimeout(() => setShow(false), 200) }
  const next = () => { haptic(5); if (i >= SLIDES.length - 1) return done(); ref.current?.scrollTo({ left: (i + 1) * ref.current.clientWidth, behavior: 'smooth' }) }
  return (
    <div className={cx('fixed inset-0 z-[100] bg-bg flex flex-col transition-opacity duration-200', leaving ? 'opacity-0' : 'fade-in')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex justify-end gutter pt-3"><button onClick={done} className="h-10 px-3 text-sm text-muted">Пропустить</button></div>
      <div ref={ref} className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-none">
        {SLIDES.map(s => (
          <div key={s.title} className="snap-center shrink-0 w-full gutter flex flex-col justify-center gap-5 max-w-md mx-auto">
            <span className="size-20 grid place-items-center rounded-3xl bg-accent/12 text-accent"><s.icon className="size-10" strokeWidth={1.6} /></span>
            <h2 className="text-2xl font-semibold leading-tight">{s.title}</h2>
            <p className="text-muted text-lg leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="gutter pb-6 flex flex-col gap-5 max-w-md w-full mx-auto">
        <div className="flex justify-center gap-1.5">{SLIDES.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-[width,background-color] duration-200', k === i ? 'w-5 bg-accent' : 'w-1.5 bg-line-2')} />)}</div>
        <Button block size="lg" onClick={next}>{i >= SLIDES.length - 1 ? 'Начать' : 'Далее'}</Button>
      </div>
    </div>
  )
}

/* ---------- Сегмент уровней — для главной ---------- */
export function TierSwitch({ value, onChange }: { value: Tier; onChange: (t: Tier) => void }) {
  return <Segmented value={value} onChange={onChange} options={TIERS.map(t => ({ value: t.id, label: t.label }))} />
}
