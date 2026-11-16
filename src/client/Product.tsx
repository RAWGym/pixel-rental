import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Heart, Share2, Bell, ShieldCheck, Info, MapPin, X, Package, Columns3 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, useProduct, useMe } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { catName } from '../data/categories'
import { photoFor } from '../data/photos'
import type { CategoryId, Product } from '../data/types'
import { ProductArt, Button, IconBtn, Stepper, cx, haptic, toast, Sheet, Field } from '../ui/kit'
import { useAvail, useAvailMap, useCartQty, ProductCard, DateBar, SectionTitle } from './common'
import { related } from '../lib/related'
import { calcPrice, rentalDays, DAY, nextTier } from '../lib/pricing'
import { placeLine, money, dShort, daysWord, MONTHS_NOM } from '../lib/format'
import { dayStrip } from '../lib/availability'
import { api } from '../data/api'

/** Стандартный состав по категории — пока у товара не заполнено поле includes в админке */
const DEFAULT_INCLUDES: Partial<Record<CategoryId, string[]>> = {
  cameras: ['Камера', 'Аккумулятор', 'Зарядное устройство', 'Крышка байонета'],
  lenses: ['Объектив', 'Передняя и задняя крышки', 'Бленда'],
  light: ['Осветитель', 'Кабель питания', 'Рефлектор'],
  sound: ['Передатчик и приёмник', 'Кабели подключения', 'Кейс'],
  gimbals: ['Стабилизатор', 'Площадка быстрого съёма', 'Кабель зарядки'],
  drones: ['Дрон', 'Пульт', 'Аккумуляторы', 'Запасные пропеллеры'],
  monitors: ['Монитор', 'Крепление', 'Кабель'],
  kits: ['Всё из описания комплекта'],
}
const includesOf = (p: Product) => (p.includes?.length ? { list: p.includes, std: false } : { list: DEFAULT_INCLUDES[p.category] ?? [p.name], std: true })

/* ---------- Галерея: свайп, точки, тап → полноэкранный просмотр ---------- */
function Gallery({ p }: { p: Product }) {
  const photo = photoFor(p)
  const extra = p.gallery ?? []
  const count = 1 + extra.length
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [full, setFull] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || count < 2) return
    let raf = 0
    const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))) }
    el.addEventListener('scroll', f, { passive: true })
    return () => { el.removeEventListener('scroll', f); cancelAnimationFrame(raf) }
  }, [count])
  const fullSrc = (i: number) => (i === 0 ? photo?.full : extra[i - 1])
  return (
    <div className="flex flex-col gap-2.5">
      <div ref={ref} className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-3xl overscroll-x-contain">
        <button className="snap-center shrink-0 w-full" onClick={() => photo && setFull(0)} aria-label="Открыть фото">
          <ProductArt p={p} size="lg" className="aspect-square w-full" />
        </button>
        {extra.map((src, i) => (
          <button key={src} className="snap-center shrink-0 w-full aspect-square photo-stage" onClick={() => setFull(i + 1)} aria-label="Открыть фото">
            <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-contain p-6" />
          </button>
        ))}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-1.5">{Array.from({ length: count }, (_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-[width,background-color] duration-200', i === idx ? 'w-4 bg-accent' : 'w-1.5 bg-line-2')} />)}</div>
      )}
      {full !== null && fullSrc(full) && (
        <div className="fixed inset-0 z-[95] bg-black grid place-items-center fade-in" onClick={() => setFull(null)}>
          <img src={fullSrc(full)} alt={p.name} className="max-w-full max-h-full object-contain p-4" />
          <IconBtn label="Закрыть" className="absolute right-4 bg-white/10" style={{ top: "calc(16px + env(safe-area-inset-top, 0px))" }} onClick={() => setFull(null)}><X className="size-5" /></IconBtn>
        </div>
      )}
    </div>
  )
}

