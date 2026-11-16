import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Store, Truck, Wallet, CreditCard, Banknote, FileText, Check, MapPin, CalendarDays, Copy, ArrowRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, useMe } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { Button, IconBtn, Field, cx, toast, haptic, ProductArt } from '../ui/kit'
import { useCartTotals } from './Cart'
import { CheckoutGate, VerificationBadge, fmtPhone } from './Auth'
import { api } from '../data/api'
import { verificationOf } from '../data/types'
import { money, dWithTime, daysWord, wd } from '../lib/format'
import type { PaymentMethod } from '../data/types'

const PAY: { id: PaymentMethod; label: string; hint: string; icon: any }[] = [
  { id: 'kaspi', label: 'Kaspi', hint: 'Счёт придёт в Kaspi после подтверждения', icon: Wallet },
  { id: 'card', label: 'Картой', hint: 'При получении, терминал на точке', icon: CreditCard },
  { id: 'cash', label: 'Наличными', hint: 'При получении', icon: Banknote },
  { id: 'invoice', label: 'Счёт для ТОО/ИП', hint: 'Выставим счёт и АВР по реквизитам', icon: FileText },
]

/** Гость видит мягкий экран входа; корзина при этом сохраняется */
export function Checkout() {
  const me = useMe()
  return me ? <CheckoutForm key={me.id} /> : <CheckoutGate />
}

