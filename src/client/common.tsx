import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, CalendarDays, Check } from 'lucide-react'
import { useStore } from '../store/store'
import { useNav } from '../store/nav'
import { availMap, availOf } from '../lib/availability'
import { rentalDays } from '../lib/pricing'
import { money, rangeLabel, daysWord, dShort, hm } from '../lib/format'
import type { Product } from '../data/types'
import { Badge, ProductArt, cx, haptic, toast, Stepper } from '../ui/kit'
import { DatePickerSheet } from './DatePicker'

/** Карта наличия по всем товарам — одна на все карточки (кэш в availMap) */
export function useAvailMap() {
  const units = useStore(s => s.units), bookings = useStore(s => s.bookings), city = useStore(s => s.city), range = useStore(s => s.range)
  return availMap(units, bookings, city, range.start, range.end)
}

/** Наличие товара (+ ближайшее окно, если всё занято) — из общей кэшированной карты */
export function useAvail(productId: string) {
  return availOf(useAvailMap(), productId)
}

export function AvailBadge({ productId, compact }: { productId: string; compact?: boolean }) {
  const a = useAvail(productId)
  if (a.total === 0) return <Badge tone="muted">{a.otherFree ? 'В другом городе' : 'Нет в городе'}</Badge>
  if (a.free === 0) return <Badge tone="bad">{a.next && !compact ? `Свободно с ${dShort(a.next)}` : 'Занято на даты'}</Badge>
  if (a.free === 1) return <Badge tone="warn">Остался 1</Badge>
  return <Badge tone="ok">Свободно {a.free}</Badge>
}

export function useCartQty(id: string) { return useStore(s => s.cart.find(c => c.productId === id)?.qty ?? 0) }

/* Короткая строка наличия для карточки: точка + текст, без ярких плашек */
export function AvailLine({ productId }: { productId: string }) {
  const a = useAvail(productId)
  const [tone, text] = a.total === 0 ? ['bg-faint', a.otherFree ? 'В другом городе' : 'Нет в городе']
    : a.free === 0 ? ['bg-bad', a.next ? `Занято до ${dShort(a.next)}` : 'Занято']
    : a.free === 1 ? ['bg-warn', 'Остался 1'] : ['bg-ok', 'В наличии']
  return <div className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap"><span className={cx('size-1.5 rounded-full shrink-0', tone)} /><span className="truncate">{text}</span></div>
}

export const ProductCard = memo(function ProductCard({ p, lazy }: { p: Product; index?: number; lazy?: boolean }) {
  const go = useNav(s => s.go)
  const add = useStore(s => s.addToCart), setQty = useStore(s => s.setQty)
  const qty = useCartQty(p.id)
  const a = useAvail(p.id)
  const canAdd = a.free > qty
  const open = () => go('product', { id: p.id })
  // только главное: фото, название, цена за сутки, наличие
  return (
    // content-visibility — только в длинной сетке каталога: в горизонтальных рядах некоторые браузеры не дорисовывают карточки
    <div className={cx(lazy && 'cv-card', 'card-lift group flex flex-col w-full min-w-0 bg-surface rounded-2xl overflow-hidden')}>
      <button onClick={open} className="text-left" aria-label={p.name}>
        <ProductArt p={p} className="aspect-square w-full" />
      </button>
      <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
        <button onClick={open} className="text-left min-w-0">
          <div className="text-sm font-medium leading-[18px] line-clamp-2 h-9">{p.name}</div>
        </button>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-base font-semibold tnum whitespace-nowrap">{money(p.price)}<span className="text-xs font-normal text-faint"> /сут</span></div>
            <div className="mt-0.5"><AvailLine productId={p.id} /></div>
          </div>
          {qty > 0 ? (
            <Stepper size="sm" value={qty} max={a.free} onChange={n => setQty(p.id, n)} />
          ) : (
            <button disabled={!canAdd} aria-label="Добавить в корзину"
              onClick={() => { add(p.id); haptic(); toast(`${p.name}: в корзине`) }}
              className="press size-9 shrink-0 grid place-items-center rounded-xl bg-surface-3 text-fg hover:bg-accent hover:text-accent-ink disabled:opacity-40">
              <Plus className="size-[18px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export function DateBar({ className = '' }: { className?: string }) {
  const range = useStore(s => s.range)
  const [open, setOpen] = useState(false)
  const days = rentalDays(range.start, range.end)
  return (
    <>
      <motion.button whileTap={{ scale: 0.98 }} onClick={() => setOpen(true)}
        className={cx('flex items-center gap-3 h-13 pl-3 pr-4 rounded-2xl bg-surface-2 transition-colors text-left', className)}>
        <span className="size-8 grid place-items-center rounded-xl bg-surface-3 text-fg/80"><CalendarDays className="size-4" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm truncate">{rangeLabel(range.start, range.end)} · {hm(range.start)}</span>
          <span className="block text-xs text-muted">{daysWord(days)}</span>
        </span>
        <span className="text-xs text-muted font-medium">Изменить</span>
      </motion.button>
      <DatePickerSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {action}
    </div>
  )
}

export function AddedCheck() { return <Check className="size-4" /> }