/* ---------- Календарь доступности на 30 дней ---------- */
const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
function AvailabilityCalendar({ p }: { p: Product }) {
  const { units, bookings, city, range } = useStore(useShallow(s => ({ units: s.units, bookings: s.bookings, city: s.city, range: s.range })))
  const days = useMemo(() => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); return dayStrip(units, bookings, p.id, city, d0.getTime(), 30) }, [units, bookings, p.id, city])
  if (!days.length || !days[0].total) return null
  const lead = (new Date(days[0].t).getDay() + 6) % 7 // пустые клетки до понедельника
  const inRange = (t: number) => t + DAY > range.start && t < range.end
  const m0 = new Date(days[0].t).getMonth(), m1 = new Date(days[days.length - 1].t).getMonth()
  return (
    <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Доступность</div>
        <div className="text-sm text-muted">{MONTHS_NOM[m0]}{m1 !== m0 ? ` - ${MONTHS_NOM[m1]}` : ''}</div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WD_SHORT.map(w => <div key={w} className="text-xs text-faint pb-1">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <span key={'e' + i} />)}
        {days.map(d => (
          <div key={d.t} title={`${dShort(d.t)}: свободно ${d.free} из ${d.total}`}
            className={cx('aspect-square rounded-lg grid place-items-center text-sm tnum', d.free === 0 ? 'bg-bad/15 text-bad' : d.free < d.total ? 'bg-warn/12 text-fg' : 'bg-ok/10 text-fg',
              inRange(d.t) && 'ring-2 ring-accent ring-inset')}>
            {new Date(d.t).getDate()}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ok/40" />Свободно</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warn/50" />Частично</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-bad/50" />Занято</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm ring-2 ring-accent ring-inset" />Ваши даты</span>
      </div>
    </div>
  )
}

/** Нижнюю часть экрана монтируем после выезда — первый кадр приходит сразу */
function useLater(ms = 260) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), ms); return () => clearTimeout(t) }, [])
  return ready
}