function CheckoutForm() {
  const { range, city, settings, promo } = useStore(useShallow(s => ({ range: s.range, city: s.city, settings: s.settings, promo: s.promo })))
  const me = useMe()
  const back = useNav(s => s.back), replace = useNav(s => s.replace), tab = useNav(s => s.tab), go = useNav(s => s.go)
  const t = useCartTotals()
  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [email, setEmail] = useState(me?.email ?? '')
  const [company, setCompany] = useState(me?.company ?? '')
  const [deliveryType, setDT] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [pay, setPay] = useState<PaymentMethod>('kaspi')
  const [comment, setComment] = useState('')
  const [agree, setAgree] = useState(true)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const point = settings.points[city]
  const delivery = deliveryType === 'delivery' ? settings.deliveryFee[city] : 0
  const total = t.total + delivery
  const phoneOk = phone.replace(/\D/g, '').length === 11
  const valid = name.trim().length > 1 && phoneOk && agree && (deliveryType === 'pickup' || address.trim().length > 4) && (pay !== 'invoice' || company.trim())

  useEffect(() => { if (!t.lines.length && !busy) tab('cart') }, [t.lines.length])

  const submit = () => {
    setTouched(true)
    if (!valid) { toast('Заполните выделенные поля', { tone: 'bad' }); return }
    setBusy(true)
    setTimeout(async () => {
      const res = await api.placeOrder({ name: name.trim(), phone, email, company, deliveryType, address, paymentMethod: pay, comment, promo })
      setBusy(false)
      if (res.ok) { haptic(30); replace('success', { id: res.data.id }) } else toast(res.error, { tone: 'bad' })
    }, 600)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 pb-40 lg:pb-10">
      <div className="flex flex-col gap-6 min-w-0">
        <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Оформление</h1></div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap"><div className="label">1 · Контакты</div><VerificationBadge v={verificationOf(me)} /></div>
          {verificationOf(me) !== 'verified' && (
            <div className="rounded-2xl bg-warn/[0.08] p-3.5 text-sm text-muted">
              {verificationOf(me) === 'pending' ? 'Профиль на проверке. Бронь уйдёт с пометкой «ждёт верификации», менеджер подтвердит её после проверки документов.'
                : <>Профиль не подтверждён. Бронь можно отправить, она уйдёт с пометкой «ждёт верификации». <button className="text-accent font-medium" onClick={() => go('verify')}>Отправить скан удостоверения</button></>}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Имя и фамилия" error={touched && name.trim().length < 2 ? 'Как к вам обращаться?' : undefined}><input id="co-name" autoComplete="name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Айдана Сейткали" /></Field>
            <Field label="Телефон" hint="Номер из профиля. Подтверждение придёт в WhatsApp" error={touched && !phoneOk ? 'Нужен номер из 11 цифр' : undefined}><input id="co-phone" readOnly className="field tnum opacity-80" value={fmtPhone(phone)} /></Field>
            <Field label="Email (необязательно)"><input id="co-email" type="email" className="field" value={email} onChange={e => setEmail(e.target.value)} placeholder="для чеков" /></Field>
            <Field label="Компания (если нужен счёт)" error={touched && pay === 'invoice' && !company.trim() ? 'Для счёта нужна компания' : undefined}><input id="co-company" className="field" value={company} onChange={e => setCompany(e.target.value)} placeholder="ТОО / ИП" /></Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="label">2 · Получение</div>
          <div className="grid grid-cols-2 gap-2">
            {([['pickup', 'Самовывоз', 'Бесплатно', Store], ['delivery', 'Доставка', money(settings.deliveryFee[city]), Truck]] as const).map(([id, l, h, I]) => (
              <button key={id} onClick={() => setDT(id)} className={cx('relative text-left p-4 rounded-2xl border transition-colors', deliveryType === id ? 'border-accent bg-accent/[0.07]' : 'border-line bg-surface hover:border-line-2')}>
                <I className={cx('size-5 mb-2', deliveryType === id ? 'text-accent' : 'text-muted')} />
                <div className="font-semibold">{l}</div><div className="text-xs text-muted">{h}</div>
                {deliveryType === id && <span className="absolute top-3 right-3 size-5 grid place-items-center bg-accent text-accent-ink px-corners"><Check className="size-3.5" strokeWidth={3} /></span>}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {deliveryType === 'pickup' ? (
              <motion.div key="p" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-surface-2 p-3 text-sm flex gap-2"><MapPin className="size-4 text-accent mt-0.5" /><div><b>{point.address}</b><div className="text-muted">{point.hours}</div></div></motion.div>
            ) : (
              <motion.div key="d" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Field label="Адрес доставки" error={touched && address.trim().length < 5 ? 'Укажите адрес' : undefined}><input id="co-address" className="field" value={address} onChange={e => setAddress(e.target.value)} placeholder="Улица, дом, офис / локация съёмки" /></Field>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="flex flex-col gap-3">
          <div className="label">3 · Оплата</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {PAY.map(p => (
              <button key={p.id} onClick={() => setPay(p.id)} className={cx('flex gap-3 items-center text-left p-3 rounded-xl border transition-colors', pay === p.id ? 'border-accent bg-accent/[0.07]' : 'border-line bg-surface hover:border-line-2')}>
                <span className={cx('size-9 grid place-items-center rounded-lg shrink-0', pay === p.id ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-muted')}><p.icon className="size-4" /></span>
                <span className="min-w-0"><span className="block font-semibold text-sm">{p.label}</span><span className="block text-xs text-muted">{p.hint}</span></span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="label">4 · Комментарий</div>
          <textarea id="co-comment" rows={3} className="field resize-none" value={comment} onChange={e => setComment(e.target.value)} placeholder="Например: нужна помощь с настройкой, заберёт водитель Нурлан" />
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input id="co-agree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
            <span className="text-muted">Согласен с условиями аренды. При получении покажу удостоверение личности.</span>
          </label>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 self-start w-full rounded-2xl bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-accent" /><span>{wd(range.start)}, {dWithTime(range.start)} → {wd(range.end)}, {dWithTime(range.end)}</span></div>
        <div className="flex -space-x-2">{t.lines.slice(0, 7).map(l => <ProductArt key={l.productId} p={l.product} size="sm" className="size-10 rounded-lg border-2 border-surface" />)}{t.lines.length > 7 && <span className="size-10 grid place-items-center rounded-lg bg-surface-3 border-2 border-surface text-xs tnum">+{t.lines.length - 7}</span>}</div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted">Аренда, {daysWord(t.days)}</span><span className="tnum">{money(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="flex justify-between text-ok"><span>Скидка {t.percent}%</span><span className="tnum">−{money(t.discount)}</span></div>}
          {delivery > 0 && <div className="flex justify-between"><span className="text-muted">Доставка</span><span className="tnum">{money(delivery)}</span></div>}
        </div>
        <div className="flex justify-between items-baseline pt-3 border-t border-line"><span className="font-semibold">Итого</span><span className="tnum text-xl font-semibold">{money(total)}</span></div>
        <div className="text-xs text-muted">Сейчас ничего не списываем. Менеджер подтвердит бронь в течение 15 минут.</div>
        <Button size="lg" block className="hidden lg:flex" onClick={submit} disabled={busy}>{busy ? <Pixels /> : 'Забронировать'}</Button>
      </aside>

      <div className="lg:hidden fixed left-0 right-0 z-40 gutter pb-3" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <Button size="lg" block onClick={submit} disabled={busy} className="shadow-2xl shadow-black/60">{busy ? <Pixels /> : <>Забронировать · <span className="tnum">{money(total)}</span></>}</Button>
      </div>
    </div>
  )
}

function Pixels() {
  return <span className="flex gap-1">{[0, 1, 2, 3].map(i => <motion.span key={i} className="size-2 bg-accent-ink" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }} />)}</span>
}

export function Success() {
  const route = useRoute()
  const b = useStore(s => s.bookings.find(b => b.id === route.params?.id))
  const tab = useNav(s => s.tab), go = useNav(s => s.go)
  const point = useStore(s => b ? s.settings.points[b.city] : null)
  if (!b) return null
  const confetti = Array.from({ length: 22 }, (_, i) => i)
  return (
    <div className="relative max-w-md mx-auto text-center flex flex-col items-center gap-5 pt-8 pb-10">
      <div className="absolute inset-x-0 top-0 h-60 pointer-events-none overflow-hidden">
        {confetti.map(i => (
          <motion.span key={i} className="absolute size-2 bg-accent" style={{ left: `${(i * 37) % 100}%`, top: 40 }}
            initial={{ y: 0, opacity: 1, rotate: 0 }} animate={{ y: [0, -60 - (i % 5) * 18, 200], x: ((i % 7) - 3) * 14, opacity: [1, 1, 0], rotate: 180 }}
            transition={{ duration: 1.6 + (i % 4) * 0.2, ease: 'easeOut', delay: 0.15 }} />
        ))}
      </div>
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="size-24 grid place-items-center bg-accent text-accent-ink px-corners-lg">
        <motion.svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.4 }} />
        </motion.svg>
      </motion.div>
      <div>
        <h1 className="font-display text-2xl font-semibold">Бронь принята</h1>
        <p className="text-muted mt-1">{b.awaitingVerification ? 'Бронь ждёт верификации профиля: менеджер сначала проверит документы, затем подтвердит бронь и напишет в WhatsApp.' : 'Менеджер подтвердит её в течение 15 минут и напишет в WhatsApp.'}</p>
      </div>
      <button onClick={async () => { try { await navigator.clipboard.writeText(b.code); toast('Номер скопирован') } catch { /* noop */ } }}
        className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface border border-dashed border-line-2 hover:border-accent">
        <span className="tnum text-2xl font-semibold text-accent">{b.code}</span><Copy className="size-4 text-muted" />
      </button>
      <div className="w-full rounded-2xl bg-surface p-4 text-left text-sm flex flex-col gap-2.5">
        <div className="flex justify-between"><span className="text-muted">Получение</span><span className="font-medium text-right">{wd(b.start)}, {dWithTime(b.start)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Возврат</span><span className="font-medium text-right">{wd(b.end)}, {dWithTime(b.end)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted">Где</span><span className="font-medium text-right">{b.deliveryType === 'delivery' ? b.address : point?.address}</span></div>
        <div className="flex justify-between"><span className="text-muted">Сумма</span><span className="tnum font-semibold">{money(b.total)}</span></div>
      </div>
      <div className="w-full text-left rounded-2xl bg-accent/[0.07] border border-accent/30 p-4 text-sm">
        <div className="font-semibold mb-1.5">Что взять с собой</div>
        <ul className="flex flex-col gap-1 text-muted">
          <li>· Удостоверение личности</li><li>· Номер брони {b.code}</li>
        </ul>
      </div>
      <div className="flex gap-2 w-full">
        <Button variant="soft" block onClick={() => tab('home')}>На главную</Button>
        <Button block onClick={() => { tab('bookings'); setTimeout(() => go('booking', { id: b.id }), 0) }}>Моя бронь <ArrowRight className="size-4" /></Button>
      </div>
    </div>
  )
}
