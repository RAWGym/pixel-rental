import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Wrench } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead, useAdminNav } from './Admin'
import { Button, cx } from '../ui/kit'
import { CATEGORIES } from '../data/categories'
import type { CategoryId, CityId } from '../data/types'
import { DAY } from '../lib/pricing'
import { WD, dShort } from '../lib/format'
import { matchProduct } from '../client/Catalog'

const COLORS: Record<string, string> = { new: 'bg-warn/80 text-accent-ink', confirmed: 'bg-info/80 text-accent-ink', issued: 'bg-accent text-accent-ink', returned: 'bg-surface-3 text-muted' }

export function CalendarAdmin() {
  const { units, bookings, products, customers, staffId, staff } = useStore()
  const go = useAdminNav(s => s.go)
  const me = staff.find(s => s.id === staffId)
  const [cat, setCat] = useState<CategoryId>('cameras')
  const [city, setCity] = useState<CityId>(me?.city === 'astana' ? 'astana' : 'almaty')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(-2)
  const N = 14
  const t0 = new Date(); t0.setHours(0, 0, 0, 0)
  const from = t0.getTime() + offset * DAY, to = from + N * DAY
  const rows = useMemo(() => {
    const ps = products.filter(p => !p.hidden && (q ? matchProduct(p, q) : p.category === cat))
    return ps.flatMap(p => units.filter(u => u.productId === p.id && u.city === city).map((u, i) => ({ p, u, first: i === 0 })))
  }, [products, units, cat, city, q])
  const bars = useMemo(() => {
    const m = new Map<string, { id: string; code: string; s: number; e: number; status: string; who: string }[]>()
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.end < from || b.start > to) continue
      for (const it of b.items) for (const uid of it.unitIds) {
        const l = m.get(uid) ?? []; l.push({ id: b.id, code: b.code, s: b.start, e: b.status === 'issued' ? Math.max(b.end, Date.now()) : b.end, status: b.status === 'issued' && b.end < Date.now() ? 'overdue' : b.status, who: customers.find(c => c.id === b.customerId)?.name.split(' ')[0] ?? '' }); m.set(uid, l)
      }
    }
    return m
  }, [bookings, from, to, customers])
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100))
  const nowPct = pct(Date.now())

  return (
    <div>
      <PageHead title="Шахматка" actions={
        <div className="flex gap-1"><Button variant="soft" size="sm" onClick={() => setOffset(offset - 7)} aria-label="Назад"><ChevronLeft className="size-4" /></Button><Button variant="soft" size="sm" onClick={() => setOffset(-2)}>Сегодня</Button><Button variant="soft" size="sm" onClick={() => setOffset(offset + 7)} aria-label="Вперёд"><ChevronRight className="size-4" /></Button></div>} />
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="cal-q" className="field pl-10 h-11" placeholder="Поиск по всем категориям" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select id="cal-cat" className="field h-11 md:w-52" value={cat} onChange={e => { setCat(e.target.value as CategoryId); setQ('') }}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select id="cal-city" className="field h-11 md:w-40" value={city} onChange={e => setCity(e.target.value as CityId)}><option value="almaty">Алматы</option><option value="astana">Астана</option></select>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted mb-3">
        {[['bg-warn/80', 'Новая'], ['bg-info/80', 'Подтверждена'], ['bg-accent', 'На руках'], ['bg-bad', 'Просрочена'], ['bg-surface-3', 'Возвращена']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('size-2.5', c)} />{l}</span>)}
      </div>
      <div className="rounded-2xl bg-surface overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="flex border-b border-line sticky top-0 bg-surface z-10">
            <div className="w-64 shrink-0 px-3 py-2 text-xs text-muted">{rows.length} ед.</div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
              {Array.from({ length: N }, (_, i) => { const t = from + i * DAY; const d = new Date(t); const today = t === t0.getTime(); const we = d.getDay() === 0 || d.getDay() === 6; return (
                <div key={i} className={cx('text-center py-1.5 border-l border-line/60', today && 'bg-accent/10', we && !today && 'bg-surface-2/50')}><div className={cx('text-xs', today ? 'text-accent' : 'text-faint')}>{WD[d.getDay()]}</div><div className={cx('tnum text-xs', today && 'text-accent font-semibold')}>{d.getDate()}</div></div>
              ) })}
            </div>
          </div>
          {rows.map(({ p, u, first }) => (
            <div key={u.id} className={cx('flex border-b border-line/50 hover:bg-surface-2/40', first && 'border-t border-line')}>
              <div className="w-64 shrink-0 px-3 py-1.5 min-w-0"><div className={cx('text-sm truncate', !first && 'text-muted')}>{first ? p.name : ''}</div><div className="text-xs tnum text-faint flex items-center gap-1">{u.serial}{u.maintenance && <Wrench className="size-3 text-warn" />}</div></div>
              <div className="flex-1 relative h-11">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>{Array.from({ length: N }, (_, i) => <div key={i} className={cx('border-l border-line/40', from + i * DAY === t0.getTime() && 'bg-accent/[0.05]')} />)}</div>
                {u.maintenance && <div className="absolute inset-y-2 left-0 right-0 bg-[repeating-linear-gradient(45deg,transparent_0_6px,color-mix(in_oklab,var(--color-warn)_25%,transparent)_6px_8px)] rounded" title="На обслуживании" />}
                {(bars.get(u.id) ?? []).map(b => (
                  <button key={b.id} onClick={() => go('bookings', b.id)} title={`${b.code} · ${b.who} · ${dShort(b.s)}-${dShort(b.e)}`}
                    className={cx('absolute top-2 bottom-2 rounded-md px-1.5 text-xs font-semibold truncate text-left hover:brightness-110 ring-2 ring-surface', b.status === 'overdue' ? 'bg-bad text-accent-ink' : COLORS[b.status])}
                    style={{ left: `${pct(b.s)}%`, width: `max(${pct(b.e) - pct(b.s)}%, 6px)` }}>{b.code.replace('PX-', '')} {b.who}</button>
                ))}
                {nowPct > 0 && nowPct < 100 && <div className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${nowPct}%` }} />}
              </div>
            </div>
          ))}
          {!rows.length && <div className="p-10 text-center text-muted">В этом городе нет единиц по фильтру</div>}
        </div>
      </div>
    </div>
  )
}
