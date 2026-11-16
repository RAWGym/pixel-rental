import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eraser, X, Check, FileText, ChevronDown } from 'lucide-react'
import type { ContractSnapshot } from '../data/types'
import { cx, haptic } from '../ui/kit'
import { sha256, dataUrlBytes } from '../lib/contract'

/** точка штриха: x, y (CSS px поля), давление 0..1, мс от начала подписи */
type Pt = [number, number, number, number]
export interface SignatureResult { png: Blob; dataUrl: string; hash: string; strokes: { w: number; h: number; strokes: Pt[][] }; signerName: string }

const INK = '#1b1612'
const OUT_W = 800, OUT_H = 300
const money = (n: number) => new Intl.NumberFormat('ru-RU').format(n) + ' ₸'
const dt = (v: string | number) => new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** толщина линии: стилус — по давлению, палец/мышь — тоньше на быстрых участках */
const widthAt = (p: number, speed: number, base: number) => (p > 0 && p !== 0.5 ? base * (0.55 + p * 0.9) : base * Math.max(0.8, Math.min(1.15, 1.2 - speed * 0.06)))

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Pt[][], k: number, base: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.fillStyle = INK
  for (const s of strokes) {
    if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0][0] * k, s[0][1] * k, base * k * 0.5, 0, Math.PI * 2); ctx.fill(); continue }
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], c = s[i + 1]
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.max(1, b[3] - a[3])
      ctx.lineWidth = widthAt(b[2], d / t, base) * k
      // сглаживание: кривая через середины отрезков
      const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m2 = c ? [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2] : [b[0], b[1]]
      ctx.beginPath()
      ctx.moveTo((i === 1 ? a[0] : m1[0]) * k, (i === 1 ? a[1] : m1[1]) * k)
      ctx.quadraticCurveTo(b[0] * k, b[1] * k, m2[0] * k, m2[1] * k)
      ctx.stroke()
    }
  }
}
const inkLength = (strokes: Pt[][]) => strokes.reduce((sum, s) => sum + s.reduce((l, p, i) => (i ? l + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : l), 0), 0)

