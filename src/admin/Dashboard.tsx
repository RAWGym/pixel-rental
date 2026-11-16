import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, AlertTriangle, Inbox, ShieldCheck, Wrench, Flame, Wallet, Download, TrendingDown, ChevronRight, Check, ArrowRight, Receipt, Gauge, UserPlus, Sparkles, CheckCircle2, XCircle, Phone } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/store'
import { PageHead, useAdminNav } from './Admin'
import { Seg } from './Chrome'
import { Badge, Button, cx, toast, haptic } from '../ui/kit'
import { money, num, hm, dShort, relTime } from '../lib/format'
import { DAY } from '../lib/pricing'
import { isActive, availMap } from '../lib/availability'
import { catName } from '../data/categories'
import { verificationOf, type Booking, type BookingStatus, type CityId, type Product } from '../data/types'

/* ---------- период ---------- */
type PeriodId = 'today' | '7' | '30' | '365' | 'custom'
const PERIODS: { id: PeriodId; label: string }[] = [{ id: 'today', label: 'Сегодня' }, { id: '7', label: '7 дней' }, { id: '30', label: '30 дней' }, { id: '365', label: 'Год' }, { id: 'custom', label: 'Период' }]
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const isoDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} млн` : n >= 1e4 ? `${Math.round(n / 1000)}K` : num(n)

/* цвета графиков: статусы — проверенный категориальный набор (тёмная тема), всё остальное — фирменный оранжевый */
const STATUS_ORDER: BookingStatus[] = ['new', 'confirmed', 'issued', 'returned', 'cancelled']
const STATUS_COLOR: Record<BookingStatus, string> = { new: '#3987e5', confirmed: '#d95926', issued: '#199e70', returned: '#c98500', cancelled: '#d55181' }
const STATUS_LABEL: Record<BookingStatus, string> = { new: 'Новые', confirmed: 'Подтверждены', issued: 'В аренде', returned: 'Возвращены', cancelled: 'Отменены' }
const SLOTS = [{ label: 'Утро', from: 6, to: 12 }, { label: 'День', from: 12, to: 16 }, { label: 'Вечер', from: 16, to: 21 }, { label: 'Ночь', from: 21, to: 30 }]
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/* ---------- расчёт метрик (один проход, мемоизация по входным данным) ---------- */
interface Stats {
  revenue: number; count: number; avg: number; util: number; newClients: number; conv: number | null; leadsN: number
  byStatus: Record<BookingStatus, number>
  series: { t: number; v: number }[]
  byProduct: Map<string, { rev: number; days: number }>
  byCat: Map<string, number>
  heat: number[][] // [weekday][slot]
  funnel: [number, number, number]
  unitDays: Map<string, number> // товар → занятые единице-сутки
}
function compute(bs: Booking[], units: { id: string; productId: string }[], from: number, to: number, bucket: number, leads: { createdAt: number; status: string }[], newClients: number): Stats {
  const now = Date.now()
  const counted = bs.filter(b => b.status !== 'cancelled' && b.start >= from && b.start < to)
  const revenue = counted.reduce((s, b) => s + b.total, 0)
  const byStatus = { new: 0, confirmed: 0, issued: 0, returned: 0, cancelled: 0 } as Record<BookingStatus, number>
  for (const b of bs) if (b.start >= from && b.start < to) byStatus[b.status]++
  const nB = Math.max(1, Math.round((to - from) / bucket))
  const series = Array.from({ length: nB }, (_, i) => ({ t: from + i * bucket, v: 0 }))
  const byProduct = new Map<string, { rev: number; days: number }>(), byCat = new Map<string, number>()
  const heat = Array.from({ length: 7 }, () => [0, 0, 0, 0])
  for (const b of counted) {
    const i = Math.min(nB - 1, Math.floor((b.start - from) / bucket)); series[i].v += b.total
    const k = b.subtotal ? b.total / b.subtotal : 1 // доля выручки после скидки
    for (const it of b.items) {
      const rev = it.price * it.qty * b.days * k
      const e = byProduct.get(it.productId) ?? { rev: 0, days: 0 }; e.rev += rev; e.days += b.days * it.qty; byProduct.set(it.productId, e)
    }
    const d = new Date(b.start), h = d.getHours() < 6 ? d.getHours() + 24 : d.getHours()
    const slot = SLOTS.findIndex(s => h >= s.from && h < s.to)
    heat[(d.getDay() + 6) % 7][slot < 0 ? 3 : slot]++
  }
  // загрузка: занятые единице-часы / ёмкость
  const unitSet = new Set(units.map(u => u.id)), unitProduct = new Map(units.map(u => [u.id, u.productId]))
  let busy = 0
  const unitDays = new Map<string, number>()
  for (const b of bs) {
    if (b.status === 'cancelled' || b.end <= from || b.start >= to) continue
    const end = b.status === 'issued' ? Math.max(b.end, Math.min(now, to)) : b.end
    const ov = Math.max(0, Math.min(end, to) - Math.max(b.start, from))
    for (const it of b.items) for (const u of it.unitIds) if (unitSet.has(u)) { busy += ov; const pid = unitProduct.get(u)!; unitDays.set(pid, (unitDays.get(pid) ?? 0) + ov / DAY) }
  }
  const util = units.length ? busy / (units.length * (to - from)) : 0
  const created = bs.filter(b => b.createdAt >= from && b.createdAt < to)
  const ls = leads.filter(l => l.createdAt >= from && l.createdAt < to)
  const closed = ls.filter(l => l.status === 'done' || l.status === 'lost')
  const conv = closed.length ? ls.filter(l => l.status === 'done').length / closed.length : null
  // воронка по броням, созданным в периоде: создано → не отменено (подтверждено) → выдано клиенту
  const funnel: [number, number, number] = [created.length, created.filter(b => b.status !== 'cancelled' && b.status !== 'new').length, created.filter(b => b.status === 'issued' || b.status === 'returned').length]
  return { revenue, count: counted.length, avg: counted.length ? revenue / counted.length : 0, util, newClients, conv, leadsN: ls.length, byStatus, series, byProduct, byCat, heat, funnel, unitDays }
}

/* ---------- элементы ---------- */
/** число «набегает» от 0 до значения (easeOutCubic), уважает reduced motion */
function useCountUp(v: number, ms = 900) {
  const [x, setX] = useState(v)
  const from = useRef(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setX(v); return }
    const a = from.current, t0 = performance.now(); let raf = 0
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); setX(a + (v - a) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = v }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [v])
  return x
}
function CountUp({ v, fmt = (n: number) => num(Math.round(n)) }: { v: number; fmt?: (n: number) => string }) { return <>{fmt(useCountUp(v))}</> }

/** спарклайн: белая линия с мягкой заливкой — как в референсе, акцент Pixel */
function Spark({ vals, h = 92 }: { vals: number[]; h?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const max = Math.max(1, ...vals), n = vals.length
  const pts = vals.map((v, i) => [n === 1 ? w / 2 : (i / (n - 1)) * w, 6 + (1 - v / max) * (h - 12)] as const)
  // сглаживание: кубические кривые через середины
  const d = pts.map((p, i) => i === 0 ? `M${p[0]},${p[1]}` : `Q${pts[i - 1][0]},${pts[i - 1][1]} ${(pts[i - 1][0] + p[0]) / 2},${(pts[i - 1][1] + p[1]) / 2}`).join('') + (n > 1 ? `T${pts[n - 1][0]},${pts[n - 1][1]}` : '')
  return (
    <div ref={ref} className="w-full">
      {w > 0 && n > 1 && (
        <svg width={w} height={h} className="block overflow-visible" aria-hidden>
          <defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-fg)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--color-fg)" stopOpacity={0} /></linearGradient></defs>
          <path className="fill-in" d={`${d}L${w},${h}L0,${h}Z`} fill="url(#spark-fill)" />
          <path className="draw" pathLength={1} style={{ ['--len' as any]: 1 }} d={d} fill="none" stroke="var(--color-fg)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={4} fill="var(--color-accent)" stroke="var(--scene-bg)" strokeWidth={2} className="fill-in" />
        </svg>
      )}
    </div>
  )
}

function Chip({ v, pp }: { v: number | null; pp?: boolean }) {
  if (v === null || !isFinite(v)) return <span className="h-6 px-2 rounded-lg text-xs grid place-items-center bg-surface-3 text-muted">-</span>
  const r = Math.round(v)
  return <span className={cx('h-6 px-2 rounded-lg text-xs font-semibold tnum grid place-items-center', r >= 0 ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')}>{r > 0 ? '+' : ''}{r}{pp ? ' п.п.' : '%'}</span>
}
const pct = (c: number, p: number) => (p ? ((c - p) / p) * 100 : null)
const ini = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('')
const AV = ['#f2c9a0', '#c9e4d6', '#d6d9f2', '#f2d6d6', '#efe2b8']
function Delta({ cur, prev, invert, pp, off }: { cur: number; prev: number; invert?: boolean; pp?: boolean; off?: boolean }) {
  if (off) return <span className="text-xs text-faint">нет данных для сравнения</span>
  if (!prev && !cur) return <span className="text-xs text-faint">-</span>
  const d = pp ? (cur - prev) * 100 : prev ? ((cur - prev) / prev) * 100 : 100
  const r = Math.round(d)
  if (r === 0) return <span className="text-xs text-muted">≈ как раньше</span>
  const good = invert ? r < 0 : r > 0
  return <span className={cx('text-xs font-medium tnum', good ? 'text-ok' : 'text-bad')}>{r > 0 ? '▲' : '▼'} {Math.abs(r)}{pp ? ' п.п.' : '%'}</span>
}

function Kpi({ label, value, delta, hint, onClick, icon }: { label: string; value: React.ReactNode; delta?: React.ReactNode; hint?: React.ReactNode; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={cx('glass rise text-left p-4 flex flex-col gap-1.5 min-w-0', onClick && 'press lift')}>
      <div className="flex items-center gap-1.5 text-sm text-muted min-w-0">{icon}<span className="truncate">{label}</span></div>
      <div className="text-2xl font-semibold tnum truncate">{value}</div>
      <div className="flex items-center gap-2 flex-wrap min-h-4">{delta}{hint && <span className="text-xs text-faint">{hint}</span>}</div>
    </button>
  )
}

function Card({ title, sub, children, action, className, i = 0 }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string; i?: number }) {
  return (
    <section className={cx('glass rise lift p-4 sm:p-5 flex flex-col gap-3 min-w-0', className)} style={{ ['--i' as any]: i }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="font-semibold">{title}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
        {action}
      </div>
      {children}
    </section>
  )
}
const Empty = ({ text = 'Нет данных за период' }: { text?: string }) => <div className="text-sm text-muted py-8 text-center">{text}</div>

/** Выручка: область + линия, пунктир не нужен — прошлый период тонкой серой линией; перекрестье и подсказка */
function RevenueArea({ cur, prev, bucket }: { cur: { t: number; v: number }[]; prev: number[]; bucket: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hi, setHi] = useState<number | null>(null)
  const H = 200, PL = 0, PR = 44, PT = 8, PB = 22
  const max = Math.max(1, ...cur.map(d => d.v), ...prev)
  const step = Math.pow(10, Math.floor(Math.log10(max))); const nice = Math.ceil(max / step) * step
  const n = cur.length
  const x = (i: number) => PL + (n === 1 ? (w - PL - PR) / 2 : (i / (n - 1)) * (w - PL - PR))
  const y = (v: number) => PT + (1 - v / nice) * (H - PT - PB)
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const vals = cur.map(d => d.v)
  const fmtT = (t: number) => bucket >= 7 * DAY ? `нед. с ${dShort(t)}` : dShort(t)
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - PL) / Math.max(1, w - PL - PR)) * (n - 1))
    setHi(Math.max(0, Math.min(n - 1, i)))
  }
  if (!vals.some(Boolean)) return <Empty />
  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-muted mb-2">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-accent" />Этот период</span>
        {prev.length === n && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-faint" />Прошлый</span>}
      </div>
      <div ref={ref} className="relative touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)}>
        {w > 0 && (
          <svg width={w} height={H} className="block" role="img" aria-label="Выручка по периоду">
            {[0, 0.5, 1].map(f => (
              <g key={f}>
                <line x1={PL} x2={w - PR} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={w - PR + 6} y={y(nice * f) + 4} className="fill-[var(--color-faint)] text-[11px] tnum">{compact(nice * f)}</text>
              </g>
            ))}
            {prev.length === n && <path className="fill-in" d={line(prev)} fill="none" stroke="var(--color-faint)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
            <defs><linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} /></linearGradient></defs>
            <path className="fill-in" d={`${line(vals)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="url(#rev-fill)" />
            <path className="draw" pathLength={1} style={{ ['--len' as any]: 1 }} d={line(vals)} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hi !== null && (
              <g>
                <line x1={x(hi)} x2={x(hi)} y1={PT} y2={H - PB} stroke="var(--color-line-2)" strokeWidth={1} />
                <circle cx={x(hi)} cy={y(vals[hi])} r={5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
              </g>
            )}
            <text x={PL} y={H - 4} className="fill-[var(--color-faint)] text-[11px]">{fmtT(cur[0].t)}</text>
            <text x={w - PR} y={H - 4} textAnchor="end" className="fill-[var(--color-faint)] text-[11px]">{fmtT(cur[n - 1].t)}</text>
          </svg>
        )}
        {hi !== null && w > 0 && (
          <div className="absolute top-0 pointer-events-none rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs shadow-xl shadow-black/40 whitespace-nowrap"
            style={{ left: Math.min(Math.max(0, x(hi) - 70), w - 150) }}>
            <div className="text-muted">{fmtT(cur[hi].t)}</div>
            <div className="font-semibold tnum">{money(vals[hi])}</div>
            {prev.length === n && <div className="text-muted tnum">прошлый: {money(prev[hi])}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Горизонтальные столбики одного цвета; значение у конца */
function HBars({ rows, fmt, onClick }: { rows: { id: string; label: string; v: number; sub?: string }[]; fmt: (n: number) => string; onClick?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map(r => r.v))
  if (!rows.length) return <Empty />
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <button key={r.id} onClick={() => onClick?.(r.id)} disabled={!onClick} className="group text-left min-w-0" title={`${r.label}: ${fmt(r.v)}`}>
          <div className="flex justify-between text-sm gap-3 mb-1"><span className="truncate">{r.label}</span><span className="tnum text-muted shrink-0">{fmt(r.v)}</span></div>
          <div className="h-2 rounded-r-full bg-surface-3/60"><div className="grow h-full rounded-r-[4px] bg-accent/85 group-hover:bg-accent transition-colors" style={{ width: `${Math.max(2, (r.v / max) * 100)}%`, ['--i' as any]: rows.indexOf(r) }} /></div>
        </button>
      ))}
    </div>
  )
}

