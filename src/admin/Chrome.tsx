import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Search, Bell, Plus, ClipboardList, Users, Package, Inbox, ShieldCheck, AlertTriangle, CornerDownLeft, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/store'
import { useAdminNav, type AdminPage } from './Admin'
import { cx, ProductArt } from '../ui/kit'
import { money, dShort, relTime } from '../lib/format'
import { verificationOf } from '../data/types'

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s\-+()]/g, '')

/* ---------- Поиск по всему: ⌘K / Ctrl+K ---------- */
export function CommandPalette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: { id: AdminPage; label: string }[] }) {
  const { bookings, customers, products } = useStore(useShallow(s => ({ bookings: s.bookings, customers: s.customers, products: s.products })))
  const go = useAdminNav(s => s.go)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => inp.current?.focus(), 30) } }, [open])
  const cName = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers])

  const results = useMemo(() => {
    const n = norm(q)
    type R = { key: string; group: string; title: string; sub?: string; icon: React.ReactNode; run: () => void }
    const out: R[] = []
    const actions: R[] = [
      { key: 'a-b', group: 'Действия', title: 'Новая бронь', icon: <Plus className="size-4" />, run: () => go('bookings', 'create') },
      { key: 'a-c', group: 'Действия', title: 'Новый клиент', icon: <Plus className="size-4" />, run: () => go('customers', 'create') },
      { key: 'a-p', group: 'Действия', title: 'Новый товар', icon: <Plus className="size-4" />, run: () => go('products', 'create') },
      ...pages.map(p => ({ key: 'p-' + p.id, group: 'Разделы', title: p.label, icon: <CornerDownLeft className="size-4" />, run: () => go(p.id) })),
    ]
    if (!n) return actions
    out.push(...actions.filter(a => norm(a.title).includes(n)))
    const bs = bookings.filter(b => norm(b.code).includes(n) || norm(cName.get(b.customerId) ?? '').includes(n)).slice(0, 6)
    out.push(...bs.map(b => ({ key: b.id, group: 'Брони', title: `${b.code} · ${cName.get(b.customerId) ?? ''}`, sub: `${dShort(b.start)} · ${money(b.total)}`, icon: <ClipboardList className="size-4" />, run: () => go('bookings', b.id) })))
    const cs = customers.filter(c => norm(c.name).includes(n) || norm(c.phone).includes(n) || norm(c.iin ?? '').includes(n)).slice(0, 5)
    out.push(...cs.map(c => ({ key: c.id, group: 'Клиенты', title: c.name, sub: c.phone, icon: <Users className="size-4" />, run: () => go('customers', c.id) })))
    const ps = products.filter(p => norm(`${p.brand}${p.name}${p.kind}`).includes(n)).slice(0, 6)
    out.push(...ps.map(p => ({ key: p.id, group: 'Товары', title: p.name, sub: `${money(p.price)}/сут`, icon: <ProductArt p={p} size="sm" className="size-8 rounded-md" />, run: () => go('products', p.id) })))
    return out
  }, [q, bookings, customers, products, cName, pages])

  if (!open) return null
  const run = (k: number) => { const r = results[k]; if (r) { r.run(); onClose() } }
  let last = ''
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-3 pt-[10vh] fade-in" onKeyDown={e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(results.length - 1, x + 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)) }
      if (e.key === 'Enter') run(i)
    }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-label="Поиск" className="pop relative w-full max-w-xl rounded-2xl bg-surface shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[70dvh]">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="size-5 text-muted shrink-0" />
          <input ref={inp} value={q} onChange={e => { setQ(e.target.value); setI(0) }} placeholder="Бронь, клиент, телефон, ИИН, товар…" className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none text-base" />
          <button onClick={onClose} aria-label="Закрыть" className="size-8 grid place-items-center rounded-lg hover:bg-surface-2 text-muted"><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {results.length ? results.map((r, k) => {
            const head = r.group !== last; last = r.group
            return (
              <div key={r.key}>
                {head && <div className="text-xs text-faint px-2 pt-2 pb-1">{r.group}</div>}
                <button onMouseEnter={() => setI(k)} onClick={() => run(k)} className={cx('w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left', i === k && 'bg-surface-2')}>
                  <span className="size-8 grid place-items-center rounded-lg bg-surface-2 text-muted shrink-0 overflow-hidden">{r.icon}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm truncate">{r.title}</span>{r.sub && <span className="block text-xs text-muted truncate">{r.sub}</span>}</span>
                  {i === k && <CornerDownLeft className="size-4 text-faint shrink-0 hidden sm:block" />}
                </button>
              </div>
            )
          }) : <div className="text-sm text-muted text-center py-8">Ничего не нашли</div>}
        </div>
        <div className="hidden sm:flex gap-4 px-4 py-2 border-t border-line text-xs text-faint"><span>↑↓ выбрать</span><span>Enter открыть</span><span>Esc закрыть</span></div>
      </div>
    </div>
  )
}