/** Полноэкранный экран подписи: сводка договора, условия, согласие, поле для пальца/стилуса/мыши */
export function SignatureScreen({ snapshot, terms, version, defaultName, onCancel, onConfirm, busy }: {
  snapshot: ContractSnapshot; terms: string; version: number; defaultName: string; busy?: boolean
  onCancel: () => void; onConfirm: (r: SignatureResult) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Pt[][]>([])
  const cur = useRef<Pt[] | null>(null)
  const t0 = useRef(0)
  const size = useRef({ w: 0, h: 0 })
  const [count, setCount] = useState(0) // число штрихов — для кнопок
  const [agree, setAgree] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [name, setName] = useState(defaultName)
  const [err, setErr] = useState('')

  const redraw = () => {
    const c = cv.current; if (!c) return
    const ctx = c.getContext('2d')!; const dpr = c.width / Math.max(1, size.current.w)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height)
    drawStrokes(ctx, cur.current ? [...strokes.current, cur.current] : strokes.current, dpr, 2.6)
  }
  // поле подстраивается под экран и поворот; штрихи масштабируются вместе с ним
  useLayoutEffect(() => {
    const c = cv.current!, box = wrap.current!
    const fit = () => {
      const r = box.getBoundingClientRect(); const dpr = Math.min(3, window.devicePixelRatio || 1)
      const { w: ow, h: oh } = size.current
      if (ow && oh && (ow !== r.width || oh !== r.height)) {
        const kx = r.width / ow, ky = r.height / oh
        strokes.current = strokes.current.map(s => s.map(([x, y, p, t]) => [x * kx, y * ky, p, t] as Pt))
      }
      size.current = { w: r.width, h: r.height }
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr)
      redraw()
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(box)
    return () => ro.disconnect()
  }, [])
  // страница под экраном не прокручивается
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; removeEventListener('keydown', esc) }
  }, [busy])

  const pt = (e: React.PointerEvent): Pt => {
    const r = cv.current!.getBoundingClientRect()
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10, e.pointerType === 'pen' ? Math.round(e.pressure * 100) / 100 : 0.5, Math.round(performance.now() - t0.current)]
  }
  const down = (e: React.PointerEvent) => {
    if (e.button > 0) return
    e.preventDefault(); cv.current!.setPointerCapture(e.pointerId)
    if (!strokes.current.length) t0.current = performance.now()
    cur.current = [pt(e)]; setErr(''); redraw()
  }
  const move = (e: React.PointerEvent) => {
    if (!cur.current) return
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of evs) { const p = pt(ev as any); const last = cur.current[cur.current.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.8) cur.current.push(p) }
    redraw()
  }
  const up = () => {
    if (!cur.current) return
    strokes.current = [...strokes.current, cur.current]; cur.current = null
    setCount(strokes.current.length); redraw()
  }
  const clear = () => { strokes.current = []; cur.current = null; setCount(0); setErr(''); redraw() }

  const confirm = async () => {
    const len = inkLength(strokes.current), pts = strokes.current.reduce((n, s) => n + s.length, 0)
    if (len < 120 || pts < 12) { setErr('Подпись слишком короткая. Распишитесь как в документах'); haptic(30); return }
    if (name.trim().length < 2) { setErr('Укажите ФИО'); return }
    // PNG 800×300, прозрачный фон, подпись вписана с полями
    const xs = strokes.current.flat().map(p => p[0]), ys = strokes.current.flat().map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const k = Math.min((OUT_W - 40) / Math.max(1, maxX - minX), (OUT_H - 40) / Math.max(1, maxY - minY), 2.5)
    const off = document.createElement('canvas'); off.width = OUT_W; off.height = OUT_H
    const ctx = off.getContext('2d')!
    ctx.translate((OUT_W - (maxX - minX) * k) / 2 - minX * k, (OUT_H - (maxY - minY) * k) / 2 - minY * k)
    drawStrokes(ctx, strokes.current, k, 2.6)
    const dataUrl = off.toDataURL('image/png')
    const png = await (await fetch(dataUrl)).blob()
    haptic(25)
    onConfirm({ png, dataUrl, hash: sha256(dataUrlBytes(dataUrl)), strokes: { w: size.current.w, h: size.current.h, strokes: strokes.current }, signerName: name.trim() })
  }

  const ready = count > 0 && agree && !busy
  const s = snapshot
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Подпись клиента" className="sig-screen fixed inset-0 z-[300] flex flex-col overflow-hidden fade-in" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 shrink-0">
        <button aria-label="Отмена" onClick={onCancel} disabled={busy} className="press size-10 grid place-items-center rounded-xl sig-soft"><X className="size-5" /></button>
        <div className="min-w-0 flex-1"><div className="text-lg sm:text-xl font-semibold leading-tight">Пожалуйста, распишитесь</div><div className="text-xs sig-muted truncate">Договор № {s.code} · Pixel Rental</div></div>
      </div>
      <div className="sig-grid flex-1 min-h-0 grid gap-3 px-4 sm:px-6 pb-3 overflow-y-auto">
        {/* сводка договора */}
        <div className="sig-card rounded-2xl p-4 flex flex-col gap-2.5 text-sm min-w-0">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="sig-muted">Поставщик</span><span className="font-medium">Pixel Rental</span>
            <span className="sig-muted">Арендатор</span><span className="font-medium truncate">{s.customer.name}{s.customer.phone ? ` · ${s.customer.phone}` : ''}</span>
            <span className="sig-muted">Период</span><span className="tnum">{dt(s.start)} - {dt(s.end)} · {s.days} сут</span>
          </div>
          <ul className="flex flex-col gap-1 border-t sig-line pt-2">
            {s.items.map(i => (
              <li key={i.product_id} className="flex gap-2 min-w-0"><span className="flex-1 min-w-0"><span className="block truncate">{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><span className="block text-xs sig-muted truncate">S/N {i.units.map(u => u.serial).join(', ') || '-'}</span></span><span className="tnum shrink-0">{money(i.price * i.qty * s.days)}</span></li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t sig-line pt-2 tnum"><span>Итого <b>{money(s.total)}</b></span><span className="sig-muted">Оплачено {money(s.paid)}</span></div>
          <button type="button" onClick={() => setShowTerms(v => !v)} className="flex items-center gap-2 text-left font-medium mt-1"><FileText className="size-4 text-[#c8640a]" />Условия аренды · версия {version}<ChevronDown className={cx('size-4 ml-auto transition-transform', showTerms && 'rotate-180')} /></button>
          {showTerms && <div className="text-xs leading-relaxed whitespace-pre-line sig-muted max-h-48 overflow-y-auto pr-1">{terms}</div>}
          <label className="flex items-start gap-3 rounded-xl sig-soft p-3 cursor-pointer select-none">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 size-5 accent-[#e8790f] shrink-0" />
            <span>Я получил технику, проверил комплектность и согласен с условиями аренды</span>
          </label>
          <label className="flex flex-col gap-1"><span className="text-xs sig-muted">ФИО подписанта</span><input value={name} onChange={e => setName(e.target.value)} className="h-11 rounded-xl px-3 sig-input" autoComplete="off" /></label>
        </div>
        {/* поле подписи */}
        <div className="flex flex-col gap-2 min-h-[220px]">
          <div ref={wrap} className="sig-paper relative flex-1 min-h-[200px] rounded-2xl overflow-hidden">
            <span className="pointer-events-none absolute left-6 right-6 bottom-[26%] border-b-2 border-dashed border-[#b9ab98]" />
            <span className="pointer-events-none absolute left-6 bottom-[calc(26%-22px)] text-xs text-[#8d8170]">Подпись</span>
            {count === 0 && <span className="pointer-events-none absolute inset-0 grid place-items-center text-[#a89a87] text-base">Распишитесь здесь пальцем или стилусом</span>}
            <canvas ref={cv} className="absolute inset-0 w-full h-full touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={e => { if (e.pointerType === 'mouse') up() }} />
          </div>
          {err && <div className="text-sm text-[#c0392b] font-medium">{err}</div>}
        </div>
      </div>
      <div className="shrink-0 grid grid-cols-[auto_auto_1fr] gap-2 px-4 sm:px-6 pb-4 pt-1">
        <button onClick={clear} disabled={!count || busy} className="press h-14 px-4 rounded-2xl sig-soft font-medium flex items-center gap-2 disabled:opacity-40"><Eraser className="size-5" /><span className="hidden min-[400px]:inline">Очистить</span></button>
        <button onClick={onCancel} disabled={busy} className="press h-14 px-4 rounded-2xl sig-soft font-medium">Отмена</button>
        <button onClick={confirm} disabled={!ready} aria-label="Подтвердить подпись" className="press h-14 px-4 rounded-2xl bg-[#e8790f] text-white text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed min-w-0"><Check className="size-5 shrink-0" /><span className="truncate">{busy ? 'Сохраняем…' : <>Подтвердить<span className="max-[419px]:hidden"> подпись</span></>}</span></button>
      </div>
    </div>,
    document.body,
  )
}
