import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useNav } from '../store/nav'
import { cx, toast, haptic } from '../ui/kit'
import { isNative } from '../lib/native'

/** сервис-воркер есть только у сайта по http(s); в приложении Expo и при открытии файлом — нет */
const swOk = () => 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !isNative()

/** Обновить данные и проверить новую версию приложения */
export async function refreshApp(): Promise<void> {
  const tasks: Promise<unknown>[] = []
  if (import.meta.env.VITE_SUPABASE_URL) tasks.push(import('../data/supabase').then(m => m.hydrate()))
  if (swOk()) tasks.push(navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {}))
  await Promise.allSettled(tasks)
}

const THRESHOLD = 72

/** Потяните вниз на главной или в каталоге — данные перезагрузятся (свой жест: системный отключён, чтобы интерфейс не «плавал») */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  useEffect(() => {
    const allowed = () => {
      const s = useNav.getState().stack
      return s.length === 1 && (s[0].name === 'home' || s[0].name === 'catalog') && window.scrollY <= 0 && !document.querySelector('[role=dialog]')
    }
    const down = (e: TouchEvent) => { start.current = allowed() && e.touches.length === 1 ? e.touches[0].clientY : null }
    const move = (e: TouchEvent) => {
      if (start.current === null || busy) return
      const d = e.touches[0].clientY - start.current
      if (d <= 0) { setPull(0); return }
      setPull(Math.min(120, d * 0.55)) // сопротивление, как у системного жеста
    }
    const up = async () => {
      if (start.current === null) return
      start.current = null
      setPull(p => {
        if (p >= THRESHOLD && !busy) {
          setBusy(true); haptic(15)
          refreshApp().finally(() => { setBusy(false); setPull(0); toast('Обновлено') })
          return THRESHOLD
        }
        return 0
      })
    }
    addEventListener('touchstart', down, { passive: true })
    addEventListener('touchmove', move, { passive: true })
    addEventListener('touchend', up)
    addEventListener('touchcancel', up)
    return () => { removeEventListener('touchstart', down); removeEventListener('touchmove', move); removeEventListener('touchend', up); removeEventListener('touchcancel', up) }
  }, [busy])
  if (!pull && !busy) return null
  const k = Math.min(1, pull / THRESHOLD)
  return (
    <div className="desk:hidden fixed left-0 right-0 z-40 flex justify-center pointer-events-none" style={{ top: `calc(3.5rem + env(safe-area-inset-top, 0px) + ${Math.max(8, pull - 28)}px)`, transition: busy || !pull ? 'top 200ms' : undefined }}>
      <span className="size-10 grid place-items-center rounded-full bg-surface-3 shadow-lg shadow-black/40" style={{ opacity: Math.max(0.3, k) }}>
        <RefreshCw className={cx('size-5', busy ? 'animate-spin text-accent' : k >= 1 ? 'text-accent' : 'text-muted')} style={busy ? undefined : { transform: `rotate(${k * 270}deg)` }} />
      </span>
    </div>
  )
}

/** Новая версия приложения скачалась — предлагаем перезапуститься */
export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  useEffect(() => {
    if (!swOk()) return
    let reloading = false
    const onCtrl = () => { if (!reloading) { reloading = true; location.reload() } }
    navigator.serviceWorker.addEventListener('controllerchange', onCtrl)
    navigator.serviceWorker.getRegistration().catch(() => undefined).then(reg => {
      if (!reg) return
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w) })
      })
    })
    // проверяем обновление при возврате в приложение
    const vis = () => { if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {}) }
    document.addEventListener('visibilitychange', vis)
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', onCtrl); document.removeEventListener('visibilitychange', vis) }
  }, [])
  if (!waiting) return null
  return (
    <div className="fixed left-0 right-0 z-[85] gutter flex justify-center fade-in" style={{ bottom: 'calc(66px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex items-center gap-3 rounded-2xl bg-surface-3 p-2.5 pl-4 shadow-2xl shadow-black/50">
        <Sparkles className="size-5 text-accent shrink-0" />
        <span className="flex-1 text-sm font-medium">Доступна новая версия</span>
        <button onClick={() => waiting.postMessage('skip-waiting')} className="press h-9 px-4 rounded-xl bg-accent text-accent-ink text-sm font-semibold">Обновить</button>
      </div>
    </div>
  )
}
