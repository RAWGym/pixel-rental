import { useState } from 'react'
import { Download, Share, PlusSquare, X, Zap, WifiOff, Smartphone, MoreVertical, Check, Compass } from 'lucide-react'
import { usePwa, install } from '../lib/pwa'
import { isIOS } from '../lib/device'
import { Button, Sheet, Segmented, cx, toast, haptic } from '../ui/kit'

type Platform = 'ios' | 'android'
const isAndroid = () => /android/i.test(navigator.userAgent)
const isSafari = () => /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|yabrowser|opios/i.test(navigator.userAgent)
const DISMISS = 'px-install-dismissed'

/** Иллюстрация: нижняя панель Safari с подсвеченной кнопкой «Поделиться» */
function SafariBar() {
  return (
    <svg viewBox="0 0 320 64" className="w-full h-auto" role="img" aria-label="Кнопка «Поделиться» внизу Safari">
      <rect x="1" y="1" width="318" height="62" rx="14" fill="var(--color-surface-2)" stroke="var(--color-line)" />
      {[40, 100, 220, 280].map(x => <rect key={x} x={x - 9} y="23" width="18" height="18" rx="4" fill="var(--color-line-2)" />)}
      <circle cx="160" cy="32" r="22" fill="color-mix(in oklab, var(--color-accent) 22%, transparent)" />
      <path d="M160 20v17M153 27l7-7 7 7" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M150 33v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
/** Иллюстрация: меню Chrome «⋮» с пунктом «Установить приложение» */
function ChromeMenu() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-auto" role="img" aria-label="Меню Chrome с пунктом «Установить приложение»">
      <rect x="1" y="1" width="318" height="34" rx="10" fill="var(--color-surface-2)" stroke="var(--color-line)" />
      <rect x="12" y="11" width="230" height="14" rx="7" fill="var(--color-line-2)" />
      <circle cx="300" cy="18" r="13" fill="color-mix(in oklab, var(--color-accent) 22%, transparent)" />
      {[12, 18, 24].map(y => <circle key={y} cx="300" cy={y} r="2.2" fill="var(--color-accent)" />)}
      <rect x="150" y="42" width="168" height="76" rx="10" fill="var(--color-surface-3)" stroke="var(--color-line)" />
      <rect x="164" y="54" width="90" height="9" rx="4" fill="var(--color-line-2)" />
      <rect x="156" y="70" width="156" height="24" rx="7" fill="color-mix(in oklab, var(--color-accent) 18%, transparent)" />
      <text x="168" y="86" fontSize="11" fill="var(--color-fg)" fontWeight="600">Установить приложение</text>
      <rect x="164" y="102" width="70" height="9" rx="4" fill="var(--color-line-2)" />
    </svg>
  )
}

function Step({ n, children, icon }: { n: number; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="size-9 grid place-items-center rounded-xl bg-surface-2 shrink-0 relative">{icon}<span className="absolute -top-1.5 -left-1.5 size-5 grid place-items-center rounded-full bg-accent text-accent-ink text-xs font-semibold">{n}</span></span>
      <span className="text-sm pt-1.5">{children}</span>
    </li>
  )
}

