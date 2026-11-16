/**
 * Связь экранов приложения с историей браузера (только сайт/PWA):
 * «Назад» в браузере и жест назад закрывают шторку или экран, а не уводят с сайта;
 * карточка товара получает адрес /product/<id> — им можно поделиться и обновить страницу.
 */
import { useNav, TABS, type RouteName } from '../store/nav'
import { useStore } from '../store/store'
import { sheetStack, sheetListeners } from './native'

const isAdmin = () => location.hash === '#admin' || /^\/admin\/?$/.test(location.pathname)
const urlFor = (name: RouteName, params?: Record<string, any>) => (name === 'product' && params?.id ? `/product/${encodeURIComponent(params.id)}` : null)

/** /catalog, /cart, /bookings, /profile, /product/<id> — открыть нужный экран при заходе по ссылке */
export function openFromPath() {
  const m = location.pathname.match(/^\/(catalog|cart|bookings|profile|favorites|contacts|terms)\/?$/)
  if (m) { const n = m[1] as RouteName; if (TABS.includes(n)) useNav.getState().tab(n); else useNav.getState().go(n) ; return }
  const pm = location.pathname.match(/^\/product\/([^/]+)\/?$/)
  if (pm) {
    const id = decodeURIComponent(pm[1])
    const open = () => { if (useStore.getState().products.some(p => p.id === id)) { useNav.getState().go('product', { id }); return true } return false }
    if (!open()) { const off = useStore.subscribe(() => { if (open()) off() }); setTimeout(off, 8000) }
  }
}

export function bindHistory() {
  let depth = useNav.getState().stack.length
  let ignore = 0 // popstate, вызванные нами (history.go)
  let fromPop = false
  // пока наш history.back()/go() не отработал, новые записи откладываем — иначе back() снимет свежую запись
  const queue: (() => void)[] = []
  const act = (f: () => void) => (ignore ? queue.push(f) : f())
  const flush = () => { while (!ignore && queue.length) queue.shift()!() }
  history.replaceState({ pxDepth: depth }, '')
  useNav.subscribe(s => {
    const len = s.stack.length
    if (isAdmin()) { depth = len; return }
    if (fromPop) { fromPop = false; depth = len; return }
    const top = s.stack[len - 1]
    const from = depth, routes = s.stack.slice()
    if (len > from) act(() => { for (let i = from; i < len; i++) history.pushState({ pxDepth: i + 1 }, '', urlFor(routes[i].name, routes[i].params) ?? undefined) })
    else if (len < from) act(() => { ignore++; history.go(len - from) })
    else if (s.kind === 'replace') act(() => history.replaceState({ pxDepth: len }, '', urlFor(top.name, top.params) ?? undefined))
    else if (s.kind === 'tab' && /^\/(product|catalog|cart|bookings|profile)/.test(location.pathname)) act(() => history.replaceState({ pxDepth: len }, '', '/' + location.search))
    depth = len
  })
  // шторка = отдельная запись в истории: «Назад» закрывает её
  let sheets = 0, closingFromPop = false
  sheetListeners.add(open => {
    if (isAdmin()) return
    if (open) { sheets++; const n = sheets, d = depth; act(() => history.pushState({ pxDepth: d, sheet: n }, '')) }
    else { sheets = Math.max(0, sheets - 1); if (closingFromPop) closingFromPop = false; else act(() => { ignore++; history.back() }) }
  })
  addEventListener('popstate', e => {
    if (isAdmin()) return
    if (ignore) { ignore--; flush(); return }
    const want = (e.state as any)?.pxDepth ?? 1
    if (sheets > ((e.state as any)?.sheet ?? 0) && sheetStack.length) { closingFromPop = true; sheetStack[sheetStack.length - 1](); return }
    const nav = useNav.getState()
    if (want < nav.stack.length) { fromPop = true; nav.back() }
  })
}
