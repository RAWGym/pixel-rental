import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, animate } from 'framer-motion'
import clsx from 'clsx'
import { Camera, Aperture, Lightbulb, Mic, Orbit, BatteryCharging, MemoryStick, Grip, Monitor, Boxes, Package, CircleDot, Triangle, Cable, X, Minus, Plus } from 'lucide-react'
import type { CategoryId, Product } from '../data/types'
import { create } from 'zustand'
import { isNative, postNative, sheetStack } from '../lib/native'
import { photoFor } from '../data/photos'
import { LOGO_W, LOGO_H, PIXEL_X, RENTAL_D, PIXEL_D } from './logoPaths'

export const cx = clsx

/* ---------- Логотип «RENTAL PIXEL» (вектор из brand/logo-source.png) ---------- */
/** sub=false — только «PIXEL» (узкие места, иконки) */
export function Logo({ className = '', sub = true }: { className?: string; sub?: boolean }) {
  return (
    <svg viewBox={sub ? `0 0 ${LOGO_W} ${LOGO_H}` : `${PIXEL_X} 0 ${LOGO_W - PIXEL_X} ${LOGO_H}`} className={className} aria-label="Rental Pixel" role="img">
      <path fill="var(--color-logo, var(--color-accent))" d={sub ? RENTAL_D + PIXEL_D : PIXEL_D} />
    </svg>
  )
}

/* ---------- Иконки категорий ---------- */
function DroneIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth ?? 1.6} strokeLinecap="round" {...props}>
      <rect x="9" y="9" width="6" height="6" rx="1.5" /><path d="M9 9 6 6M15 9l3-3M9 15l-3 3M15 15l3 3" />
      <path d="M2.5 5.5h7M14.5 5.5h7M2.5 18.5h7M14.5 18.5h7" />
    </svg>
  )
}
const CAT_ICON: Record<CategoryId, any> = {
  kits: Package, cameras: Camera, lenses: Aperture, light: Lightbulb, sound: Mic, gimbals: Orbit, batteries: BatteryCharging,
  drones: DroneIcon, memory: MemoryStick, grip: Grip, monitors: Monitor, misc: Boxes, softboxes: Triangle, filters: CircleDot, stands: Triangle, cables: Cable,
}
export function CatIcon({ id, className = 'size-5', strokeWidth = 1.6 }: { id: CategoryId; className?: string; strokeWidth?: number }) {
  const I = CAT_ICON[id] ?? Package
  if (id === 'stands') return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"><path d="M12 3v11M12 14l-6 7M12 14l6 7M12 14v7M9 3h6" /></svg>
  )
  return <I className={className} strokeWidth={strokeWidth} />
}

/* ---------- Фото товара (с сайта pixelrental.kz), иначе — спокойная иконка ---------- */
function PhotoImg({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true) }, [src])
  return <img ref={ref} src={src} alt={alt} draggable={false} decoding="async" loading={eager ? 'eager' : 'lazy'}
    onLoad={() => setLoaded(true)} data-loaded={loaded ? '1' : '0'} className={cx('photo-img absolute inset-0 size-full object-contain', className)} />
}