export function ProductScreen() {
  const route = useRoute()
  const p = useProduct(route.params?.id)
  const back = useNav(s => s.back), tab = useNav(s => s.tab), go = useNav(s => s.go)
  const toggleCompare = useStore(s => s.toggleCompare)
  const inCompare = useStore(s => (s.compare ?? []).includes(route.params?.id))
  const { products, settings, range, city, favorites, toggleFav, addToCart, setQty, setCity } = useStore(useShallow(s => ({ products: s.products, settings: s.settings, range: s.range, city: s.city, favorites: s.favorites, toggleFav: s.toggleFav, addToCart: s.addToCart, setQty: s.setQty, setCity: s.setCity })))
  const me = useMe()
  const qty = useCartQty(p?.id ?? '')
  const a = useAvail(p?.id ?? '')
  const [want, setWant] = useState(1) // сколько штук считать в калькуляторе, пока товара нет в ките
  const [wait, setWait] = useState(false)
  const [wName, setWName] = useState(me?.name ?? '')
  const [wPhone, setWPhone] = useState(me?.phone ?? '')
  const later = useLater()
  const cart = useStore(s => s.cart)
  const cartIds = useMemo(() => new Set(cart.map(c => c.productId)), [cart])
  const availMap = useAvailMap()
  const pushViewed = useStore(s => s.pushViewed)
  useEffect(() => { if (p) pushViewed(p.id) }, [p?.id])
  const rel = useMemo(() => (p && later ? related(p, products) : []), [p, products, later])
  // комплект «в один тап»: первые свободные из «Берут вместе», которых ещё нет в корзине
  const bundle = rel.filter(r => !cartIds.has(r.id) && (availMap.get(r.id)?.free ?? 0) > 0).slice(0, 3)
  if (!p) return <div className="py-20 text-center text-muted">Товар не найден</div>

  const n = qty || want
  const days = rentalDays(range.start, range.end)
  const pr = calcPrice([{ price: p.price, qty: n }], days, settings)
  const nt = nextTier(days, settings)
  const fav = favorites.includes(p.id)
  // даты выбираются в корзине: добавить можно всегда, если техника есть в городе
  const canAdd = a.total > qty
  const busyOnDates = a.total > 0 && a.free <= qty
  const example = (d: number) => calcPrice([{ price: p.price, qty: n }], d, settings)
  const inc = includesOf(p)
  const add = () => { addToCart(p.id, Math.max(1, Math.min(want, a.total - qty))); haptic(); toast('Добавлено в корзину', { action: { label: 'Корзина', fn: () => tab('cart') } }) }

  const share = async () => {
    const text = `${p.name} · ${money(p.price)}/сутки в Pixel Rental`
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Скопировано') } } catch { /* отменили */ }
  }
  const availText = a.total === 0 ? 'Нет в этом городе' : a.free > 0 ? `В наличии ${a.total} шт` : a.next ? `На ваши даты занято, свободно с ${dShort(a.next)}` : 'На ваши даты занято'
  const availTone = a.total === 0 ? 'bg-faint' : a.free === 0 ? 'bg-bad' : a.free === 1 ? 'bg-warn' : 'bg-ok'

  const action = qty > 0
    ? <div className="flex gap-2 w-full"><Stepper value={qty} max={a.total} onChange={v => setQty(p.id, v)} /><Button block size="lg" onClick={() => tab('cart')}>В корзине · перейти</Button></div>
    : canAdd ? <Button block size="lg" onClick={add}>В корзину</Button>
      : <Button block size="lg" variant="soft" onClick={() => setWait(true)}><Bell className="size-5" /> Сообщить, когда освободится</Button>

  return (
    <div className="pb-36 desk:pb-10">
      <div className="flex items-center justify-between py-1 mb-3">
        <IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn>
        <div className="flex gap-2">
          <IconBtn label={inCompare ? 'Убрать из сравнения' : 'Сравнить'} className={cx(inCompare && 'bg-accent/15 text-accent')}
            onClick={() => { const ok = toggleCompare(p.id); haptic(); if (!ok) toast('В сравнении уже 3 товара', { action: { label: 'Открыть', fn: () => go('compare') } }); else if (!inCompare) toast('Добавлено к сравнению', { action: { label: 'Сравнить', fn: () => go('compare') } }) }}><Columns3 className="size-4" /></IconBtn>
          <IconBtn label="Поделиться" onClick={share}><Share2 className="size-4" /></IconBtn>
          <IconBtn label="В избранное" onClick={() => { toggleFav(p.id); haptic() }}><Heart className={cx('size-4', fav && 'fill-accent text-accent')} /></IconBtn>
        </div>
      </div>

      <div className="grid desk:grid-cols-[minmax(0,1fr)_minmax(0,440px)] wide:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6 desk:gap-12 items-start">
        <div className="desk:sticky desk:top-[76px] flex flex-col gap-6">
          <Gallery p={p} />
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          {/* заголовок */}
          <div>
            <div className="text-sm text-muted">{p.brand} · {p.kind}</div>
            <h1 className="text-2xl font-semibold leading-tight mt-1">{p.name}</h1>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap"><span className="text-2xl font-semibold tnum">{money(p.price)}</span><span className="text-muted">за сутки</span></div>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted"><span className={cx('size-2 rounded-full', availTone)} />{availText} · {city === 'almaty' ? 'Алматы' : 'Астана'}</div>
            {a.total === 0 && a.otherFree > 0 && (
              <button onClick={() => setCity(city === 'almaty' ? 'astana' : 'almaty')} className="mt-1 text-sm text-accent font-medium">Есть в {city === 'almaty' ? 'Астане' : 'Алматы'}: переключить город</button>
            )}
          </div>

          {/* ступени скидок */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <div className={cx('shrink-0 rounded-xl px-3 py-2 text-center', !pr.percent ? 'bg-surface-3' : 'bg-surface')}><div className="text-sm font-semibold tnum">{money(p.price)}</div><div className="text-xs text-muted">1 сутки</div></div>
            {[...settings.tiers].sort((x, y) => x.days - y.days).map(t => (
              <div key={t.days} className={cx('shrink-0 rounded-xl px-3 py-2 text-center', pr.percent === t.percent ? 'bg-surface-3' : 'bg-surface')}>
                <div className="text-sm font-semibold tnum">{money(Math.round(p.price * (1 - t.percent / 100)))}</div>
                <div className="text-xs text-muted">от {t.days} сут · −{t.percent}%</div>
              </div>
            ))}
          </div>

          {/* цена: справка; даты, итог и проверка занятости в корзине */}
          <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
            {!qty && a.total > 1 && <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Количество</span><Stepper size="sm" value={want} min={1} max={a.total} onChange={setWant} /></div>}
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              {[1, 3, 7].map(d => { const x = example(d); return (
                <div key={d} className="contents"><dt className="text-muted">{daysWord(d)}{n > 1 ? ` · ${n} шт` : ''}{x.percent ? <span className="text-ok"> · −{x.percent}%</span> : null}</dt><dd className="tnum text-right font-medium">{money(x.total)}</dd></div>
              ) })}
            </dl>
            {busyOnDates && <div className="text-sm text-warn">На {dShort(range.start)}-{dShort(range.end)} всё занято. В корзине можно выбрать другие даты.</div>}
            <button onClick={() => tab('cart')} className="self-start text-sm text-accent font-medium">Даты и итог в корзине</button>
            <div className="hidden desk:block pt-1">{action}</div>
          </div>

          {later ? <AvailabilityCalendar p={p} /> : <div className="rounded-2xl bg-surface h-[360px]" />}

          {later && <>
          {/* комплект */}
          <div className="rounded-2xl bg-surface p-4">
            <div className="font-semibold mb-2 flex items-center gap-2"><Package className="size-4 text-muted" />Что в комплекте</div>
            <ul className="flex flex-col gap-1.5 text-sm">{inc.list.map(i => <li key={i} className="flex gap-2.5"><span className="size-1.5 rounded-full bg-accent mt-[7px] shrink-0" />{i}</li>)}</ul>
            {inc.std && <div className="text-xs text-faint mt-2">Стандартный состав для категории «{catName(p.category)}». Точный комплект подтвердит менеджер.</div>}
          </div>

          {/* характеристики */}
          {p.specs.length > 0 && (
            <div>
              <div className="font-semibold mb-2">Характеристики</div>
              <dl className="rounded-2xl bg-surface overflow-hidden text-sm">
                {p.specs.map((s, i) => {
                  const k = s.indexOf(':')
                  return (
                    <div key={s} className={cx('px-4 py-2.5 flex gap-4', i % 2 && 'bg-surface-2/60')}>
                      {k > 0 ? <><dt className="text-muted w-2/5 shrink-0">{s.slice(0, k)}</dt><dd className="min-w-0">{s.slice(k + 1).trim()}</dd></> : <dd className="min-w-0">{s}</dd>}
                    </div>
                  )
                })}
              </dl>
            </div>
          )}
          {p.description && <p className="text-muted leading-relaxed">{p.description}</p>}
          <div className="text-xs text-faint flex gap-1.5"><Info className="size-3.5 shrink-0 mt-0.5" />Технику проверяем перед каждой выдачей. Аккумуляторы заряжены, карты отформатированы.</div>
          <div className="text-xs text-faint flex gap-1.5"><MapPin className="size-3.5 shrink-0 mt-0.5" />{placeLine(settings.points[city])} · {settings.points[city].hours}</div>
          </>}
        </div>
      </div>

      {rel.length > 0 && (
        <section className="mt-10">
          <SectionTitle action={bundle.length > 1 ? (
            <button onClick={() => { bundle.forEach(r => addToCart(r.id)); haptic(20); toast(`${bundle.length} позиции в корзине`, { action: { label: 'Корзина', fn: () => tab('cart') } }) }}
              className="press h-9 px-3 rounded-xl bg-surface-2 text-sm font-medium flex items-center gap-1.5 whitespace-nowrap">Добавить {bundle.length} · {money(bundle.reduce((s, r) => s + r.price, 0))}/сут</button>
          ) : undefined}>Берут вместе</SectionTitle>
          <div className="flex gap-3 overflow-x-auto scrollbar-none snap-x -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 pb-1">
            {rel.map(r => <div key={r.id} className="snap-start shrink-0 w-[168px] desk:w-[210px] flex"><ProductCard p={r} /></div>)}
          </div>
        </section>
      )}

      {/* нижняя панель: цена и кнопка всегда под пальцем */}
      <div className="desk:hidden fixed left-0 right-0 z-40 gutter pb-2" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3 bg-surface-3 rounded-2xl p-2 pl-4 shadow-xl shadow-black/50">
          <div className="flex-1 min-w-0">
            <div className="tnum font-semibold whitespace-nowrap">{money(p.price)}</div>
            <div className="text-xs text-muted truncate">за сутки</div>
          </div>
          {qty > 0 ? <><Stepper value={qty} max={a.total} onChange={v => setQty(p.id, v)} /><Button className="h-11" onClick={() => tab('cart')}>Корзина</Button></>
            : canAdd ? <Button className="h-11 px-5" onClick={add}>В корзину</Button>
              : <Button variant="soft" className="h-11" onClick={() => setWait(true)}><Bell className="size-4" /> Жду</Button>}
        </div>
      </div>

      <Sheet open={wait} onClose={() => setWait(false)} title="Сообщим, когда освободится"
        footer={<Button block size="lg" disabled={!wName || wPhone.replace(/\D/g, '').length < 10} onClick={async () => {
          await api.createLead({ type: 'waitlist', name: wName, phone: wPhone, text: `Ждёт ${p.name} на ${dShort(range.start)}-${dShort(range.end)}`, productId: p.id, city, dates: range })
          setWait(false); toast('Готово. Напишем, как только техника вернётся')
        }}>Подписаться</Button>}>
        <p className="text-muted text-sm mb-4">{p.name} занят на ваши даты. Менеджер напишет в WhatsApp, когда он освободится, или предложит замену.</p>
        <div className="flex flex-col gap-3">
          <Field label="Имя"><input id="wait-name" className="field" value={wName} onChange={e => setWName(e.target.value)} placeholder="Как к вам обращаться" /></Field>
          <Field label="Телефон"><input id="wait-phone" className="field tnum" inputMode="tel" value={wPhone} onChange={e => setWPhone(e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
        </div>
      </Sheet>
    </div>
  )
}
