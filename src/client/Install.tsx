import { useState } from 'react'
import { Download, Share, PlusSquare, X } from 'lucide-react'
import { usePwa, canInstall, install } from '../lib/pwa'
import { Button, Sheet, cx, toast, haptic } from '../ui/kit'

/** Шторка с инструкцией для iPhone/iPad: Safari → «Поделиться» → «На экран Домой» */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Установить Pixel на iPhone" footer={<Button block onClick={onClose}>Понятно</Button>}>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3 items-start"><span className="size-9 grid place-items-center rounded-xl bg-surface-2 shrink-0"><Share className="size-[18px] text-info" /></span><span>Откройте сайт в <b>Safari</b> и нажмите <b>«Поделиться»</b> внизу экрана.</span></li>
        <li className="flex gap-3 items-start"><span className="size-9 grid place-items-center rounded-xl bg-surface-2 shrink-0"><PlusSquare className="size-[18px]" /></span><span>Пролистайте и выберите <b>«На экран „Домой“»</b>.</span></li>
        <li className="flex gap-3 items-start"><span className="size-9 grid place-items-center rounded-xl bg-accent text-accent-ink shrink-0 font-bold">P</span><span>Pixel появится среди приложений: открывается на весь экран, корзина и брони сохраняются.</span></li>
      </ol>
    </Sheet>
  )
}

/** Строка «Установить приложение» для профиля; сама решает, показываться ли */
export function useInstall() {
  const s = usePwa()
  const [ios, setIos] = useState(false)
  const run = async () => {
    const r = await install()
    if (r === 'ios') setIos(true)
    else if (r === 'accepted') { haptic(20); toast('Pixel установлен') }
  }
  return { available: canInstall(s), run, sheet: <IosInstallSheet open={ios} onClose={() => setIos(false)} /> }
}

/** Ненавязчивая плашка на главной (один раз, можно закрыть) */
export function InstallBanner() {
  const s = usePwa()
  const { run, sheet } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem('px-install-dismissed') } catch { return true } })
  if (hidden || !canInstall(s)) return sheet
  const close = () => { setHidden(true); try { localStorage.setItem('px-install-dismissed', '1') } catch { /* noop */ } }
  return (
    <>
      <div className={cx('fade-in flex items-center gap-3 rounded-2xl bg-surface p-3 pl-3.5')}>
        <span className="size-10 grid place-items-center rounded-xl bg-accent text-accent-ink shrink-0"><Download className="size-5" /></span>
        <span className="flex-1 min-w-0 text-sm"><span className="block font-medium">Установите Pixel</span><span className="block text-xs text-muted">{s.iosHint ? 'Поделиться → На экран «Домой»' : 'Открывается как приложение, работает без сети'}</span></span>
        <Button size="sm" onClick={run}>{s.iosHint ? 'Как?' : 'Установить'}</Button>
        <button aria-label="Скрыть" onClick={close} className="size-9 grid place-items-center rounded-xl text-muted hover:bg-surface-2 shrink-0"><X className="size-4" /></button>
      </div>
      {sheet}
    </>
  )
}