export function ProductArt({ p, size = 'md', className = '', bare, eager }: { p: Product; size?: 'sm' | 'md' | 'lg'; className?: string; bare?: boolean; eager?: boolean }) {
  const photo = photoFor(p)
  const big = size === 'lg'
  const [full, setFull] = useState(false)
  if (photo && big) {
    // Большое фото: оригинал с сайта, приближенный к рамке обрезки — точно совпадает с миниатюрой-заглушкой
    const [x0, y0, x1, y1, ar] = photo.box
    const fw = ar >= 1 ? 1 : ar, fh = ar >= 1 ? 1 / ar : 1
    const s = 0.84 / Math.max((x1 - x0) * fw, (y1 - y0) * fh)
    const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2
    return (
      <div className={cx('relative overflow-hidden photo-stage isolate', className)}>
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative" style={{ width: `${fw * 100}%`, aspectRatio: String(ar), transform: `scale(${s}) translate(${(0.5 - cx0) * 100}%, ${(0.5 - cy0) * 100}%)` }}>
            <div className="absolute" style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}>
              <PhotoImg src={photo.thumb} alt={p.name} eager className={cx(full && 'opacity-0!')} />
            </div>
            <img src={photo.full} alt="" aria-hidden draggable={false} decoding="async" onLoad={() => setFull(true)}
              className={cx('absolute inset-0 size-full object-contain transition-opacity duration-500', full ? 'opacity-100' : 'opacity-0')} />
          </div>
        </div>
      </div>
    )
  }
  if (photo) {
    const pad = bare ? '' : size === 'sm' ? 'p-1' : 'p-3'
    return (
      <div className={cx('relative overflow-hidden isolate', !bare && 'photo-stage', className)}>
        <div className={cx('absolute inset-0', pad)}>
          <div className="relative size-full">
            <PhotoImg src={photo.thumb} alt={p.name} eager={eager} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={cx('relative overflow-hidden photo-stage isolate', className)}>
      <div className="absolute inset-0 flex items-center justify-center text-faint">
        <CatIcon id={p.category} className={big ? 'size-24' : size === 'sm' ? 'size-6' : 'size-12'} strokeWidth={1} />
      </div>
    </div>
  )
}

/* ---------- Кнопки ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg'; block?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', size = 'md', block, className, children, ...rest }, ref) {
  return (
    <button ref={ref} {...rest}
      className={cx('press inline-flex items-center justify-center gap-2 font-semibold select-none whitespace-nowrap min-w-0 disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'h-9 px-3 text-sm rounded-lg', size === 'md' && 'h-11 px-4 rounded-xl', size === 'lg' && 'h-13 px-6 text-base rounded-2xl',
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-2',
        variant === 'soft' && 'bg-surface-3 text-fg hover:bg-line-2',
        variant === 'ghost' && 'text-fg hover:bg-surface-2',
        variant === 'outline' && 'border border-line-2 text-fg hover:bg-surface-2',
        variant === 'danger' && 'bg-bad/15 text-bad hover:bg-bad/25',
        block && 'w-full', className)}>
      {children}
    </button>
  )
})

export function IconBtn({ children, className, label, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...rest}
      className={cx('press inline-flex items-center justify-center shrink-0 size-10 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg', className)}>
      {children}
    </button>
  )
}

/* ---------- Бейджи ---------- */
export function Badge({ tone = 'muted', children, className }: { tone?: 'muted' | 'accent' | 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode; className?: string }) {
  const t = {
    muted: 'bg-surface-3 text-muted', accent: 'bg-accent/15 text-accent', ok: 'bg-ok/12 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/12 text-bad', info: 'bg-info/12 text-info',
  }[tone]
  return <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium whitespace-nowrap', t, className)}>{children}</span>
}

export function PixelDot({ className = '' }: { className?: string }) {
  return <span className={cx('inline-block size-1.5 bg-current', className)} />
}

/* ---------- Анимированное число ---------- */
export function AnimatedNumber({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(value)
  const [txt, setTxt] = useState(format(value))
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: [0.2, 0.9, 0.25, 1], onUpdate: v => setTxt(format(v)) })
    return () => c.stop()
  }, [value])
  return <span className="tnum">{txt}</span>
}

