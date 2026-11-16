import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { Home as HomeI, LayoutGrid, ShoppingBag, CalendarCheck, User, Search, ChevronDown, Heart } from 'lucide-react'
import { useStore } from '../store/store'
import { useNav, RouteCtx, type Route, type RouteName } from '../store/nav'
import { Logo, cx, Toasts, haptic } from '../ui/kit'
import { isNative } from '../lib/native'
import { placeLine } from '../lib/format'
import { Home } from './Home'
import { Catalog } from './Catalog'
import { ProductScreen } from './Product'
import { CartScreen } from './Cart'
import { Checkout, Success } from './Checkout'
import { BookingsScreen, BookingDetail } from './Bookings'
import { ProfileScreen, Favorites, KitBuilder, Contacts, Terms } from './Profile'
import { AuthScreen, VerifyScreen } from './Auth'
import { SceneScreen, CompareScreen, CompareBar, Onboarding } from './Extras'
import { PullToRefresh, UpdateBanner } from './Refresh'

const SCREENS: Record<RouteName, () => JSX.Element | null> = {
  home: Home, catalog: Catalog, product: ProductScreen, search: Catalog, cart: CartScreen, checkout: Checkout, success: Success,
  bookings: BookingsScreen, booking: BookingDetail, profile: ProfileScreen, favorites: Favorites, kit: KitBuilder, contacts: Contacts, terms: Terms, auth: AuthScreen, verify: VerifyScreen, scene: SceneScreen, compare: CompareScreen,
}
const TABS: { name: RouteName; label: string; icon: any }[] = [
  { name: 'home', label: 'Главная', icon: HomeI }, { name: 'catalog', label: 'Каталог', icon: LayoutGrid }, { name: 'cart', label: 'Корзина', icon: ShoppingBag },
  { name: 'bookings', label: 'Брони', icon: CalendarCheck }, { name: 'profile', label: 'Профиль', icon: User },
]
const SITE_NAV: { label: string; go: () => void; match: (cur: RouteName, active: RouteName) => boolean }[] = [
  { label: 'Каталог', go: () => useNav.getState().tab('catalog'), match: (c, a) => a === 'catalog' && c !== 'kit' },
  { label: 'Комплекты', go: () => useNav.getState().go('kit'), match: c => c === 'kit' },
  { label: 'Контакты', go: () => useNav.getState().go('contacts'), match: c => c === 'contacts' },
  { label: 'Корзина', go: () => useNav.getState().tab('cart'), match: (c, a) => a === 'cart' },
  { label: 'Профиль', go: () => useNav.getState().tab('profile'), match: (c, a) => a === 'profile' && c !== 'contacts' },
]

