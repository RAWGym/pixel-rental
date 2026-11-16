import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Sheet, Button, cx, haptic } from '../ui/kit'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/store'
import { MONTHS_NOM, daysWord, dFull, hm, plural } from '../lib/format'
import { rentalDays, tierFor, nextTier, DAY, HOUR } from '../lib/pricing'

const sod = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export function DatePickerSheet({ open, onClose, busyDays }: { open: boolean; onClose: () => void; busyDays?: (dayStart: number) => 'free' | 'low' | 'busy' }) {
  const { range, setRange, city, settings } = useStore(useShallow(s => ({ range: s.range, setRange: s.setRange, city: s.city, settings: s.settings })))
  const point = settings.points[city]
  const [s, setS] = useState(sod(range.start))
  const [e, setE] = useState<number | null>(sod(range.end))
  const [sh, setSh] = useState(new Date(range.start).getHours())
  const [eh, setEh] = useState(new Date(range.end).getHours())
  const [month, setMonth] = useState(() => { const d = new Date(range.start); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() })
  const [dir, setDir] = useState(1)
  useEffect(() => { if (open) { setS(sod(range.start)); setE(sod(range.end)); setSh(new Date(range.start).getHours()); setEh(new Date(range.end).getHours()) } }, [open])

  const hours = useMemo(() => { const a: number[] = []; for (let h = point.open; h < (point.close === 24 ? 24 : point.close + 1); h++) a.push(h); return a }, [point])
  const clampH = (h: number) => hours.includes(h) ? h : hours[0]
  const today = sod(Date.now())

  const grid = useMemo(() => {
    const d = new Date(month)
    const first = (d.getDay() + 6) % 7
    const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const cells: (number | null)[] = Array(first).fill(null)
    for (let i = 1; i <= daysIn; i++) cells.push(new Date(d.getFullYear(), d.getMonth(), i).getTime())
    return cells
  }, [month])

  const pick = (t: number) => {
    haptic()
    if (e !== null || t < s) { setS(t); setE(null) } else if (t === s) { setE(t + DAY) } else setE(t)
  }
  const startTs = s + clampH(sh) * HOUR
  const endTs = (e ?? s + DAY) + clampH(eh) * HOUR
  const valid = endTs > startTs && startTs > Date.now() - HOUR
  const days = rentalDays(startTs, endTs)
  const tier = tierFor(days, settings), nt = nextTier(days, settings)

  const presets = [
    { label: 'Завтра', fn: () => { setS(today + DAY); setE(today + 2 * DAY); setSh(clampH(10)); setEh(clampH(10)) } },
    { label: 'Выходные', fn: () => { const d = new Date(today); const fri = today + ((5 - d.getDay() + 7) % 7 || 7) * DAY; setS(fri); setE(fri + 3 * DAY); setSh(clampH(18)); setEh(clampH(12)) } },
    { label: '3 суток', fn: () => { setS(today + DAY); setE(today + 4 * DAY) } },
    { label: 'Неделя', fn: () => { setS(today + DAY); setE(today + 8 * DAY) } },
  ]

  const shift = (n: number) => { setDir(n); const d = new Date(month); setMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()) }

  return (
    <Sheet open={open} onClose={onClose} title="Даты аренды"
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold">{valid ? daysWord(days) : 'Выберите даты'}</div>
            <div className="text-xs text-muted truncate">{tier ? `Скидка ${tier.percent}% за срок` : nt ? `Ещё ${nt.days - days} ${plural(nt.days - days, 'сутки', 'суток', 'суток')} до скидки ${nt.percent}%` : ''}</div>
          </div>
          <Button size="lg" disabled={!valid} onClick={() => { setRange({ start: startTs, end: endTs }); onClose() }}>Готово</Button>
        </div>
      }>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 pb-3">
        {presets.map(p => <button key={p.label} onClick={() => { haptic(); p.fn() }} className="h-8 px-3 rounded-full bg-surface-2 text-sm whitespace-nowrap hover:border-accent">{p.label}</button>)}
      </div>
      <div className="flex items-center justify-between py-2">
        <button aria-label="Предыдущий месяц" className="size-9 grid place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-30" disabled={month <= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()} onClick={() => shift(-1)}><ChevronLeft className="size-5" /></button>
        <div className="font-display font-semibold">{MONTHS_NOM[new Date(month).getMonth()]} {new Date(month).getFullYear()}</div>
        <button aria-label="Следующий месяц" className="size-9 grid place-items-center rounded-lg hover:bg-surface-2" onClick={() => shift(1)}><ChevronRight className="size-5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-faint font-semibold mb-1">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={month} custom={dir} initial={{ x: dir * 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 60, opacity: 0 }} transition={{ duration: 0.22 }} className="grid grid-cols-7 gap-y-1">
            {grid.map((t, i) => {
              if (t === null) return <div key={i} />
              const past = t < today
              const end = e ?? s
              const inRange = t > s && t < end
              const isS = t === s, isE = e !== null && t === e
              const load = busyDays && !past ? busyDays(t) : 'free'
              return (
                <div key={i} className={cx('relative h-11', inRange && 'bg-accent/15', isS && e && e > s && 'bg-gradient-to-r from-transparent from-50% to-accent/15 to-50%', isE && 'bg-gradient-to-l from-transparent from-50% to-accent/15 to-50%')}>
                  <button disabled={past} onClick={() => pick(t)}
                    className={cx('relative mx-auto size-11 grid place-items-center rounded-xl tnum text-sm tnum transition-colors',
                      past ? 'text-faint/50' : 'hover:bg-surface-3', (isS || isE) && 'bg-accent text-accent-ink font-semibold hover:bg-accent', t === today && !isS && 'ring-1 ring-line-2')}>
                    {new Date(t).getDate()}
                    {load !== 'free' && !isS && !isE && <span className={cx('absolute bottom-1.5 size-1', load === 'busy' ? 'bg-bad' : 'bg-warn')} />}
                  </button>
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      {busyDays && <div className="flex gap-4 text-xs text-muted mt-2"><span className="flex items-center gap-1.5"><span className="size-1.5 bg-warn" />мало</span><span className="flex items-center gap-1.5"><span className="size-1.5 bg-bad" />занято</span></div>}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {[{ l: 'Забираю', d: s, h: sh, set: setSh }, { l: 'Возвращаю', d: e ?? s + DAY, h: eh, set: setEh }].map(x => (
          <div key={x.l} className="rounded-xl bg-surface-2 p-3">
            <div className="label mb-1">{x.l}</div>
            <div className="font-semibold">{dFull(x.d)}</div>
            <div className="flex items-center gap-1.5 mt-2 text-sm">
              <Clock className="size-4 text-muted" />
              <select aria-label={`Время: ${x.l}`} value={clampH(x.h)} onChange={ev => x.set(Number(ev.target.value))} className="bg-transparent tnum outline-none cursor-pointer">
                {hours.map(h => <option key={h} value={h} className="bg-surface">{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-faint mt-3">{city === 'almaty' ? 'Алматы выдаёт технику круглосуточно.' : `Астана работает ${point.hours}.`} Сутки считаются от времени выдачи.</p>
    </Sheet>
  )
}
