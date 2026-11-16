import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutDashboard, CalendarRange, ClipboardList, Package, Inbox, Users, UserCog, Settings as SettingsI, History, LogOut, ArrowLeft, Lock, Search, MoreHorizontal, Plus, UserPlus, Sun, Moon, PackageCheck } from 'lucide-react'
import { useStore } from '../store/store'
import { Logo, cx, Toasts, Button, Badge } from '../ui/kit'
import type { Permission } from '../data/types'
import { Dashboard } from './Dashboard'
import { CommandPalette, BellButton, useAdmTheme } from './Chrome'
import { supabaseConfigured, initStaffAuth, useStaffAuth, staffSignOut } from '../data/supabase'
import { StaffLogin, StaffSetPassword, StaffPending, StaffLoading } from './StaffLogin'
import { BookingsAdmin } from './BookingsAdmin'
import { CalendarAdmin } from './CalendarAdmin'
import { ProductsAdmin } from './ProductsAdmin'
import { LeadsAdmin } from './LeadsAdmin'
import { CustomersAdmin } from './CustomersAdmin'
import { StaffAdmin } from './StaffAdmin'
import { SettingsAdmin, AuditAdmin } from './SettingsAdmin'
import { IssueAdmin } from './IssueAdmin'

import { useAdminNav, type AdminPage } from './adminNav'
export { useAdminNav, type AdminPage }

const NAV: { id: AdminPage; label: string; short?: string; icon: any; perm: Permission }[] = [
  { id: 'dashboard', label: 'Сводка', icon: LayoutDashboard, perm: 'dashboard' },
  { id: 'bookings', label: 'Брони', icon: ClipboardList, perm: 'bookings.view' },
  { id: 'issue', label: 'Выдача', icon: PackageCheck, perm: 'issue' },
  { id: 'calendar', label: 'Шахматка', short: 'Календарь', icon: CalendarRange, perm: 'calendar' },
  { id: 'products', label: 'Товары и наличие', short: 'Товары', icon: Package, perm: 'products.view' },
  { id: 'leads', label: 'Заявки', icon: Inbox, perm: 'leads' },
  { id: 'customers', label: 'Клиенты', icon: Users, perm: 'customers' },
  { id: 'staff', label: 'Сотрудники и роли', short: 'Команда', icon: UserCog, perm: 'staff' },
  { id: 'settings', label: 'Настройки', icon: SettingsI, perm: 'settings' },
  { id: 'audit', label: 'Журнал действий', short: 'Журнал', icon: History, perm: 'staff' },
]

function Login() {
  const { staff, roles, staffLogin } = useStore()
  const [id, setId] = useState(staff[0]?.id)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const submit = (p = pin) => { if (staffLogin(id, p)) return; setErr(true); setPin(''); setTimeout(() => setErr(false), 500) }
  return (
    <div className="adm grid place-items-center gutter py-10" data-theme={(() => { try { return localStorage.getItem('px-admin-theme') || 'dark' } catch { return 'dark' } })()}>
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between"><Logo className="h-7 w-auto" /><Badge tone="accent">ADMIN</Badge></div>
        <div className="glass rise p-6 flex flex-col gap-5">
          <div><div className="font-display text-xl font-semibold flex items-center gap-2"><Lock className="size-5 text-accent" />Вход для сотрудников</div><p className="text-sm text-muted mt-1">Выберите себя и введите PIN. Права зависят от роли.</p></div>
          <div className="flex flex-col gap-1.5">
            {staff.filter(s => s.active).map(s => { const r = roles.find(r => r.id === s.roleId); return (
              <button key={s.id} onClick={() => { setId(s.id); setPin('') }} className={cx('flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors', id === s.id ? 'border-accent bg-accent/[0.07]' : 'border-line hover:border-line-2')}>
                <span className="size-9 grid place-items-center rounded-lg font-semibold text-sm" style={{ background: `${r?.color}22`, color: r?.color }}>{s.name.split(' ').map(w => w[0]).join('')}</span>
                <span className="flex-1"><span className="block font-medium text-sm">{s.name}</span><span className="block text-xs text-muted">{r?.name} · PIN {s.pin}</span></span>
              </button>
            ) })}
          </div>
          <motion.div animate={err ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.35 }} className="flex justify-center gap-3">
            {[0, 1, 2, 3].map(i => <span key={i} className={cx('size-4 transition-colors', i < pin.length ? (err ? 'bg-bad' : 'bg-accent') : 'bg-surface-3')} />)}
          </motion.div>
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? <span key="e" /> : (
              <motion.button whileTap={{ scale: 0.92 }} key={k} onClick={() => { if (k === '⌫') return setPin(pin.slice(0, -1)); const n = (pin + k).slice(0, 4); setPin(n); if (n.length === 4) setTimeout(() => submit(n), 120) }}
                className="h-14 rounded-xl bg-surface-2 hover:bg-surface-3 tnum text-xl font-semibold">{k}</motion.button>
            ))}
          </div>
          <p className="text-xs text-faint text-center">Демо: PIN каждого сотрудника показан под именем</p>
        </div>
        <button onClick={() => { (window as any).__pxLeaveAdmin?.() }} className="text-sm text-muted hover:text-fg flex items-center gap-2 justify-center"><ArrowLeft className="size-4" />В приложение для клиентов</button>
      </div>
      <Toasts bottom={88} />
    </div>
  )
}

