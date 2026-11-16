import { useMemo } from 'react'
import { ArrowRight, MapPin, Clock, Sparkles } from 'lucide-react'
import { SCENES, resolveKit } from '../data/scenes'
import { SCENE_ICON } from './Extras'
import { useMe } from '../store/store'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/store'
import { useNav } from '../store/nav'
import { CATEGORIES } from '../data/categories'
import { PRESETS, resolvePreset } from '../data/presets'
import { cx, Button, haptic, toast, CatIcon } from '../ui/kit'
import { ProductCard, DateBar, SectionTitle } from './common'
import { Banners } from './Banners'
import { InstallBanner } from './Install'
import { money } from '../lib/format'
import { availMap } from '../lib/availability'
import { byPopularity } from '../lib/popular'


/** Приветствие по времени суток */
function hello(name?: string) {
  const h = new Date().getHours()
  const g = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
  return name ? `${g}, ${name.split(' ')[0]}` : g
}

export function Home() {
  const { products, bookings, settings, city, units, range, addToCart } = useStore(useShallow(s => ({ products: s.products, bookings: s.bookings, settings: s.settings, city: s.city, units: s.units, range: s.range, addToCart: s.addToCart })))
  const go = useNav(s => s.go), tab = useNav(s => s.tab)
  const me = useMe()
  const viewed = useStore(s => s.viewed)
  const seen = useMemo(() => (viewed ?? []).map(id => products.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && !p.hidden), [viewed, products])
  const fresh = useMemo(() => products.filter(p => p.isNew && !p.hidden), [products])
  const popular = useMemo(() => {
    const cnt = new Map<string, number>()
    for (const b of bookings) for (const i of b.items) cnt.set(i.productId, (cnt.get(i.productId) ?? 0) + 1)
    return products.filter(p => !p.hidden && ['cameras', 'light', 'sound', 'gimbals', 'lenses'].includes(p.category)).sort(byPopularity(cnt)).slice(0, 8)
  }, [products, bookings])
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const p of products) if (!p.hidden) m.set(p.category, (m.get(p.category) ?? 0) + 1); return m }, [products])
  const point = settings.points[city]
  const h = new Date().getHours()
  const openNow = point.close === 24 || (h >= point.open && h < point.close)

  const addPreset = (id: string) => {
    const pr = PRESETS.find(p => p.id === id)!
    const items = resolvePreset(pr, products)
    let added = 0
    for (const { product, qty } of items) {
      const f = availMap(units, bookings, city, range.start, range.end).get(product.id)?.free ?? 0
      const q = Math.min(qty, f)
      if (q > 0) { addToCart(product.id, q); added++ }
    }
    haptic(15)
    toast(added === items.length ? `Сетап «${pr.title}» в корзине` : `Добавили ${added} из ${items.length}: остальное занято на эти даты`, { action: { label: 'Открыть', fn: () => tab('cart') } })
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      <Banners />
      <InstallBanner />
      {/* Hero: только текст и даты — без фото, фото живут в подборках */}
      <section className="rounded-3xl bg-surface px-4 py-5 sm:px-6 md:px-8 md:py-8 flex flex-col gap-4">
        <div>
          <div className="label mb-1.5">{hello(me?.name)}</div>
          <h1 className="text-[clamp(22px,6vw,28px)] leading-tight font-semibold">Техника под любую съёмку<span className="text-muted"> — заберите сегодня, 24/7</span></h1>
          <p className="text-muted mt-1.5">{products.filter(p => !p.hidden).length} позиций. Выберите даты — покажем, что свободно.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 max-w-2xl">
          <DateBar className="flex-1 min-w-0 bg-surface-2" />
          <Button size="lg" onClick={() => go('kit')} className="sm:w-auto"><Sparkles className="size-[18px]" /> Подобрать комплект</Button>
        </div>
      </section>

      {/* Категории: спокойные чипы вместо фото-плиток */}
      <section>
        <SectionTitle action={<button onClick={() => tab('catalog')} className="text-sm text-muted hover:text-fg font-medium flex items-center gap-1 transition-colors">Весь каталог <ArrowRight className="size-4" /></button>}>Категории</SectionTitle>
        <div className="flex gap-2 overflow-x-auto scrollbar-none snap-x scroll-px-4 -mx-4 px-4 desk:mx-0 desk:px-0 desk:flex-wrap desk:overflow-visible">
          {CATEGORIES.filter(c => counts.get(c.id)).map(c => (
            <button key={c.id} onClick={() => tab('catalog', { cat: c.id })}
              className="press snap-start shrink-0 h-11 pl-3 pr-3.5 rounded-xl bg-surface hover:bg-surface-2 flex items-center gap-2 text-sm font-medium whitespace-nowrap">
              <CatIcon id={c.id} className="size-[18px] text-muted" />{c.short}<span className="text-xs text-faint tnum">{counts.get(c.id)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Что снимаем? — креатор выбирает задачу, а не технику */}
      <section>
        <SectionTitle>Что снимаем?</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SCENES.map(sc => {
            const Icon = SCENE_ICON[sc.id] ?? Sparkles
            const from = Math.min(...(['budget', 'optimal', 'pro'] as const).map(t => resolveKit(sc.kits[t], products).reduce((s, i) => s + i.product.price * i.qty, 0)).filter(Boolean))
            return (
              <button key={sc.id} onClick={() => { haptic(5); go('scene', { id: sc.id }) }} className="press flex flex-col gap-3 rounded-2xl bg-surface hover:bg-surface-2 p-3.5 text-left min-w-0">
                <span className="size-10 grid place-items-center rounded-xl bg-accent/12 text-accent"><Icon className="size-5" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{sc.title}</span>
                  <span className="block text-xs text-muted truncate">от {money(from)}/сут</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Вы смотрели */}
      {seen.length > 0 && (
        <section>
          <SectionTitle>Вы смотрели</SectionTitle>
          <div className="wide-row flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 snap-x pb-1">
            {seen.map(p => <div key={p.id} className="snap-start shrink-0 w-[168px] desk:w-[210px] flex"><ProductCard p={p} /></div>)}
          </div>
        </section>
      )}

      {/* Новинки */}
      <section>
        <SectionTitle action={<button onClick={() => tab('catalog', { sort: 'new' })} className="text-sm text-muted hover:text-fg font-medium flex items-center gap-1 transition-colors">Все <ArrowRight className="size-4" /></button>}>Новинки</SectionTitle>
        <div className="wide-row flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 snap-x pb-1">
          {fresh.map(p => <div key={p.id} className="snap-start shrink-0 w-[168px] desk:w-[210px] flex"><ProductCard p={p} /></div>)}
        </div>
      </section>

      {/* Скидки */}
      <section className="rounded-2xl bg-surface p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="font-display font-semibold">Чем дольше, тем дешевле</div><div className="text-sm text-muted mt-0.5">Скидка применяется сама, когда выбираете даты</div>
        </div>
        <div className="flex gap-2">
          {settings.tiers.map(t => (
            <div key={t.days} className="flex-1 md:w-24 rounded-xl bg-surface-2 px-3 py-2.5 text-center">
              <div className="font-semibold text-lg tnum">−{t.percent}%</div>
              <div className="text-xs text-muted">от {t.days} сут</div>
            </div>
          ))}
        </div>
      </section>

      {/* Популярное */}
      <section>
        <SectionTitle>Чаще всего берут</SectionTitle>
        <div className="wide-row flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 snap-x pb-1">
          {popular.map(p => <div key={p.id} className="snap-start shrink-0 w-[168px] desk:w-[210px] flex"><ProductCard p={p} /></div>)}
        </div>
      </section>

      {/* Точка */}
      <section className="rounded-2xl bg-surface p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1">
          <div className="label mb-1.5">Точка выдачи · {city === 'almaty' ? 'Алматы' : 'Астана'}</div>
          <div className="font-display font-semibold text-lg flex items-center gap-2"><MapPin className="size-[18px] text-muted" /> {point.address}</div>
          <div className="text-sm text-muted mt-1 flex items-center gap-2"><Clock className="size-4" /> {point.hours}
            <span className={cx('ml-1 inline-flex items-center gap-1.5 text-xs font-semibold', openNow ? 'text-ok' : 'text-bad')}><span className={cx('size-1.5 rounded-full', openNow ? 'bg-ok' : 'bg-bad')} />{openNow ? 'Открыто' : 'Закрыто'}</span>
          </div>
        </div>
        <Button variant="outline" onClick={() => go('contacts')}>Как добраться</Button>
      </section>
    </div>
  )
}