/** Шторка «Как установить» — iPhone и Android, платформа определяется сама */
export function InstallGuideSheet({ open, onClose, onDismiss }: { open: boolean; onClose: () => void; onDismiss?: () => void }) {
  const [pf, setPf] = useState<Platform>(() => (isIOS() ? 'ios' : 'android'))
  return (
    <Sheet open={open} onClose={onClose} title="Как установить Pixel"
      footer={<div className="flex flex-col gap-2"><Button block onClick={onClose}>Понятно</Button>{onDismiss && <button className="text-sm text-muted py-1" onClick={() => { onDismiss(); onClose() }}>Больше не показывать</button>}</div>}>
      <div className="flex flex-col gap-5">
        <Segmented value={pf} onChange={setPf} options={[{ value: 'ios', label: 'iPhone / iPad' }, { value: 'android', label: 'Android' }]} />
        {pf === 'ios' ? (
          <>
            <SafariBar />
            <ol className="flex flex-col gap-4">
              <Step n={1} icon={<Compass className="size-[18px] text-info" />}>Откройте <b>pixel-rental.vercel.app</b> в <b>Safari</b>.{isIOS() && !isSafari() && <span className="block text-warn mt-1">Сейчас другой браузер. На iPhone установить можно только из Safari.</span>}</Step>
              <Step n={2} icon={<Share className="size-[18px] text-info" />}>Нажмите <b>«Поделиться»</b> внизу экрана (квадрат со стрелкой вверх).</Step>
              <Step n={3} icon={<PlusSquare className="size-[18px]" />}>Пролистайте список и выберите <b>«На экран „Домой“»</b>.</Step>
              <Step n={4} icon={<Check className="size-[18px] text-ok" />}>Нажмите <b>«Добавить»</b>. Иконка Pixel появится среди приложений.</Step>
            </ol>
          </>
        ) : (
          <>
            <ChromeMenu />
            <ol className="flex flex-col gap-4">
              <Step n={1} icon={<Compass className="size-[18px] text-info" />}>Откройте сайт в <b>Chrome</b>.</Step>
              <Step n={2} icon={<MoreVertical className="size-[18px]" />}>Нажмите меню <b>⋮</b> в правом верхнем углу.</Step>
              <Step n={3} icon={<Download className="size-[18px] text-accent" />}>Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</Step>
              <Step n={4} icon={<Check className="size-[18px] text-ok" />}>Подтвердите, и Pixel откроется как обычное приложение.</Step>
            </ol>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Для профиля: «Установить приложение» — системный запрос или инструкция */
export function useInstall() {
  const s = usePwa()
  const [guide, setGuide] = useState(false)
  const run = async () => {
    const r = await install()
    if (r === 'accepted') { haptic(20); toast('Pixel установлен') }
    else if (r !== 'dismissed') setGuide(true)
  }
  return { available: !s.installed, run, sheet: <InstallGuideSheet open={guide} onClose={() => setGuide(false)} /> }
}

/** Карточка на главной: иконка, три преимущества, «Установить» / «Как установить» */
export function InstallBanner() {
  const s = usePwa()
  const [guide, setGuide] = useState(false)
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem(DISMISS) } catch { return true } })
  const mobile = isIOS() || isAndroid()
  if (s.installed || hidden || (!s.prompt && !mobile)) return null
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS, '1') } catch { /* noop */ } }
  const installNow = async () => { const r = await install(); if (r === 'accepted') { haptic(20); toast('Pixel установлен') } else if (r !== 'dismissed') setGuide(true) }
  const perks = [{ i: Zap, t: 'Открывается мгновенно' }, { i: WifiOff, t: 'Работает без сети' }, { i: Smartphone, t: 'Иконка на экране «Домой»' }]
  return (
    <>
      <section className="fade-in relative rounded-2xl bg-surface p-4 flex flex-col gap-3.5">
        <button aria-label="Скрыть" onClick={dismiss} className="absolute top-2 right-2 size-9 grid place-items-center rounded-xl text-muted hover:bg-surface-2"><X className="size-4" /></button>
        <div className="flex items-center gap-3 pr-8">
          <img src="/icon-192.png" alt="" className="size-12 rounded-[14px] shrink-0 shadow-md shadow-black/40" />
          <div className="min-w-0"><div className="font-semibold">Установите Pixel</div><div className="text-sm text-muted">Приложение на телефоне без App Store</div></div>
        </div>
        <ul className="grid grid-cols-3 gap-2">
          {perks.map(({ i: I, t }) => <li key={t} className="rounded-xl bg-surface-2 px-2 py-2.5 flex flex-col items-center gap-1.5 text-center"><I className="size-[18px] text-accent" /><span className="text-xs text-muted leading-tight">{t}</span></li>)}
        </ul>
        <div className={cx('grid gap-2', s.prompt ? 'grid-cols-2' : 'grid-cols-1')}>
          {s.prompt && <Button onClick={installNow}><Download className="size-4" />Установить</Button>}
          <Button variant="soft" onClick={() => setGuide(true)}>Как установить</Button>
        </div>
      </section>
      <InstallGuideSheet open={guide} onClose={() => setGuide(false)} onDismiss={dismiss} />
    </>
  )
}
