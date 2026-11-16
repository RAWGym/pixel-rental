import { createContext, useContext } from 'react'
import { create } from 'zustand'

export type RouteName = 'home' | 'catalog' | 'product' | 'search' | 'cart' | 'checkout' | 'success' | 'bookings' | 'booking' | 'profile' | 'favorites' | 'kit' | 'contacts' | 'terms' | 'auth' | 'verify' | 'scene' | 'compare' | 'shop' | 'shopProduct' | 'shopCart' | 'shopDone' | 'shopOrders'
export interface Route { name: RouteName; params?: Record<string, any>; key: number }
export const TABS: RouteName[] = ['home', 'catalog', 'cart', 'bookings', 'profile']

let k = 0
interface Nav {
  stack: Route[]
  dir: 1 | -1
  /** как сменился экран: push — выезд справа, pop — уезд, replace — проявление, tab — переключение вкладки */
  kind: 'push' | 'pop' | 'replace' | 'tab'
  go: (name: RouteName, params?: Record<string, any>) => void
  back: () => void
  tab: (name: RouteName, params?: Record<string, any>) => void
  replace: (name: RouteName, params?: Record<string, any>) => void
}
export const useNav = create<Nav>((set, get) => ({
  stack: [{ name: 'home', key: k++ }],
  dir: 1,
  kind: 'tab',
  go: (name, params) => set(s => ({ stack: [...s.stack, { name, params, key: k++ }], dir: 1, kind: 'push' })),
  back: () => { const s = get().stack; if (s.length > 1) { set({ stack: s.slice(0, -1), dir: -1, kind: 'pop' }) } else set({ stack: [{ name: 'home', key: k++ }], dir: -1, kind: 'tab' }) },
  tab: (name, params) => {
    const s = get().stack
    // повторный тап по открытой вкладке — наверх
    if (s.length === 1 && s[0].name === name && !params) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    set({ stack: [{ name, params, key: k++ }], dir: 1, kind: 'tab' })
  },
  replace: (name, params) => set(s => ({ stack: [...s.stack.slice(0, -1), { name, params, key: k++ }], dir: 1, kind: 'replace' })),
}))
/** Маршрут слоя: у каждой вкладки и экрана свой, даже когда он не сверху */
export const RouteCtx = createContext<Route | null>(null)
export const useRoute = () => {
  const own = useContext(RouteCtx)
  const top = useNav(s => s.stack[s.stack.length - 1])
  return own ?? top
}
