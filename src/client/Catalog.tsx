import { useMemo, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal, X, PackageSearch } from 'lucide-react'
import { useStore } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { CATEGORIES, catName } from '../data/categories'
import type { CategoryId } from '../data/types'
import { haptic, cx, Sheet, Button, Toggle, Empty, Segmented } from '../ui/kit'
import { ProductCard } from './common'
import { availMap } from '../lib/availability'
import { byPopularity } from '../lib/popular'
import { normalizeQuery, plural } from '../lib/format'

const CHUNK = 24
const POPULAR_Q = ['FX3', 'Петлички', 'Ronin', 'Aputure', 'Дрон', 'Sony 35mm', 'V-mount']
type Sort = 'popular' | 'new' | 'cheap' | 'expensive'
const SORTS: { value: Sort; label: string }[] = [{ value: 'popular', label: 'Популярные' }, { value: 'new', label: 'Новые' }, { value: 'cheap', label: 'Дешевле' }, { value: 'expensive', label: 'Дороже' }]
const PRICE: { label: string; min: number; max: number }[] = [{ label: 'До 3 000', min: 0, max: 3000 }, { label: '3–10 тыс', min: 3000, max: 10000 }, { label: '10+ тыс', min: 10000, max: 1e9 }]

export function matchProduct(p: { name: string; brand: string; kind: string }, q: string) {
  const n = normalizeQuery(q)
  if (!n) return true
  const hay = normalizeQuery(`${p.brand} ${p.name} ${p.kind}`).replace(/[-\s]/g, '')
  return n.split(/\s+/).filter(Boolean).every(w => hay.includes(w.replace(/[-\s]/g, '')))
}