/** Футер сайта (≥1024): точки выдачи и ссылки */
function SiteFooter() {
  const points = useStore(s => s.settings.points)
  const go = useNav(s => s.go)
  return (
    <footer className="hidden desk:block mt-10 bg-surface">
      <div className="site-wrap py-10 grid grid-cols-4 gap-8 text-sm">
        <div className="flex flex-col gap-3"><Logo className="h-8 w-auto self-start" /><p className="text-muted">Прокат фото- и видеотехники в Алматы и Астане.</p></div>
        {(['almaty', 'astana'] as const).map(c => (
          <div key={c} className="flex flex-col gap-1.5">
            <div className="font-semibold">{c === 'almaty' ? 'Алматы' : 'Астана'}</div>
            <div className="text-muted">{placeLine(points[c])}</div>
            <div className="text-muted">{points[c].hours}</div>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 items-start">
          <div className="font-semibold">Клиентам</div>
          <button className="text-muted hover:text-fg" onClick={() => go('terms')}>Условия аренды</button>
          <button className="text-muted hover:text-fg" onClick={() => go('contacts')}>Как добраться</button>
          <button className="text-muted hover:text-fg" onClick={() => go('kit')}>Собрать комплект</button>
        </div>
      </div>
    </footer>
  )
}

const ROOT_OF: Partial<Record<RouteName, RouteName>> = { product: 'catalog', checkout: 'cart', success: 'cart', booking: 'bookings', favorites: 'profile', kit: 'home', contacts: 'profile', terms: 'profile', search: 'catalog', auth: 'profile', verify: 'profile', scene: 'home', compare: 'catalog' }

function CartCount() {
  const n = useStore(s => s.cart.reduce((a, c) => a + c.qty, 0))
  const ctl = useAnimationControls()
  const prev = useRef(n)
  useEffect(() => { if (n > prev.current) ctl.start({ scale: [1, 1.25, 1], transition: { duration: 0.3, ease: 'easeOut' } }); prev.current = n }, [n])
  if (!n) return null
  return <motion.span animate={ctl} className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold tnum">{n}</motion.span>
}

function Splash({ done }: { done: () => void }) {
  useEffect(() => { const t = setTimeout(done, 1250); return () => clearTimeout(t) }, [])
  const cols = 24, rows = 3
  return (
    <motion.div className="fixed inset-0 z-[100] bg-bg grid place-items-center" exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <div className="relative w-64 max-w-[70vw]">
        <Logo className="w-full h-auto block" />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: cols * rows }, (_, i) => (
            <motion.span key={i} className="bg-bg" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.05 + ((i * 7919) % 97) / 97 * 0.6, duration: 0.05 }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

/** Корень вкладки: живёт в памяти, пока приложение открыто (мгновенное переключение, прокрутка сохраняется) */
const TabRoot = memo(function TabRoot({ r, on }: { r: Route; on: boolean }) {
  const S = SCREENS[r.name]
  return (
    // скрытая вкладка: content-visibility:hidden сохраняет её отрисовку — показ обратно почти бесплатный
    <div className={on ? 'tab-root' : 'tab-hidden'} aria-hidden={!on || undefined}>
      <RouteCtx.Provider value={r}><S /></RouteCtx.Provider>
    </div>
  )
})

/** Экран поверх вкладки (товар, оформление, бронь): свой скролл, выезжает справа */
const Layer = memo(function Layer({ r, cls }: { r: Route; cls: string }) {
  const S = SCREENS[r.name]
  return (
    <div className={cx('layer', cls)}>
      <div className="site-wrap pt-5 pb-[calc(104px+env(safe-area-inset-bottom,0px))] desk:pb-10">
        <RouteCtx.Provider value={r}><S /></RouteCtx.Provider>
      </div>
      <SiteFooter />
    </div>
  )
})

export function ClientApp() {
  const stack = useNav(s => s.stack), kind = useNav(s => s.kind)
  const tab = useNav(s => s.tab)
  const city = useStore(s => s.city), setCity = useStore(s => s.setCity)
  const [splash, setSplash] = useState(() => { if (isNative()) return false; try { return !sessionStorage.getItem('px-splash') } catch { return false } })
  const root = stack[0]
  const top = stack.length > 1 ? stack[stack.length - 1] : null
  const active = ROOT_OF[root.name] ?? root.name

  // вкладки, которые уже открывали, остаются смонтированными; переход с параметрами (категория, сортировка) — пересоздаёт вкладку
  const [roots, setRoots] = useState<Route[]>([root])
  let mounted = roots
  const ex = roots.find(r => r.name === root.name)
  if (!ex || (ex.key !== root.key && root.params)) { mounted = [...roots.filter(r => r.name !== root.name), root]; setRoots(mounted) }

  // каталог и кит монтируем заранее, в простое — первое открытие вкладки тоже мгновенное
  useEffect(() => {
    const ric: (f: () => void) => any = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200))
    const t = setTimeout(() => ric(() => setRoots(rs => {
      let out = rs
      for (const name of ['catalog', 'cart'] as RouteName[]) if (!out.some(r => r.name === name)) out = [...out, { name, key: -1 - out.length }]
      return out
    })), 1500)
    return () => clearTimeout(t)
  }, [])

  // прокрутка окна — отдельно для каждой вкладки
  const scrolls = useRef(new Map<string, number>())
  const lastRoot = useRef(root.name)
  useLayoutEffect(() => {
    if (lastRoot.current === root.name && !root.params) return
    lastRoot.current = root.name
    window.scrollTo(0, root.params ? 0 : scrolls.current.get(root.name) ?? 0)
  }, [root.key])
  useEffect(() => {
    const f = () => { if (useNav.getState().stack.length === 1) scrolls.current.set(lastRoot.current, window.scrollY) }
    window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f)
  }, [])

  // анимации слоёв: при push старый экран остаётся под новым, при pop уходящий уезжает вправо
  const prevTop = useRef<Route | null>(top)
  const [ghost, setGhost] = useState<{ r: Route; out: boolean } | null>(null)
  useLayoutEffect(() => {
    const prev = prevTop.current
    prevTop.current = top
    if (!prev || prev.key === top?.key || (kind !== 'pop' && kind !== 'push')) { setGhost(null); return }
    setGhost({ r: prev, out: kind === 'pop' })
    const t = setTimeout(() => setGhost(null), 260)
    return () => clearTimeout(t)
  }, [top?.key])
  const topCls = kind === 'push' ? 'layer-in' : kind === 'replace' ? 'layer-fade' : ''

  return (
    <div className="min-h-dvh">
      <AnimatePresence>{splash && <Splash done={() => { setSplash(false); try { sessionStorage.setItem('px-splash', '1') } catch { /* noop */ } }} />}</AnimatePresence>
      <header className="sticky top-0 z-50 bg-bg border-b border-line/50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="site-wrap h-14 flex items-center gap-3">
          <button onClick={() => tab('home')} aria-label="На главную" className="shrink-0"><Logo className="hidden min-[380px]:block h-[22px] desk:h-[30px] w-auto" /><Logo className="min-[380px]:hidden h-6 w-auto" sub={false} /></button>
          <button onClick={() => { setCity(city === 'almaty' ? 'astana' : 'almaty'); haptic() }} className="ml-1 h-8 pl-3 pr-2 rounded-full bg-surface-2 text-sm font-medium flex items-center gap-1 text-fg/90 hover:bg-surface-3 transition-colors">
            <AnimatePresence mode="wait" initial={false}><motion.span key={city} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.15 }}>{city === 'almaty' ? 'Алматы' : 'Астана'}</motion.span></AnimatePresence>
            <ChevronDown className="size-3.5 text-muted" />
          </button>
          {/* сайт (≥1024): верхнее меню вместо таббара */}
          <nav className="hidden desk:flex items-center gap-1 ml-6">
            {SITE_NAV.map(t => {
              const on = t.match(top?.name ?? root.name, active)
              return (
                <button key={t.label} onClick={t.go} className={cx('relative h-9 px-3.5 rounded-lg text-sm font-medium transition-colors duration-200', on ? 'text-fg' : 'text-muted hover:text-fg')}>
                  {/* активный пункт: подложка и линия переезжают к нему */}
                  {on && <motion.span layoutId="site-nav" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: 'spring', stiffness: 520, damping: 40 }}><span className="absolute left-3 right-3 -bottom-[9px] h-0.5 rounded-full bg-accent" /></motion.span>}
                  <span className="relative flex items-center gap-1.5">{t.label}{t.label === 'Корзина' && <span className="relative inline-block w-3 h-3"><CartCount /></span>}</span>
                </button>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button aria-label="Поиск" onClick={() => { tab('catalog'); setTimeout(() => document.getElementById('catalog-search')?.focus(), 250) }} className="size-10 grid place-items-center rounded-xl hover:bg-surface-2"><Search className="size-5" /></button>
            <button aria-label="Избранное" onClick={() => useNav.getState().go('favorites')} className="hidden desk:grid size-10 place-items-center rounded-xl hover:bg-surface-2"><Heart className="size-5" /></button>
          </div>
        </div>
      </header>

      <main className="site-wrap pt-4 pb-[calc(72px+env(safe-area-inset-bottom,0px))] desk:pb-10">
        {mounted.map(r => <TabRoot key={r.key} r={r} on={r.name === root.name} />)}
      </main>
      <SiteFooter />
      {ghost && !ghost.out && <Layer key={ghost.r.key} r={ghost.r} cls="" />}
      {top && <Layer key={top.key} r={top} cls={topCls} />}
      {ghost && ghost.out && <Layer key={ghost.r.key} r={ghost.r} cls="layer-out" />}

      <nav className="desk:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg border-t border-line/60 gutter" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="grid grid-cols-5 h-14">
          {TABS.map(t => {
            const on = active === t.name
            return (
              <button key={t.name} onClick={() => { tab(t.name); haptic(5) }} className={cx('relative flex flex-col items-center justify-center gap-0.5 text-[11px] leading-none font-medium transition-colors', on ? 'text-fg' : 'text-faint')}>
                <span className="relative grid place-items-center h-7 w-11">
                  {on && <span className="absolute inset-0 rounded-full bg-surface-3" />}
                  <t.icon className={cx('relative size-[20px]', on && 'text-accent')} strokeWidth={on ? 2 : 1.7} />{t.name === 'cart' && <CartCount />}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
      <CompareBar />
      <PullToRefresh />
      <UpdateBanner />
      <Onboarding />
      <Toasts bottom={170} />
    </div>
  )
}