/** Брони по статусам: одна сегментированная полоса + легенда с числами */
function StatusBar({ by }: { by: Record<BookingStatus, number> }) {
  const total = STATUS_ORDER.reduce((s, k) => s + by[k], 0)
  const [hi, setHi] = useState<BookingStatus | null>(null)
  if (!total) return <Empty />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 gap-[2px]">
        {STATUS_ORDER.filter(k => by[k]).map((k, i, a) => (
          <div key={k} onPointerEnter={() => setHi(k)} onPointerLeave={() => setHi(null)} title={`${STATUS_LABEL[k]}: ${by[k]}`}
            className={cx('h-full transition-opacity', i === 0 && 'rounded-l-[4px]', i === a.length - 1 && 'rounded-r-[4px]', hi && hi !== k && 'opacity-40')}
            style={{ width: `${(by[k] / total) * 100}%`, background: STATUS_COLOR[k], minWidth: 3 }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        {STATUS_ORDER.map(k => (
          <div key={k} className={cx('flex items-center gap-2 text-sm min-w-0 transition-opacity', hi && hi !== k && 'opacity-50')} onPointerEnter={() => setHi(k)} onPointerLeave={() => setHi(null)}>
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLOR[k] }} />
            <span className="truncate text-muted">{STATUS_LABEL[k]}</span>
            <span className="tnum ml-auto">{by[k]}</span>
            <span className="tnum text-xs text-faint w-9 text-right">{Math.round((by[k] / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Тепловая карта: день недели × время выдачи (одна шкала оранжевого) */
function Heatmap({ m }: { m: number[][] }) {
  const max = Math.max(1, ...m.flat())
  const [hi, setHi] = useState<[number, number] | null>(null)
  if (!m.flat().some(Boolean)) return <Empty />
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: '28px repeat(4, minmax(0, 1fr))' }}>
        <span />{SLOTS.map(s => <span key={s.label} className="text-xs text-faint text-center">{s.label}</span>)}
        {m.map((row, d) => (
          <Fragment key={d}>
            <span className="text-xs text-muted self-center">{WD[d]}</span>
            {row.map((v, s) => {
              const k = v / max
              return (
                <div key={d + '-' + s} onPointerEnter={() => setHi([d, s])} onPointerLeave={() => setHi(null)} title={`${WD[d]}, ${SLOTS[s].label.toLowerCase()}: ${v} выдач`}
                  className={cx('h-7 rounded-md grid place-items-center text-xs tnum transition-[outline]', hi && hi[0] === d && hi[1] === s && 'outline outline-2 outline-fg/60')}
                  style={{ background: `color-mix(in oklab, var(--color-accent) ${Math.round(6 + k * 88)}%, var(--color-surface-2))`, color: k > 0.55 ? 'var(--color-accent-ink)' : 'var(--color-muted)' }}>
                  {v || ''}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-faint">меньше<span className="h-2 flex-1 max-w-32 rounded-full" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--color-accent) 6%, var(--color-surface-2)), var(--color-accent))' }} />больше выдач</div>
    </div>
  )
}

function Funnel({ f }: { f: [number, number, number] }) {
  const labels = ['Создано броней', 'Подтверждено', 'Выдано клиентам']
  if (!f[0] && !f[1]) return <Empty />
  const max = Math.max(1, ...f)
  return (
    <div className="flex flex-col gap-2">
      {f.map((v, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm gap-2"><span className="text-muted">{labels[i]}</span>
            <span className="tnum">{v}{i > 0 && f[i - 1] ? <span className="text-xs text-faint"> · {Math.round((v / f[i - 1]) * 100)}%</span> : null}</span></div>
          <div className="h-5 rounded-[4px] bg-accent" style={{ width: `${Math.max(3, (v / max) * 100)}%`, opacity: 1 - i * 0.22 }} />
        </div>
      ))}
    </div>
  )
}

/* ---------- экспорт ---------- */
function exportCsv(rows: Booking[], name: (id: string) => string, product: (id: string) => string, from: number, to: number) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Номер', 'Создана', 'Начало', 'Конец', 'Суток', 'Город', 'Клиент', 'Статус', 'Сумма', 'Оплачено', 'Скидка', 'Источник', 'Техника']
  const lines = rows.map(b => [b.code, isoDay(b.createdAt), new Date(b.start).toLocaleString('ru-RU'), new Date(b.end).toLocaleString('ru-RU'), b.days, b.city === 'almaty' ? 'Алматы' : 'Астана',
    name(b.customerId), STATUS_LABEL[b.status], b.total, b.paid, b.discount, b.source, b.items.map(i => `${product(i.productId)} ×${i.qty}`).join('; ')].map(esc).join(';'))
  const csv = '﻿' + [head.map(esc).join(';'), ...lines].join('\r\n')
  const file = `pixel-rental_${isoDay(from)}_${isoDay(to - 1)}.csv`
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast(`Отчёт выгружен: ${rows.length} броней`)
  } catch { toast('Не удалось сохранить файл', { tone: 'bad' }) }
}

/* ---------- дашборд ---------- */
export function Dashboard() {
  const { bookings, units, products, leads, customers, staffId, staff, setBookingStatus } = useStore(useShallow(s => ({ bookings: s.bookings, units: s.units, products: s.products, leads: s.leads, customers: s.customers, staffId: s.staffId, staff: s.staff, setBookingStatus: s.setBookingStatus })))
  const can = useStore(s => s.can)
  const go = useAdminNav(s => s.go)
  const me = staff.find(s => s.id === staffId)
  const [city, setCity] = useState<'all' | CityId>(me?.city ?? 'all')
  const [period, setPeriod] = useState<PeriodId>('30')
  const today = startOfDay(Date.now())
  const [cFrom, setCFrom] = useState(isoDay(today - 13 * DAY)), [cTo, setCTo] = useState(isoDay(today))
  const [topBy, setTopBy] = useState<'rev' | 'days'>('rev')

  // роли: владелец — всё, менеджер — операционка, кладовщик — выдачи и техника, бухгалтер — деньги
  const fin = can('finance') || can('pricing.edit')
  const ops = can('bookings.edit')
  const wh = can('units.edit')
  const canAct = ops || wh

  const { from, to, bucket, label } = useMemo(() => {
    if (period === 'today') return { from: today, to: today + DAY, bucket: DAY, label: 'сегодня' }
    if (period === 'custom') {
      const f = startOfDay(new Date(cFrom).getTime() || today), t = startOfDay(new Date(cTo).getTime() || today) + DAY
      const a = Math.min(f, t - DAY), b = Math.max(f + DAY, t)
      return { from: a, to: b, bucket: b - a > 62 * DAY ? 7 * DAY : DAY, label: `${dShort(a)} - ${dShort(b - DAY)}` }
    }
    const n = Number(period)
    return { from: today - (n - 1) * DAY, to: today + DAY, bucket: n > 62 ? 7 * DAY : DAY, label: n === 365 ? 'за год' : `за ${n} дней` }
  }, [period, cFrom, cTo, today])
  const len = to - from
  // сравнивать можно, только если прошлый период целиком покрыт историей
  const historyFrom = useMemo(() => bookings.reduce((m, b) => Math.min(m, b.start), Infinity), [bookings])
  const cmp = from - len >= startOfDay(historyFrom)

  const bs = useMemo(() => bookings.filter(b => city === 'all' || b.city === city), [bookings, city])
  const us = useMemo(() => units.filter(u => (city === 'all' || u.city === city) && !u.maintenance && u.condition !== 'repair'), [units, city])
  const ls = useMemo(() => leads.filter(l => city === 'all' || l.city === city), [leads, city])
  const clientsIn = (a: number, b: number) => customers.filter(c => c.createdAt >= a && c.createdAt < b).length
  // «сегодня» — график показываем за 14 дней, чтобы было с чем сравнить
  const chartFrom = period === 'today' ? today - 13 * DAY : from
  const cur = useMemo(() => compute(bs, us, from, to, bucket, ls, clientsIn(from, to)), [bs, us, ls, customers, from, to, bucket])
  const prev = useMemo(() => compute(bs, us, from - len, from, bucket, ls, clientsIn(from - len, from)), [bs, us, ls, customers, from, len, bucket])
  const chart = useMemo(() => {
    const cl = to - chartFrom
    const c = period === 'today' ? compute(bs, us, chartFrom, to, DAY, ls, 0).series : cur.series
    const p = compute(bs, us, chartFrom - cl, chartFrom, period === 'today' ? DAY : bucket, ls, 0).series.map(x => x.v)
    return { c, p }
  }, [bs, us, ls, cur, chartFrom, to, period, bucket])

  // операционка «сейчас» — не зависит от периода
  const now = Date.now()
  const ops$ = useMemo(() => {
    const pickups = bs.filter(b => b.start >= today && b.start < today + DAY && (b.status === 'new' || b.status === 'confirmed')).sort((a, b) => a.start - b.start)
    const returns = bs.filter(b => b.end >= today && b.end < today + DAY && b.status === 'issued').sort((a, b) => a.end - b.end)
    const overdue = bs.filter(b => b.status === 'issued' && b.end < now).sort((a, b) => a.end - b.end)
    const upcoming = bs.filter(b => b.start >= today + DAY && b.start < today + 4 * DAY && (b.status === 'new' || b.status === 'confirmed')).sort((a, b) => a.start - b.start).slice(0, 5)
    const newLeads = ls.filter(l => l.status === 'new')
    const verif = customers.filter(c => verificationOf(c) === 'pending')
    const repair = units.filter(u => (city === 'all' || u.city === city) && (u.maintenance || u.condition === 'repair'))
    const unpaid = bs.filter(b => isActive(b) && b.paid < b.total && b.start < now + 2 * DAY)
    // популярное, которого нет на ближайшие сутки
    const pop = new Map<string, number>(); for (const b of bs) if (b.start > now - 60 * DAY) for (const i of b.items) pop.set(i.productId, (pop.get(i.productId) ?? 0) + 1)
    const top = [...pop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id]) => id)
    const cities: CityId[] = city === 'all' ? ['almaty', 'astana'] : [city]
    const maps = cities.map(c => availMap(units, bookings, c, now, now + DAY))
    const scarce = top.filter(id => maps.reduce((s, m) => s + (m.get(id)?.free ?? 0), 0) === 0)
    return { pickups, returns, overdue, upcoming, newLeads, verif, repair, unpaid, scarce }
  }, [bs, ls, customers, units, bookings, city, today])

  const pName = useMemo(() => { const m = new Map(products.map(p => [p.id, p])); return (id: string) => m.get(id)?.name ?? id }, [products])
  const cName = useMemo(() => { const m = new Map(customers.map(c => [c.id, c.name])); return (id: string) => m.get(id) ?? '-' }, [customers])
  const unitsPerProduct = useMemo(() => { const m = new Map<string, number>(); for (const u of us) m.set(u.productId, (m.get(u.productId) ?? 0) + 1); return m }, [us])

  // простаивает: самая низкая загрузка за период среди техники от 3 000 ₸/сут
  const idle = useMemo(() => {
    const days = len / DAY
    return products.filter((p: Product) => !p.hidden && p.price >= 3000 && (unitsPerProduct.get(p.id) ?? 0) > 0)
      .map(p => ({ p, util: (cur.unitDays.get(p.id) ?? 0) / ((unitsPerProduct.get(p.id) ?? 1) * days) }))
      .sort((a, b) => a.util - b.util || b.p.price - a.p.price).slice(0, 6)
  }, [products, unitsPerProduct, cur, len])

  const topRows = [...cur.byProduct.entries()].sort((a, b) => (topBy === 'rev' ? b[1].rev - a[1].rev : b[1].days - a[1].days)).slice(0, 10)
    .map(([id, v]) => ({ id, label: pName(id), v: topBy === 'rev' ? v.rev : v.days }))
  const catRows = (() => { const m = new Map<string, number>(); for (const [id, v] of cur.byProduct) { const p = products.find(x => x.id === id); if (p) m.set(p.category, (m.get(p.category) ?? 0) + v.rev) } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ id, label: catName(id as any), v })) })()

  // выдача и приёмка — в разделе «Выдача»: выдать можно только с подписью клиента
  const act = (b: Booking, _s: BookingStatus) => { haptic(10); go('issue', b.id) }
  const attention = [
    can('leads') && ops$.newLeads.length > 0 && { icon: <Inbox className="size-4" />, text: 'Заявки без ответа', n: ops$.newLeads.length, tone: 'text-accent', on: () => go('leads') },
    can('customers') && ops$.verif.length > 0 && { icon: <ShieldCheck className="size-4" />, text: 'Профили ждут проверки', n: ops$.verif.length, tone: 'text-warn', on: () => go('customers') },
    ops$.overdue.length > 0 && { icon: <AlertTriangle className="size-4" />, text: 'Просрочены возвраты', n: ops$.overdue.length, tone: 'text-bad', on: () => go('bookings', 'overdue') },
    fin && ops$.unpaid.length > 0 && { icon: <Wallet className="size-4" />, text: `Не оплачено к выдаче · ${compact(ops$.unpaid.reduce((s, b) => s + b.total - b.paid, 0))} ₸`, n: ops$.unpaid.length, tone: 'text-warn', on: () => go('bookings') },
    (wh || ops) && ops$.repair.length > 0 && { icon: <Wrench className="size-4" />, text: 'Техника в ремонте / на ТО', n: ops$.repair.length, tone: 'text-muted', on: () => go('products') },
    ops$.scarce.length > 0 && { icon: <Flame className="size-4" />, text: `Популярное разобрано: ${ops$.scarce.slice(0, 2).map(pName).join(', ')}${ops$.scarce.length > 2 ? '…' : ''}`, n: ops$.scarce.length, tone: 'text-accent', on: () => go('calendar') },
  ].filter(Boolean) as { icon: React.ReactNode; text: string; n: number; tone: string; on: () => void }[]

  const [allToday, setAllToday] = useState(false)
  const op = [...ops$.overdue.map(b => ({ b, kind: 'overdue' as const, t: b.end })), ...ops$.pickups.map(b => ({ b, kind: 'out' as const, t: b.start })), ...ops$.returns.map(b => ({ b, kind: 'in' as const, t: b.end }))]

  // ---- блоки «как в референсе» ----
  const money$ = useMemo(() => {
    const inP = bs.filter(b => b.status !== 'cancelled' && b.start >= from && b.start < to)
    const paid = inP.reduce((s, b) => s + b.paid, 0), due = inP.reduce((s, b) => s + Math.max(0, b.total - b.paid), 0)
    return { paid, due }
  }, [bs, from, to])
  const recent = useMemo(() => [...bs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [bs])
  const pipeline = (['new', 'confirmed', 'issued', 'returned'] as BookingStatus[]).map(k => {
    const list = bs.filter(b => b.status === k && b.start >= from && b.start < to)
    return { k, n: list.length, sum: list.reduce((s, b) => s + b.total, 0) }
  })
  const pipeTotal = pipeline.reduce((s, x) => s + x.n, 0)
  // давно не брали: клиенты с 2+ бронями, у которых последняя бронь была давнее всего
  const lapsed = useMemo(() => {
    const last = new Map<string, { t: number; n: number; code: string }>()
    for (const b of bookings) { if (b.status === 'cancelled') continue; const e = last.get(b.customerId); if (!e) last.set(b.customerId, { t: b.start, n: 1, code: b.code }); else { e.n++; if (b.start > e.t) { e.t = b.start; e.code = b.code } } }
    const active = new Set(bookings.filter(b => b.start > now - 2 * DAY && b.status !== 'cancelled').map(b => b.customerId))
    return customers.filter(c => !c.blacklisted && (last.get(c.id)?.n ?? 0) >= 2 && !active.has(c.id)).map(c => ({ c, ...last.get(c.id)! }))
      .filter(x => now - x.t > 14 * DAY).sort((a, b) => a.t - b.t).slice(-40).sort((a, b) => b.n - a.n).slice(0, 4)
  }, [bookings, customers])
  // команда сегодня: последние действия сотрудников из истории броней и журнала
  const audit = useStore(s => s.audit)
  const team = useMemo(() => {
    const ev: { who: string; text: string; at: number }[] = []
    for (const b of bookings) for (const h of b.history) if (h.by !== 'Клиент' && h.by !== 'Система' && h.at <= now) ev.push({ who: h.by, text: `${h.text.toLowerCase()} · ${b.code}`, at: h.at })
    for (const a of audit) { const st = staff.find(x => x.id === a.staffId); if (st) ev.push({ who: st.name.split(' ')[0], text: `${a.action.toLowerCase()}${a.target ? ` · ${a.target}` : ''}`, at: a.at }) }
    return ev.sort((a, b) => b.at - a.at).slice(0, 5)
  }, [bookings, audit, staff])
  // цели месяца: к прошлому месяцу +10%, загрузка 15%, клиенты
  const goals = useMemo(() => {
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0)
    const ms = m0.getTime(), pm = new Date(m0); pm.setMonth(pm.getMonth() - 1)
    const rev = (a: number, b: number) => bs.filter(x => x.status !== 'cancelled' && x.start >= a && x.start < b).reduce((s, x) => s + x.total, 0)
    const target = Math.max(1, Math.round(rev(pm.getTime(), ms) * 1.1 / 100000) * 100000)
    const st = compute(bs, us, ms, now, DAY, ls, customers.filter(c => c.createdAt >= ms).length)
    return [
      fin && { label: 'Выручка за месяц', icon: Wallet, cur: rev(ms, now + 30 * DAY), goal: target, fmt: (n: number) => `${compact(n)} ₸` },
      { label: 'Загрузка парка', icon: Gauge, cur: Math.round(st.util * 1000) / 10, goal: 15, fmt: (n: number) => `${n.toFixed(1).replace('.', ',')}%` },
      { label: 'Новые клиенты месяца', icon: UserPlus, cur: st.newClients, goal: 30, fmt: (n: number) => num(n) },
    ].filter(Boolean) as { label: string; icon: any; cur: number; goal: number; fmt: (n: number) => string }[]
  }, [bs, us, ls, customers, fin])
  const segPeriod: { id: PeriodId; label: string }[] = [{ id: '7', label: 'Неделя' }, { id: '30', label: 'Месяц' }, { id: '365', label: 'Год' }]
  const ICON: Record<BookingStatus, any> = { new: Sparkles, confirmed: CheckCircle2, issued: ArrowUpRight, returned: ArrowDownLeft, cancelled: XCircle }
  const k = `${period}-${city}-${cFrom}-${cTo}` // перезапуск анимаций при смене фильтров

  return (
    <div className="flex flex-col gap-4 sm:gap-5 pb-2">
      {/* заголовок как в референсе: приветствие, крупное название, дата */}
      <div className="flex flex-wrap items-end justify-between gap-3 rise">
        <div className="min-w-0">
          <div className="text-sm text-muted">С возвращением, {me?.name.split(' ')[0]}.</div>
          <h1 className="text-[clamp(30px,5vw,44px)] leading-[1.05] font-semibold tracking-[-0.025em] mt-1">Сводка</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted capitalize hidden sm:block">{new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
          {(fin || ops) && <Button size="sm" variant="soft" onClick={() => exportCsv(bs.filter(b => b.start >= from && b.start < to).sort((a, b) => a.start - b.start), cName, pName, from, to)}><Download className="size-4" />CSV</Button>}
        </div>
      </div>

      {/* фильтры */}
      <div className="flex flex-wrap items-center gap-2 rise" style={{ ['--i' as any]: 1 }}>
        <Seg value={period} onChange={setPeriod} options={PERIODS.map(p => ({ value: p.id, label: p.label }))} />
        <Seg value={city} onChange={setCity} options={[{ value: 'all', label: 'Все точки' }, { value: 'almaty', label: 'Алматы' }, { value: 'astana', label: 'Астана' }]} />
        {period === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={cFrom} max={cTo} onChange={e => setCFrom(e.target.value)} className="field h-10 py-0 w-auto" aria-label="С" />
            <span className="text-muted">-</span>
            <input type="date" value={cTo} min={cFrom} onChange={e => setCTo(e.target.value)} className="field h-10 py-0 w-auto" aria-label="По" />
          </div>
        )}
        <span className="text-xs text-faint flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ok breathe" />{cmp ? 'сравнение с прошлым периодом' : 'история короче периода'}</span>
      </div>

      {/* ряд 1: выручка-герой + денежный поток */}
      <div key={'r1' + k} className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
        <section className="glass rise lift p-5 flex flex-col gap-4 min-w-0" style={{ ['--i' as any]: 2 }}>
          <div className="flex items-center justify-between text-sm text-muted"><span>{fin ? `Выручка ${label}` : `Брони ${label}`}</span><Wallet className="size-4" /></div>
          <div className="text-[clamp(32px,5vw,44px)] leading-none font-semibold tnum tracking-[-0.02em]">{fin ? <CountUp v={cur.revenue} fmt={n => money(Math.round(n))} /> : <CountUp v={cur.count} />}</div>
          <div className="flex items-center gap-2 text-sm text-muted flex-wrap">{cmp ? <Chip v={pct(fin ? cur.revenue : cur.count, fin ? prev.revenue : prev.count)} /> : <Chip v={null} />}<span>{cmp ? 'к прошлому периоду' : 'нет данных для сравнения'}</span></div>
          <Spark vals={(period === 'today' ? chart.c : cur.series).map(x => (fin ? x.v : x.v))} />
          <button onClick={() => go('bookings')} className="press mt-auto flex items-center gap-3 rounded-2xl p-2.5 text-left soft hover:bg-surface-2">
            <span className="size-10 grid place-items-center rounded-xl bg-surface-3 shrink-0"><Receipt className="size-[18px]" /></span>
            <span className="flex-1 min-w-0"><span className="block text-sm font-medium">Средний чек {money(cur.avg)}</span><span className="block text-xs text-muted">{num(cur.count)} броней · {Math.round(cur.util * 100)}% загрузка</span></span>
            <span className="size-10 grid place-items-center rounded-full shrink-0" style={{ boxShadow: 'var(--rim)' }}><ArrowUpRight className="size-4" /></span>
          </button>
        </section>
        <section className="glass rise lift p-5 flex flex-col gap-4 min-w-0" style={{ ['--i' as any]: 3 }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold text-lg">Денежный поток</div>
            <Seg size="sm" value={period} onChange={setPeriod} options={segPeriod.map(p => ({ value: p.id, label: p.label }))} />
          </div>
          {fin ? (<>
            <div className="grid grid-cols-3 gap-3">
              <div className="min-w-0"><div className="text-xs text-muted flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-fg" />Оплачено</div><div className="text-lg sm:text-xl font-semibold tnum truncate"><CountUp v={money$.paid} fmt={n => `${compact(n)} ₸`} /></div></div>
              <div className="min-w-0"><div className="text-xs text-muted flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-faint" />Ожидаем</div><div className="text-lg sm:text-xl font-semibold tnum truncate"><CountUp v={money$.due} fmt={n => `${compact(n)} ₸`} /></div></div>
              <div className="min-w-0 text-right"><div className="text-xs text-muted">Скидками отдали</div><div className="text-lg sm:text-xl font-semibold tnum text-ok truncate">{compact(bs.filter(b => b.status !== 'cancelled' && b.start >= from && b.start < to).reduce((s, b) => s + b.discount, 0))} ₸</div></div>
            </div>
            <RevenueArea key={k} cur={chart.c} prev={cmp || period === 'today' ? chart.p : []} bucket={period === 'today' ? DAY : bucket} />
          </>) : <Empty text="Финансы видны ролям с правом «Финансы»" />}
        </section>
      </div>

      {/* ряд 2: последние брони + цели */}
      <div key={'r2' + k} className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4">
        <Card i={4} title="Последние брони" action={<button onClick={() => go('bookings')} className="text-sm text-muted hover:text-fg flex items-center gap-1 shrink-0">Все <ArrowRight className="size-4" /></button>}>
          <div className="flex flex-col -mx-1.5 row-in">
            {recent.map((b, ri) => { const I = ICON[b.status]; return (
              <button style={{ ['--i' as any]: ri }} key={b.id} onClick={() => go('bookings', b.id)} className="flex items-center gap-3 px-1.5 py-2.5 rounded-xl hover:bg-surface-2 text-left border-b border-line/70 last:border-0">
                <span className="size-10 grid place-items-center rounded-xl shrink-0" style={{ background: 'var(--soft)', boxShadow: 'var(--rim)', color: STATUS_COLOR[b.status] }}><I className="size-[18px]" /></span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{cName(b.customerId)} · {b.code}</span><span className="block text-xs text-muted truncate">{STATUS_LABEL[b.status]} · {relTime(b.createdAt)}</span></span>
                <span className={cx('tnum text-sm font-semibold shrink-0', b.paid >= b.total ? 'text-ok' : '')}>{b.paid >= b.total ? '+' : ''}{money(b.total)}</span>
              </button>
            ) })}
          </div>
        </Card>
        <Card i={5} title="Цели месяца" action={<span className="text-sm text-muted shrink-0">{goals.length} активных</span>}>
          <div className="flex flex-col gap-4">
            {goals.map((g, gi) => { const p = Math.min(1, g.cur / g.goal); return (
              <div key={g.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-3"><span className="size-9 grid place-items-center rounded-full shrink-0" style={{ boxShadow: 'var(--rim)' }}><g.icon className="size-4" /></span><span className="flex-1 text-sm font-medium">{g.label}</span><span className="text-sm tnum text-muted">{Math.round(p * 100)}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-3/70 overflow-hidden"><div className="grow h-full rounded-full" style={{ width: `${Math.max(2, p * 100)}%`, background: p >= 1 ? 'var(--color-ok)' : 'var(--thumb)', ['--i' as any]: gi }} /></div>
                <div className="flex justify-between text-xs"><span className="tnum font-medium">{g.fmt(g.cur)}</span><span className="text-muted tnum">из {g.fmt(g.goal)}</span></div>
              </div>
            ) })}
          </div>
        </Card>
      </div>

      {/* ряд 3: конвейер броней + сегодня */}
      <div key={'r3' + k} className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4">
        <Card i={6} title="Брони по этапам" sub={`${pipeTotal} броней ${label}${fin ? ` · ${compact(pipeline.reduce((s, x) => s + x.sum, 0))} ₸` : ''}`} action={<button onClick={() => go('calendar')} className="text-sm text-muted hover:text-fg flex items-center gap-1 shrink-0">Шахматка <ArrowRight className="size-4" /></button>}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {pipeline.map((x, pi) => (
              <button key={x.k} onClick={() => go('bookings', x.k === 'new' ? 'new' : undefined)} className="press rise text-left rounded-2xl p-3.5 flex flex-col gap-2 min-w-0" style={{ ['--i' as any]: 7 + pi, background: `linear-gradient(160deg, ${STATUS_COLOR[x.k]}2e, transparent 70%), var(--soft)`, boxShadow: `inset 0 0 0 1px ${STATUS_COLOR[x.k]}40` }}>
                <span className="text-sm flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATUS_COLOR[x.k] }} />{STATUS_LABEL[x.k]}</span>
                <span className="text-2xl font-semibold tnum truncate">{fin ? `${compact(x.sum)} ₸` : num(x.n)}</span>
                <span className="text-xs text-muted truncate">{x.n} броней · {pipeTotal ? Math.round((x.n / pipeTotal) * 100) : 0}%</span>
                <span className="h-1 rounded-full mt-1 grow" style={{ background: STATUS_COLOR[x.k], ['--i' as any]: pi }} />
              </button>
            ))}
          </div>
        </Card>
        {(ops || wh) ? (
          <Card i={7} title="Сегодня" sub={`${op.length} осталось сделать`}>
            {op.length ? (
              <div className="flex flex-col -mx-1">
                {(allToday ? op : op.slice(0, 5)).map(({ b, kind, t }) => (
                  <div key={b.id + kind} className={cx('flex items-center gap-3 p-2 rounded-xl border-b border-line/70 last:border-0', kind === 'overdue' && 'bg-bad/[0.08]')}>
                    <button aria-label={kind === 'out' ? 'Выдать' : 'Принять'} disabled={!canAct} onClick={() => act(b, kind === 'out' ? 'issued' : 'returned')}
                      className="press size-6 rounded-md shrink-0 grid place-items-center hover:bg-surface-3" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-line-2)' }}><Check className="size-3.5 opacity-0 hover:opacity-60" /></button>
                    <span className="tnum text-sm w-12 shrink-0 font-medium">{kind === 'overdue' ? '!' : hm(t)}</span>
                    <button onClick={() => go('bookings', b.id)} className="flex-1 min-w-0 text-left">
                      <span className="block text-sm font-medium truncate">{kind === 'out' ? 'Выдать' : kind === 'in' ? 'Принять' : 'Просрочка'} · {cName(b.customerId)}</span>
                      <span className="block text-xs text-muted truncate"><span className={kind === 'overdue' ? 'text-bad' : kind === 'out' ? 'text-accent' : 'text-ok'}>{b.code}</span> · {b.items.length} поз. · {b.city === 'almaty' ? 'Алматы' : 'Астана'}</span>
                    </button>
                  </div>
                ))}
                {op.length > 5 && <button onClick={() => setAllToday(v => !v)} className="text-sm text-accent font-medium p-2 text-left">{allToday ? 'Свернуть' : `Показать ещё ${op.length - 5}`}</button>}
              </div>
            ) : <div className="py-6 flex flex-col items-center gap-2 text-muted text-sm"><Check className="size-6 text-ok" />На сегодня всё сделано</div>}
          </Card>
        ) : <span />}
      </div>

      {/* ряд 4: давно не брали + команда */}
      {(ops || fin) && (
        <div key={'r4' + k} className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
          <Card i={8} title="Давно не брали" sub="Постоянные клиенты: напомните о себе">
            {lapsed.length ? lapsed.map((x, li) => (
              <div key={x.c.id} className="flex items-center gap-3">
                <span className="size-10 grid place-items-center rounded-full text-sm font-semibold shrink-0" style={{ background: AV[li % AV.length], color: '#2a1a0e' }}>{ini(x.c.name)}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{x.c.name}</span><span className="block text-xs text-muted truncate">{Math.round((now - x.t) / DAY)} дн. назад · {x.n} броней</span></span>
                <a href={`tel:${x.c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Позвонить ${x.c.name}`} className="press size-9 grid place-items-center rounded-xl shrink-0 hover:bg-surface-2" style={{ boxShadow: 'var(--rim)' }}><Phone className="size-4" /></a>
              </div>
            )) : <Empty text="Все постоянные клиенты на связи" />}
          </Card>
          <Card i={9} title="Команда сегодня" sub="Что делали сотрудники">
            {team.length ? team.map((e, ti) => (
              <div key={ti} className="flex items-center gap-3 border-b border-line/70 last:border-0 pb-2.5 last:pb-0">
                <span className="size-9 grid place-items-center rounded-full text-xs font-semibold shrink-0" style={{ background: AV[(ti + 1) % AV.length], color: '#2a1a0e' }}>{ini(e.who)}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{e.who}</span><span className="block text-xs text-muted truncate">{e.text}</span></span>
                <span className="text-xs text-faint shrink-0">{relTime(e.at)}</span>
              </div>
            )) : <Empty text="Пока тихо" />}
          </Card>
        </div>
      )}

      {/* метрики периода */}
      <div key={'kpi' + k} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Брони" value={<CountUp v={cur.count} />} delta={<Delta cur={cur.count} prev={prev.count} off={!cmp} />} onClick={ops || wh ? () => go('bookings') : undefined} />
        {fin && <Kpi label="Средний чек" value={<CountUp v={cur.avg} fmt={n => money(Math.round(n))} />} delta={<Delta cur={cur.avg} prev={prev.avg} off={!cmp} />} />}
        <Kpi label="Загрузка парка" value={`${Math.round(cur.util * 100)}%`} delta={<Delta cur={cur.util} prev={prev.util} pp off={!cmp} />} hint={`${us.length} ед.`} onClick={() => go('calendar')} />
        {(ops || fin) && <Kpi label="Новые клиенты" value={<CountUp v={cur.newClients} />} delta={<Delta cur={cur.newClients} prev={prev.newClients} off={!cmp} />} onClick={can('customers') ? () => go('customers') : undefined} />}
        {can('leads') && <Kpi label="Конверсия заявок" value={cur.conv === null ? '-' : `${Math.round(cur.conv * 100)}%`} delta={cur.conv !== null && prev.conv !== null ? <Delta cur={cur.conv} prev={prev.conv} pp off={!cmp} /> : undefined} hint={`${cur.leadsN} заявок`} onClick={() => go('leads')} />}
        {(ops || wh) && <Kpi label="Просрочки возвратов" value={ops$.overdue.length} icon={ops$.overdue.length ? <AlertTriangle className="size-3.5 text-bad" /> : undefined} hint="сейчас" onClick={() => go('bookings', 'overdue')} />}
        {can('customers') && <Kpi label="Ждут верификации" value={ops$.verif.length} icon={ops$.verif.length ? <ShieldCheck className="size-3.5 text-warn" /> : undefined} hint="профили" onClick={() => go('customers')} />}
        {fin && <Kpi label="Ждём оплату" value={`${compact(ops$.unpaid.reduce((s, b) => s + b.total - b.paid, 0))} ₸`} hint={`${ops$.unpaid.length} броней`} onClick={() => go('bookings')} />}
      </div>

      {/* требует внимания */}
      {attention.length > 0 && (
        <Card i={10} title="Требует внимания">
          <div className="grid sm:grid-cols-2 gap-1.5 -mx-1">
            {attention.map(a => (
              <button key={a.text} onClick={a.on} className="press flex items-center gap-3 p-2 rounded-xl hover:bg-surface-2 text-left min-w-0">
                <span className={cx('size-9 grid place-items-center rounded-xl bg-surface-2 shrink-0', a.tone)}>{a.icon}</span>
                <span className="flex-1 min-w-0 text-sm truncate">{a.text}</span>
                <span className="tnum font-semibold">{a.n}</span><ChevronRight className="size-4 text-faint shrink-0" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* аналитика */}
      <div key={'an' + k} className="grid lg:grid-cols-2 gap-4">
        <Card i={11} title={topBy === 'rev' ? 'Топ-10 по выручке' : 'Топ-10 по дням в аренде'} sub={label}
          action={fin ? <div className="flex p-0.5 rounded-lg bg-surface-2 text-xs shrink-0">{(['rev', 'days'] as const).map(t => <button key={t} onClick={() => setTopBy(t)} className={cx('h-7 px-2.5 rounded-md', topBy === t ? 'pill-on' : 'text-muted')}>{t === 'rev' ? '₸' : 'сутки'}</button>)}</div> : undefined}>
          <HBars rows={fin ? topRows : [...cur.byProduct.entries()].sort((a, b) => b[1].days - a[1].days).slice(0, 10).map(([id, v]) => ({ id, label: pName(id), v: v.days }))}
            fmt={fin && topBy === 'rev' ? (n => `${compact(n)} ₸`) : (n => `${Math.round(n)} сут`)} onClick={id => go('products', id)} />
        </Card>
        <div className="flex flex-col gap-4">
          {(ops || wh) && <Card i={12} title="Брони по статусам" sub={`начало аренды ${label}`}><StatusBar by={cur.byStatus} /></Card>}
          {fin && <Card i={13} title="Выручка по категориям" sub={label}><HBars rows={catRows} fmt={n => `${compact(n)} ₸`} /></Card>}
        </div>
      </div>
      <div key={'an2' + k} className="grid lg:grid-cols-3 gap-4">
        <Card i={14} title="Когда забирают технику" sub={`выдачи по дням недели и времени, ${label}`} className="lg:col-span-2"><Heatmap m={cur.heat} /></Card>
        {(ops || fin) && <Card i={15} title="Воронка броней" sub={`создано → подтверждено → выдано, ${label}`}><Funnel f={cur.funnel} /></Card>}
      </div>

      {(fin || can('pricing.edit')) && (
        <Card i={16} title="Техника простаивает" sub={`самая низкая загрузка ${label}: кандидаты на скидку или акцию`} action={<TrendingDown className="size-4 text-muted shrink-0" />}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {idle.map(({ p, util }) => (
              <button key={p.id} onClick={() => go('products', p.id)} className="press flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-left min-w-0">
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{p.name}</span>
                  <span className="block text-xs text-muted">{money(p.price)}/сут · {unitsPerProduct.get(p.id)} ед.</span></span>
                <span className="text-right shrink-0"><span className="block tnum font-semibold">{Math.round(util * 100)}%</span><span className="block text-xs text-faint">загрузка</span></span>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted">Совет: попробуйте −15% на 2 недели или включите эти позиции в готовые комплекты «Что снимаем?».</div>
        </Card>
      )}
      {!fin && !ops && !wh && <Badge>Для вашей роли данных на дашборде нет</Badge>}
    </div>
  )
}