export function AdminApp() {
  const { staffId, staff, roles, staffLogout, leads, bookings } = useStore()
  const can = useStore(s => s.can)
  const { page, go } = useAdminNav()
  const [menu, setMenu] = useState(false)
  const [cmd, setCmd] = useState(false)
  const { theme, toggle: toggleTheme } = useAdmTheme()
  // полоса прокрутки не сдвигает центровку при переходе между короткими и длинными разделами
  useEffect(() => { const el = document.documentElement; const prev = el.style.scrollbarGutter; el.style.scrollbarGutter = 'stable'; return () => { el.style.scrollbarGutter = prev } }, [])
  // ⌘K / Ctrl+K — поиск по всему
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(c => !c) } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [])
  const me = staff.find(s => s.id === staffId)
  const role = roles.find(r => r.id === me?.roleId)
  useEffect(() => { const first = NAV.find(n => can(n.perm)); if (me && !can(NAV.find(n => n.id === page)!.perm) && first) go(first.id) }, [staffId])
  const auth = useStaffAuth()
  useEffect(() => { if (supabaseConfigured) initStaffAuth() }, [])
  if (supabaseConfigured) {
    // общая база: вход по email/паролю, роль — из таблицы staff
    if (!auth.ready) return <StaffLoading />
    if (auth.recovery) return <StaffSetPassword />
    // без настоящей сессии Supabase админка закрыта, даже если в браузере остался демо-вход
    if (!auth.email || auth.pendingRole || !me) return auth.email && auth.pendingRole ? <StaffPending /> : <StaffLogin />
  } else if (!me) return <Login />
  const allowed = NAV.filter(n => can(n.perm))
  const badge = (id: AdminPage) => id === 'leads' ? leads.filter(l => l.status === 'new').length : id === 'bookings' ? bookings.filter(b => b.status === 'new').length : id === 'issue' ? bookings.filter(b => b.status === 'issued' && b.end < Date.now()).length : 0
  const Page = { dashboard: Dashboard, bookings: BookingsAdmin, issue: IssueAdmin, calendar: CalendarAdmin, products: ProductsAdmin, leads: LeadsAdmin, customers: CustomersAdmin, staff: StaffAdmin, settings: SettingsAdmin, audit: AuditAdmin }[page]

  const Side = (
    <div className="flex flex-col h-full gap-1 p-3">
      <div className="flex items-center gap-2 px-2 pt-2 pb-5"><Logo className="h-[22px] w-auto" /><Badge tone="accent" className="tnum">ADMIN</Badge></div>
      {allowed.map(n => {
        const on = page === n.id, c = badge(n.id)
        return (
          <button key={n.id} onClick={() => { go(n.id); setMenu(false) }} className={cx('relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors', on ? 'text-fg' : 'text-muted hover:text-fg hover:bg-surface-2')}>
            {on && <span className="absolute inset-0 rounded-lg bg-surface-3" />}
            {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-accent" />}
            <n.icon className={cx('relative size-4', on && 'text-accent')} /><span className="relative flex-1 text-left">{n.label}</span>
            {c > 0 && <span className="relative min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold">{c}</span>}
          </button>
        )
      })}
      <div className="mt-auto rounded-xl bg-surface-2 p-3 flex items-center gap-3">
        <span className="size-9 grid place-items-center rounded-lg font-semibold text-sm shrink-0" style={{ background: `${role?.color}22`, color: role?.color }}>{me.name.split(' ').map(w => w[0]).join('')}</span>
        <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{me.name}</span><span className="block text-xs" style={{ color: role?.color }}>{role?.name}</span></span>
        <button aria-label="Выйти" title="Выйти" onClick={() => (supabaseConfigured ? staffSignOut() : staffLogout())} className="size-8 grid place-items-center rounded-lg hover:bg-surface-3 text-muted"><LogOut className="size-4" /></button>
      </div>
      <button onClick={() => { (window as any).__pxLeaveAdmin?.() }} className="text-xs text-muted hover:text-fg flex items-center gap-1.5 px-3 py-2"><ArrowLeft className="size-3.5" />Клиентское приложение</button>
    </div>
  )

  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('')
  const top = allowed.filter(n => ['dashboard', 'bookings', 'issue', 'calendar', 'products', 'leads', 'customers'].includes(n.id))
  const rest = allowed.filter(n => !top.includes(n))
  const Pill = ({ n }: { n: typeof NAV[number] }) => {
    const on = page === n.id, c = badge(n.id)
    return (
      <button onClick={() => go(n.id)} className={cx('press relative flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors duration-200', on ? 'pill-on' : 'text-muted hover:text-fg')}>
        <n.icon className="size-4" />{n.short ?? n.label}
        {c > 0 && <span className={cx('min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-xs font-semibold tnum', on ? 'bg-[#1c1410] text-[#f7f0e6]' : 'bg-accent text-accent-ink')}>{c > 99 ? '99+' : c}</span>}
      </button>
    )
  }
  let railI = 0
  const RailBtn = ({ label, icon: I, on, onClick, accent }: { label: string; icon: any; on?: boolean; onClick: () => void; accent?: boolean }) => (
    <button style={{ ['--i' as any]: railI++ }} aria-label={label} title={label} onClick={onClick} className={cx('press size-10 grid place-items-center rounded-xl transition-colors', accent ? 'pill-on' : on ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg hover:bg-surface-2')}><I className="size-[18px]" /></button>
  )

  return (
    <div className="adm" data-theme={theme}>
      {/* верхняя панель-«пилюля»: логотип, разделы, поиск, уведомления, профиль */}
      <header className="sticky top-0 z-40 adm-shell enter-top" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
        <div className="glass-bar adm-wrap h-16 px-2.5 flex items-center gap-2 rounded-[22px]">
          <div className="flex items-center gap-2.5 pl-1 pr-2 min-w-0">
            <span className="hidden sm:flex items-center gap-3 min-w-0">
              <Logo className="h-7 w-auto shrink-0" />
              <span className="hidden min-[1600px]:block min-w-0 leading-tight border-l border-line pl-3"><span className="block text-sm font-semibold truncate">Админка</span><span className="block text-xs text-muted truncate">{role?.name}</span></span>
            </span>
            <Logo className="sm:hidden h-[22px] w-auto shrink-0" sub={false} />
          </div>
          <nav className="hidden lg:flex items-center gap-1 mx-auto rounded-2xl p-1 soft">
            {top.map((n, i) => <span key={n.id} className="enter-item" style={{ ['--i' as any]: i }}><Pill n={n} /></span>)}
          </nav>
          <div className="flex items-center gap-1.5 ml-auto lg:ml-0">
            <button aria-label="Поиск" onClick={() => setCmd(true)} className="press size-10 grid place-items-center rounded-xl text-muted hover:text-fg hover:bg-surface-2"><Search className="size-[18px]" /></button>
            <button aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={e => toggleTheme(e)} className="press size-10 grid place-items-center rounded-xl text-muted hover:text-fg hover:bg-surface-2">{theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</button>
            <BellButton />
            <button aria-label="Профиль сотрудника" onClick={() => setMenu(m => !m)} className="press relative size-10 grid place-items-center rounded-full font-semibold text-sm" style={{ background: '#f2c9a0', color: '#2a1a0e' }}>
              {initials}<span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-ok ring-2 ring-[#1e1610]" />
            </button>
          </div>
        </div>
      </header>

      {/* левая «рейка» быстрых действий — на широких экранах */}
      <aside className="hidden xl:flex fixed left-4 top-1/2 -translate-y-1/2 z-30 flex-col gap-1.5 p-1.5 glass-bar rounded-[26px] enter-dock">
        <RailBtn label="Поиск (Ctrl+K)" icon={Search} onClick={() => setCmd(true)} />
        {can('bookings.edit') && <RailBtn label="Новая бронь" icon={Plus} accent onClick={() => go('bookings', 'create')} />}
        {can('customers') && <RailBtn label="Новый клиент" icon={UserPlus} onClick={() => go('customers', 'create')} />}
        <span className="h-px mx-2 my-1 bg-line" />
        {rest.map(n => <RailBtn key={n.id} label={n.label} icon={n.icon} on={page === n.id} onClick={() => go(n.id)} />)}
        <RailBtn label="Клиентское приложение" icon={ArrowLeft} onClick={() => { (window as any).__pxLeaveAdmin?.() }} />
      </aside>

      {/* меню профиля и «Ещё» */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenu(false)} />
          <div className="pop fixed right-3 z-[61] w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-surface-2 shadow-2xl shadow-black/60 p-2 fade-in max-h-[70dvh] overflow-y-auto" style={{ top: 'calc(84px + env(safe-area-inset-top, 0px))' }}>
            <div className="flex items-center gap-3 p-2 pb-3 border-b border-line mb-1">
              <span className="size-10 grid place-items-center rounded-full font-semibold text-sm shrink-0" style={{ background: '#f2c9a0', color: '#2a1a0e' }}>{initials}</span>
              <span className="min-w-0"><span className="block text-sm font-medium truncate">{me.name}</span><span className="block text-xs" style={{ color: role?.color }}>{role?.name}</span></span>
            </div>
            {allowed.map(n => (
              <button key={n.id} onClick={() => { go(n.id); setMenu(false) }} className={cx('w-full flex items-center gap-3 h-10 px-2.5 rounded-xl text-sm', page === n.id ? 'bg-surface-3' : 'hover:bg-surface-3')}>
                <n.icon className="size-4 text-muted" /><span className="flex-1 text-left">{n.label}</span>{badge(n.id) > 0 && <span className="text-xs tnum text-accent">{badge(n.id)}</span>}
              </button>
            ))}
            <div className="h-px bg-line my-1" />
            <button onClick={() => { (window as any).__pxLeaveAdmin?.() }} className="w-full flex items-center gap-3 h-10 px-2.5 rounded-xl text-sm hover:bg-surface-3"><ArrowLeft className="size-4 text-muted" />Клиентское приложение</button>
            <button onClick={() => (supabaseConfigured ? staffSignOut() : staffLogout())} className="w-full flex items-center gap-3 h-10 px-2.5 rounded-xl text-sm hover:bg-surface-3 text-bad"><LogOut className="size-4" />Выйти</button>
          </div>
        </>
      )}

      {/* шапка и раздел — в одном контейнере: одинаковые края на любой ширине */}
      <main className="adm-shell pt-4 pb-32 lg:pb-10 enter-main">
        <div><div className="glass-panel adm-wrap p-4 sm:p-6 lg:p-8">
          <div key={page} className="fade-in"><Page /></div>
        </div></div>
      </main>

      {/* телефон: плавающая нижняя навигация */}
      <nav className="lg:hidden fixed left-3 right-3 z-40 glass-bar rounded-[22px] p-1.5" style={{ bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(4, allowed.length) + 1}, minmax(0, 1fr))` }}>
          {allowed.slice(0, 4).map(n => {
            const on = page === n.id, c = badge(n.id)
            return (
              <button key={n.id} onClick={() => go(n.id)} className={cx('press relative flex flex-col items-center justify-center gap-0.5 h-14 rounded-2xl text-xs font-medium min-w-0 transition-colors duration-200', on ? 'pill-on' : 'text-muted')}>
                <n.icon className="size-[19px]" />
                <span className="truncate max-w-full px-0.5">{n.short ?? n.label}</span>
                {c > 0 && <span className="absolute top-1 right-2 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold tnum">{c > 99 ? '99+' : c}</span>}
              </button>
            )
          })}
          <button onClick={() => setMenu(true)} className={cx('press flex flex-col items-center justify-center gap-0.5 h-14 rounded-2xl text-xs font-medium', !allowed.slice(0, 4).some(n => n.id === page) ? 'pill-on' : 'text-muted')}>
            <MoreHorizontal className="size-[19px]" />Ещё
          </button>
        </div>
      </nav>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} pages={allowed.map(n => ({ id: n.id, label: n.label }))} />
      <Toasts bottom={96} />
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0"><h1 className="text-[clamp(26px,4vw,36px)] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>{sub && <p className="text-sm text-muted mt-1">{sub}</p>}</div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function NoAccess({ what }: { what: string }) {
  return <div className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted flex items-center gap-2"><Lock className="size-3.5" />У вашей роли нет прав: {what}</div>
}