export function Catalog() {
  const route = useRoute()
  const products = useStore(s => s.products), bookings = useStore(s => s.bookings), units = useStore(s => s.units), city = useStore(s => s.city), range = useStore(s => s.range)
  const [cat, setCat] = useState<CategoryId | 'all'>(route.params?.cat ?? 'all')
  const [sort, setSort] = useState<Sort>(route.params?.sort ?? 'popular')
  const [q, setQ] = useState(route.params?.q ?? '')
  const [brands, setBrands] = useState<string[]>([])
  const [price, setPrice] = useState<number | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)
  const [freeToday, setFreeToday] = useState(false)
  // «сегодня»: с текущего часа до завтра — забрать прямо сейчас (точка в Алматы работает 24/7)
  const today = useMemo(() => { const t = new Date(); t.setMinutes(0, 0, 0); return { start: t.getTime(), end: t.getTime() + 86400000 } }, [])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const chipsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setBrands([]) }, [cat])
  useEffect(() => {
    const el = chipsRef.current?.querySelector(`[data-cat="${cat}"]`) as HTMLElement | null
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [cat])

  const pop = useMemo(() => { const m = new Map<string, number>(); for (const b of bookings) for (const i of b.items) m.set(i.productId, (m.get(i.productId) ?? 0) + 1); return m }, [bookings])
  const base = useMemo(() => products.filter(p => !p.hidden && (cat === 'all' || p.category === cat) && matchProduct(p, q)), [products, cat, q])
  const allBrands = useMemo(() => { const m = new Map<string, number>(); for (const p of base) m.set(p.brand, (m.get(p.brand) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }, [base])
  const list = useMemo(() => {
    let l = base.filter(p => (!brands.length || brands.includes(p.brand)) && (price === null || (p.price >= PRICE[price].min && p.price < PRICE[price].max)))
    if (onlyFree) { const m = availMap(units, bookings, city, range.start, range.end); l = l.filter(p => (m.get(p.id)?.free ?? 0) > 0) }
    if (freeToday) { const m = availMap(units, bookings, city, today.start, today.end); l = l.filter(p => (m.get(p.id)?.free ?? 0) > 0) }
    const s = [...l]
    if (sort === 'popular') s.sort(byPopularity(pop))
    if (sort === 'new') s.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.createdAt - a.createdAt)
    if (sort === 'cheap') s.sort((a, b) => a.price - b.price)
    if (sort === 'expensive') s.sort((a, b) => b.price - a.price)
    return s
  }, [base, brands, price, onlyFree, freeToday, today, sort, units, bookings, city, range, pop])
  // Рендерим карточки порциями: первые 24, дальше +24 при подходе к низу
  const [page, setPage] = useState({ list, n: CHUNK })
  if (page.list !== list) setPage({ list, n: CHUNK }) // сброс при смене фильтров — до отрисовки
  const shown = page.list === list ? page.n : CHUNK
  const setShown = (f: (n: number) => number) => setPage(s => ({ ...s, n: f(s.n) }))
  const sentinel = useRef<HTMLDivElement>(null)
  const more = shown < list.length
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) setShown(n => n + CHUNK) }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, shown])
  const activeFilters = brands.length + (price !== null ? 1 : 0) + (onlyFree ? 1 : 0) + (freeToday ? 1 : 0)

  const filters = (
        <div className="flex flex-col gap-6">
      <div><div className="label mb-2">Сортировка</div>
        <div className="flex gap-2 flex-wrap">{SORTS.map(o => <button key={o.value} onClick={() => setSort(o.value)} className={cx('press h-9 px-3.5 rounded-full text-sm', sort === o.value ? 'bg-fg text-bg font-medium' : 'bg-surface-2 text-fg/85')}>{o.label}</button>)}</div>
      </div>
      <div><div className="label mb-2">Цена за сутки</div>
        <div className="flex gap-2 flex-wrap">{PRICE.map((p, i) => <button key={p.label} onClick={() => setPrice(price === i ? null : i)} className={cx('press h-9 px-3.5 rounded-full text-sm', price === i ? 'bg-fg text-bg font-medium' : 'bg-surface-2 text-fg/85')}>{p.label} ₸</button>)}</div>
      </div>
      <div><div className="label mb-2">Бренд</div>
        <div className="flex gap-2 flex-wrap">{allBrands.map(([b, n]) => (
          <button key={b} onClick={() => setBrands(brands.includes(b) ? brands.filter(x => x !== b) : [...brands, b])} className={cx('press h-9 px-3.5 rounded-full text-sm', brands.includes(b) ? 'bg-fg text-bg font-medium' : 'bg-surface-2 text-fg/85')}>
            {b} <span className="text-xs opacity-50 tnum">{n}</span>
          </button>))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3"><span>Только свободные на выбранные даты</span><Toggle checked={onlyFree} onChange={setOnlyFree} /></label>
    </div>
  )

  return (
    <div className="desk:grid desk:grid-cols-[232px_minmax(0,1fr)] desk:gap-8 desk:items-start">
    {/* сайт: фильтры слева, всегда на виду */}
    <aside className="hidden desk:flex flex-col gap-6 sticky top-[76px] max-h-[calc(100dvh-96px)] overflow-y-auto scrollbar-none pb-8">
      <div><div className="label mb-2">Категория</div>
        <div className="flex flex-col">
          {[{ id: 'all' as const, short: 'Всё' }, ...CATEGORIES].map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cx('h-9 px-3 rounded-lg text-sm text-left transition-colors', cat === c.id ? 'bg-surface-2 text-fg font-medium' : 'text-muted hover:text-fg')}>{c.short}</button>
          ))}
        </div>
      </div>
      {filters}
    </aside>
    <div className="flex flex-col gap-4 pb-8 min-w-0">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold flex-1">{cat === 'all' ? 'Каталог' : catName(cat)}</h1>
        <span className="text-sm text-faint tnum">{list.length} {plural(list.length, 'позиция', 'позиции', 'позиций')}</span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input id="catalog-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Сони, FX3, петлички…" className="field pl-10 h-12" />
          {q && <button aria-label="Очистить" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md hover:bg-surface-3"><X className="size-4" /></button>}
        </div>
        <button onClick={() => setFiltersOpen(true)} className="desk:hidden relative h-12 px-4 rounded-xl bg-surface-2 flex items-center gap-2 text-sm font-medium transition-colors">
          <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">Фильтры</span>
          {activeFilters > 0 && <span className="absolute -top-1.5 -right-1.5 size-5 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold">{activeFilters}</span>}
        </button>
      </div>

      {/* популярные запросы — пока строка поиска пустая */}
      {!q && cat === 'all' && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 items-center">
          <span className="text-xs text-faint shrink-0">Часто ищут</span>
          {POPULAR_Q.map(t => <button key={t} onClick={() => setQ(t)} className="press shrink-0 h-8 px-3 rounded-full bg-surface-2 text-sm text-fg/85">{t}</button>)}
        </div>
      )}

      <div ref={chipsRef} className="desk:hidden flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0">
        {[{ id: 'all' as const, short: 'Всё' }, ...CATEGORIES].map(c => (
          <button key={c.id} data-cat={c.id} onClick={() => setCat(c.id)}
            className={cx('press relative h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap flex items-center transition-colors duration-200', cat === c.id ? 'text-bg' : 'text-fg/85 bg-surface')}>
            {cat === c.id && <span className="absolute inset-0 rounded-full bg-fg" />}
            <span className="relative">{c.short}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {([['today', 'Свободно сегодня', freeToday, setFreeToday], ['dates', 'Свободно на мои даты', onlyFree, setOnlyFree]] as const).map(([k, l, on, set]) => (
          <button key={k} onClick={() => { set(!on); haptic(5) }} className={cx('press h-9 px-3.5 rounded-full text-sm flex items-center gap-1.5', on ? 'bg-ok/15 text-ok font-medium' : 'bg-surface-2 text-fg/85')}>
            <span className={cx('size-1.5 rounded-full', on ? 'bg-ok' : 'bg-faint')} />{l}
          </button>
        ))}
      </div>

      <div key={cat + sort} className="fade-in">
          {list.length ? (<>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 desk:grid-cols-3 xl:grid-cols-4 gap-3">
              {list.slice(0, shown).map(p => <ProductCard key={p.id} p={p} />)}
            </div>
            {more && <div ref={sentinel} className="h-px" aria-hidden />}
          </>) : (
            <Empty icon={<PackageSearch className="size-7" />} title="Ничего не нашли" text="Попробуйте другое название или снимите фильтры. Можно оставить заявку, и мы подберём технику."
              action={<Button variant="soft" onClick={() => { setQ(''); setBrands([]); setPrice(null); setOnlyFree(false); setFreeToday(false) }}>Сбросить всё</Button>} />
          )}
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры"
        footer={<div className="flex gap-2"><Button variant="soft" onClick={() => { setBrands([]); setPrice(null); setOnlyFree(false); setSort('popular') }}>Сбросить</Button><Button block onClick={() => setFiltersOpen(false)}>Показать {list.length}</Button></div>}>
        {filters}
      </Sheet>
    </div>
    </div>
  )
}
