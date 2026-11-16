import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { ClientApp } from './client/Shell'
import { useAdminNav } from './admin/adminNav'
import { initDevice } from './lib/device'
// админка (графики, таблицы) — отдельный чанк, грузится только сотрудникам
const AdminApp = lazy(() => import('./admin/Admin').then(m => ({ default: m.AdminApp })))
import { useNav } from './store/nav'
import { useStore } from './store/store'
import { postNative, sheetStack, isNative } from './lib/native'
import { importKitFromHash } from './client/Extras'
import { initI18n } from './i18n'

// Аппаратная кнопка «назад» (Android) из нативной обёртки
;(window as any).__pxBack = () => {
  if (sheetStack.length) { sheetStack[sheetStack.length - 1](); return }
  if (isAdminUrl()) { leaveAdmin(); return }
  const nav = useNav.getState()
  if (nav.stack.length > 1) { nav.back(); return }
  if (nav.stack[0].name !== 'home') { nav.tab('home'); return }
  postNative({ type: 'exit' })
}
// хук для автотестов и отладки (скриншоты, замеры)
;(window as any).__px = { nav: useNav, store: useStore, admin: useAdminNav }
if (isNative()) document.documentElement.classList.add('native')
postNative({ type: 'ready' })
// ссылка на комплект (#kit=…) — кладём его в корзину
importKitFromHash()
window.addEventListener('hashchange', () => { importKitFromHash() })
initDevice()
// анимации смены экранов включаем после первой отрисовки
setTimeout(() => document.documentElement.classList.add('nav-ready'), 1200)
// общая база: если заданы ключи Supabase — подключаем её (код адаптера грузится отдельным чанком), иначе демо-режим
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
  Promise.all([import('./data/supabase'), import('./data/api')]).then(async ([m, a]) => {
    a.setApi(m.SupabaseAdapter)
    m.mirrorStoreWrites()
    import('./data/shopRemote').then(s => s.mirrorShopWrites())
    // ссылка «сбросить пароль» из письма — открываем экран нового пароля
    m.watchClientRecovery(() => useNav.getState().go('auth', { recovery: true }))
    await m.hydrate().catch(e => console.warn('[supabase] hydrate', e))
  })
}
// ярлыки PWA (?tab=catalog) — открываем нужную вкладку
{ const t = new URLSearchParams(location.search).get('tab'); if (t && ['catalog', 'cart', 'bookings', 'profile'].includes(t)) useNav.getState().tab(t as any) }
// сайт: адреса /catalog, /product/<id> и кнопка «Назад» браузера
if (/^https?:$/.test(location.protocol) && !isNative()) import('./lib/history').then(m => { m.openFromPath(); m.bindHistory() })
// PWA: офлайн-кэш, только когда приложение раздаётся с настоящего сайта
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !isNative()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

/** админка открывается по /admin (сайт) или #admin (приложение и старые ссылки) */
function isAdminUrl() { return location.hash === '#admin' || /^\/admin\/?$/.test(location.pathname) }
function leaveAdmin() {
  if (location.hash === '#admin') location.hash = ''
  else { history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate')) }
}
;(window as any).__pxLeaveAdmin = leaveAdmin

function Splash() { return <div className="min-h-dvh grid place-items-center text-muted text-sm">Загружаем…</div> }

function Root() {
  const [admin, setAdmin] = useState(isAdminUrl)
  useEffect(() => {
    const f = () => setAdmin(isAdminUrl())
    addEventListener('hashchange', f); addEventListener('popstate', f)
    return () => { removeEventListener('hashchange', f); removeEventListener('popstate', f) }
  }, [])
  return admin ? <Suspense fallback={<Splash />}><AdminApp /></Suspense> : <ClientApp />
}
// язык интерфейса RU | KZ: слой перевода включается до первой отрисовки
initI18n()
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