/* ---------- Колокольчик: новые заявки, верификации, просрочки ---------- */
export function useAlerts() {
  const { leads, customers, bookings } = useStore(useShallow(s => ({ leads: s.leads, customers: s.customers, bookings: s.bookings })))
  const can = useStore(s => s.can)
  return useMemo(() => {
    const now = Date.now()
    type A = { key: string; icon: React.ReactNode; tone: string; title: string; sub: string; at: number; page: AdminPage; focus?: string }
    const out: A[] = []
    if (can('leads')) for (const l of leads.filter(l => l.status === 'new')) out.push({ key: l.id, icon: <Inbox className="size-4" />, tone: 'text-accent', title: `Заявка: ${l.name}`, sub: l.text, at: l.createdAt, page: 'leads' })
    if (can('customers')) for (const c of customers.filter(c => verificationOf(c) === 'pending')) out.push({ key: c.id, icon: <ShieldCheck className="size-4" />, tone: 'text-warn', title: `Проверить документы: ${c.name}`, sub: c.phone, at: c.consentAt ?? c.createdAt, page: 'customers', focus: c.id })
    if (can('bookings.view')) for (const b of bookings.filter(b => b.status === 'issued' && b.end < now)) out.push({ key: b.id, icon: <AlertTriangle className="size-4" />, tone: 'text-bad', title: `Просрочен возврат ${b.code}`, sub: `с ${dShort(b.end)}`, at: b.end, page: 'bookings', focus: b.id })
    return out.sort((a, b) => b.at - a.at)
  }, [leads, customers, bookings, can])
}

export function BellButton() {
  const alerts = useAlerts()
  const go = useAdminNav(s => s.go)
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem('px-admin-seen') || 0) } catch { return 0 } })
  const unseen = alerts.filter(a => a.at > seen).length
  const toggle = () => { setOpen(o => !o); const t = Date.now(); setSeen(t); try { localStorage.setItem('px-admin-seen', String(t)) } catch { /* noop */ } }
  return (
    <div className="relative">
      <button aria-label="Уведомления" onClick={toggle} className={cx('press relative size-10 grid place-items-center rounded-xl text-muted hover:text-fg hover:bg-surface-2', unseen > 0 && 'bell-ring')}>
        <Bell className="size-5" />
        {unseen > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold tnum">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="pop fixed left-3 right-3 sm:left-auto sm:absolute sm:right-0 sm:w-[360px] z-[61] rounded-2xl bg-surface-2 shadow-2xl shadow-black/60 overflow-hidden fade-in" style={{ top: 'calc(60px + env(safe-area-inset-top, 0px))' }}>
            <div className="px-4 py-3 font-semibold text-sm border-b border-line">Уведомления <span className="text-faint font-normal">· {alerts.length}</span></div>
            <div className="max-h-[60dvh] overflow-y-auto p-1.5">
              {alerts.length ? alerts.slice(0, 30).map(a => (
                <button key={a.key + a.page} onClick={() => { go(a.page, a.focus); setOpen(false) }} className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-surface-3 text-left">
                  <span className={cx('size-8 grid place-items-center rounded-lg bg-surface shrink-0', a.tone)}>{a.icon}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm truncate">{a.title}</span><span className="block text-xs text-muted truncate">{a.sub}</span></span>
                  <span className="text-xs text-faint shrink-0">{relTime(a.at)}</span>
                </button>
              )) : <div className="text-sm text-muted text-center py-8">Новых событий нет</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** «+» — быстрые действия */
export function QuickAdd() {
  const go = useAdminNav(s => s.go)
  const can = useStore(s => s.can)
  const [open, setOpen] = useState(false)
  const items = [
    can('bookings.edit') && { label: 'Бронь', icon: ClipboardList, run: () => go('bookings', 'create') },
    can('customers') && { label: 'Клиент', icon: Users, run: () => go('customers', 'create') },
    can('products.edit') && { label: 'Товар', icon: Package, run: () => go('products', 'create') },
  ].filter(Boolean) as { label: string; icon: any; run: () => void }[]
  if (!items.length) return null
  return (
    <div className="relative">
      <button aria-label="Создать" onClick={() => setOpen(o => !o)} className="press size-10 grid place-items-center rounded-xl bg-accent text-accent-ink"><Plus className="size-5" strokeWidth={2.4} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-[61] w-48 rounded-2xl bg-surface-2 shadow-2xl shadow-black/60 p-1.5 fade-in">
            {items.map(it => <button key={it.label} onClick={() => { it.run(); setOpen(false) }} className="w-full flex items-center gap-3 h-10 px-2.5 rounded-xl hover:bg-surface-3 text-sm"><it.icon className="size-4 text-muted" />{it.label}</button>)}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- сегменты со скользящей «таблеткой» (как в шаблоне) ---------- */
export function Seg<T extends string>({ value, options, onChange, size = 'md', className }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed=true]')
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth })
    const ro = new ResizeObserver(() => { const b = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed=true]'); if (b) setThumb({ x: b.offsetLeft, w: b.offsetWidth }) })
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [value, options.length])
  return (
    <div ref={ref} className={cx('seg max-w-full overflow-x-auto scrollbar-none', className)} role="group">
      {thumb && <span className="seg__thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x - 3}px)`, left: 3 }} />}
      {options.map(o => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cx('whitespace-nowrap font-medium rounded-[10px]', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm', o.value === value ? '' : 'text-muted hover:text-fg')}>{o.label}</button>
      ))}
    </div>
  )
}

/* ---------- переключатель темы: круг раскрывается от кнопки ---------- */
export type AdmTheme = 'dark' | 'light'
export function useAdmTheme() {
  const [theme, setTheme] = useState<AdmTheme>(() => { try { return (localStorage.getItem('px-admin-theme') as AdmTheme) || 'dark' } catch { return 'dark' } })
  const toggle = (e?: React.MouseEvent) => {
    const next: AdmTheme = theme === 'dark' ? 'light' : 'dark'
    const apply = () => { setTheme(next); try { localStorage.setItem('px-admin-theme', next) } catch { /* noop */ } }
    const d = document as any
    if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
    const x = e?.clientX ?? innerWidth - 40, y = e?.clientY ?? 40
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const t = d.startViewTransition(() => { flushSync(apply) })
    t.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 450, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {})
  }
  return { theme, toggle }
}