/* ---------- Счётчик ---------- */
export function Stepper({ value, onChange, max = 99, min = 0, size = 'md' }: { value: number; onChange: (n: number) => void; max?: number; min?: number; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'size-8' : 'size-10'
  return (
    <div className="inline-flex items-center shrink-0 rounded-xl bg-surface-3 p-0.5">
      <button className={cx(s, 'press grid place-items-center rounded-lg hover:bg-line-2')} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Меньше"><Minus className="size-4" /></button>
      <span className="w-7 text-center font-semibold tnum">{value}</span>
      <button disabled={value >= max} className={cx(s, 'press grid place-items-center rounded-lg hover:bg-line-2 disabled:opacity-30')} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Больше"><Plus className="size-4" /></button>
    </div>
  )
}

/* ---------- Сегменты ---------- */
export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string; layoutId?: string }) {
  return (
    <div className={cx('flex p-1 rounded-xl bg-surface-2 gap-1', className)}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('flex-1 min-w-0 h-9 px-3 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap', value === o.value ? 'text-fg bg-surface-3' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Шторка / модалка ---------- */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => { const f = () => setDesktop(window.innerWidth >= 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const close = () => onClose()
    sheetStack.push(close)
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; const i = sheetStack.lastIndexOf(close); if (i >= 0) sheetStack.splice(i, 1) }
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
          <motion.div className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true"
            className={cx('relative w-full bg-surface flex flex-col max-h-[92dvh]', desktop ? cx('rounded-2xl', wide ? 'max-w-3xl' : 'max-w-lg') : 'rounded-t-3xl')}
            style={{ paddingBottom: desktop ? 0 : 'env(safe-area-inset-bottom, 0px)' }}
            initial={desktop ? { opacity: 0, scale: 0.96, y: 10 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 6 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={desktop ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose() }}>
            {!desktop && <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-line-2" />}
            {title && (
              <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3">
                <div className="font-display text-lg font-semibold">{title}</div>
                <IconBtn label="Закрыть" onClick={onClose} className="size-9 shrink-0"><X className="size-4" /></IconBtn>
              </div>
            )}
            <div className="overflow-y-auto px-5 pb-5 overscroll-contain" onPointerDownCapture={e => e.stopPropagation()}>{children}</div>
            {footer && <div className="px-5 py-4 border-t border-line">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Тосты ---------- */
interface ToastItem { id: number; text: string; tone?: 'ok' | 'bad' | 'accent'; action?: { label: string; fn: () => void } }
export const useToast = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; remove: (id: number) => void }>((set, get) => ({
  items: [],
  push: t => { const id = Date.now() + Math.random(); set(s => ({ items: [...s.items.slice(-2), { ...t, id }] })); setTimeout(() => get().remove(id), 2800) },
  remove: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
}))
export const toast = (text: string, opts: Partial<Omit<ToastItem, 'id' | 'text'>> = {}) => useToast.getState().push({ text, ...opts })

export function Toasts({ bottom = 96 }: { bottom?: number }) {
  const items = useToast(s => s.items)
  return (
    <div className="fixed left-0 right-0 z-[90] flex flex-col items-center gap-2 pointer-events-none gutter" style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }}>
      <AnimatePresence>
        {items.map(t => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-center gap-3 max-w-md w-full md:w-auto bg-surface-3 text-fg border border-line-2 pl-4 pr-2 py-2.5 rounded-2xl shadow-2xl shadow-black/50">
            <span className={cx('size-1.5 rounded-full shrink-0', t.tone === 'bad' ? 'bg-bad' : 'bg-accent')} />
            <span className="text-sm font-medium flex-1">{t.text}</span>
            {t.action ? <button className="text-sm font-semibold text-accent px-2 h-8" onClick={() => { t.action!.fn(); useToast.getState().remove(t.id) }}>{t.action.label}</button> : <span className="w-2" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function haptic(ms = 8) {
  if (isNative()) return postNative({ type: 'haptic', style: ms >= 20 ? 'success' : ms >= 12 ? 'medium' : 'light' })
  try { navigator.vibrate?.(ms) } catch { /* noop */ }
}

export function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 gap-3">
      <div className="size-16 grid place-items-center bg-surface-2 text-muted rounded-2xl">{icon}</div>
      <div className="font-display text-lg font-semibold mt-1">{title}</div>
      {text && <p className="text-muted max-w-xs">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <div className="text-sm text-muted mb-1.5 font-medium">{label}</div>
      {children}
      {error ? <div className="text-xs text-bad mt-1">{error}</div> : hint ? <div className="text-xs text-faint mt-1">{hint}</div> : null}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-7 w-12 rounded-full transition-colors shrink-0', checked ? 'bg-accent' : 'bg-line-2')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={cx('absolute top-1 size-5 rounded-full bg-fg', checked ? 'right-1' : 'left-1')} />
    </button>
  )
}
