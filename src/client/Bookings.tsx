import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, CalendarCheck, Repeat, X as XIcon, MessageCircle, Clock, MapPin, Receipt } from 'lucide-react'
import { RotateCcw, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, useMe } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { Button, IconBtn, Badge, Empty, ProductArt, Segmented, Field, cx, toast, Sheet, haptic } from '../ui/kit'
import { money, dWithTime, dShort, rangeLabel, daysWord, countdown, wd, hm } from '../lib/format'
import type { Booking, BookingStatus } from '../data/types'

export const STATUS: Record<BookingStatus, { label: string; tone: 'muted' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' }> = {
  new: { label: 'Ждёт подтверждения', tone: 'warn' }, confirmed: { label: 'Подтверждена', tone: 'info' }, issued: { label: 'У вас', tone: 'accent' },
  returned: { label: 'Завершена', tone: 'muted' }, cancelled: { label: 'Отменена', tone: 'bad' },
}

/** Гость: вход/регистрация в одном месте — экран AuthScreen */
export function LoginCard() {
  const go = useNav(s => s.go)
  return (
    <div className="max-w-sm w-full mx-auto rounded-3xl bg-surface p-6 flex flex-col gap-4">
      <div className="size-12 grid place-items-center rounded-2xl bg-accent/12 text-accent"><CalendarCheck className="size-6" /></div>
      <div><div className="text-xl font-semibold">Войдите по номеру</div><p className="text-sm text-muted mt-1">Покажем ваши брони и историю. Каталог, избранное и корзина доступны и без входа.</p></div>
      <Button block size="lg" onClick={() => go('auth')}>Войти или зарегистрироваться</Button>
      <button className="text-sm text-muted" onClick={() => { useStore.setState({ meId: 'c1' }); toast('Вы вошли как демо-клиент') }}>Войти как демо-клиент</button>
    </div>
  )
}

function BookingCard({ b, i }: { b: Booking; i: number }) {
  const go = useNav(s => s.go)
  const products = useStore(s => s.products)
  const items = b.items.map(it => products.find(p => p.id === it.productId)).filter(Boolean) as any[]
  const st = STATUS[b.status]
  const upcoming = b.start > Date.now() && (b.status === 'new' || b.status === 'confirmed')
  return (
    <button onClick={() => go('booking', { id: b.id })}
      className="w-full text-left rounded-2xl bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2"><span className="tnum font-semibold">{b.code}</span><Badge tone={st.tone}>{st.label}</Badge></div>
      <div className="flex items-center gap-2 text-sm"><CalendarCheck className="size-4 text-muted" />{rangeLabel(b.start, b.end)} · {daysWord(b.days)}</div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex -space-x-2">{items.slice(0, 5).map(p => <ProductArt key={p.id} p={p} size="sm" className="size-9 rounded-lg border-2 border-surface" />)}{items.length > 5 && <span className="size-9 grid place-items-center rounded-lg bg-surface-3 border-2 border-surface text-xs tnum">+{items.length - 5}</span>}</div>
        <span className="tnum font-semibold">{money(b.total)}</span>
      </div>
      {upcoming && <div className="text-xs text-accent font-semibold flex items-center gap-1.5"><Clock className="size-3.5" /> Выдача через {countdown(b.start)}</div>}
      {b.status === 'issued' && <div className={cx('text-xs font-semibold flex items-center gap-1.5', b.end < Date.now() ? 'text-bad' : 'text-accent')}><Clock className="size-3.5" />{b.end < Date.now() ? 'Срок возврата прошёл' : `Вернуть через ${countdown(b.end)}`}</div>}
    </button>
  )
}

export function BookingsScreen() {
  const me = useMe()
  const bookings = useStore(s => s.bookings)
  const [tab, setTab] = useState<'active' | 'past'>('active')
  const navTab = useNav(s => s.tab)
  const mine = useMemo(() => bookings.filter(b => b.customerId === me?.id), [bookings, me])
  const list = mine.filter(b => tab === 'active' ? ['new', 'confirmed', 'issued'].includes(b.status) : ['returned', 'cancelled'].includes(b.status)).sort((a, b) => tab === 'active' ? a.start - b.start : b.start - a.start)
  const last = useMemo(() => [...mine].filter(b => b.status !== 'cancelled').sort((a, b) => b.createdAt - a.createdAt)[0], [mine])
  const { addToCart, setRange } = useStore(useShallow(s => ({ addToCart: s.addToCart, setRange: s.setRange })))
  const repeatLast = () => {
    if (!last) return
    last.items.forEach(i => addToCart(i.productId, i.qty))
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(new Date(last.start).getHours(), 0, 0, 0)
    setRange({ start: d.getTime(), end: d.getTime() + (last.end - last.start) })
    haptic(20); toast(`${last.code}: тот же комплект на завтра`); navTab('cart')
  }
  if (!me) return <div className="py-6"><LoginCard /></div>
  return (
    <div className="flex flex-col gap-4 pb-8 max-w-2xl">
      <h1 className="font-display text-2xl font-semibold">Мои брони</h1>
      {last && (
        <button onClick={repeatLast} className="press flex items-center gap-3 rounded-2xl bg-surface p-3.5 text-left">
          <span className="size-10 grid place-items-center rounded-xl bg-accent/12 text-accent shrink-0"><RotateCcw className="size-5" /></span>
          <span className="flex-1 min-w-0"><span className="block font-medium">Повторить прошлый заказ</span><span className="block text-xs text-muted truncate">{last.code} · {last.items.length} поз. · на завтра, те же сутки</span></span>
          <ChevronRight className="size-4 text-faint shrink-0" />
        </button>
      )}
      <Segmented layoutId="bk-tab" value={tab} onChange={setTab} options={[{ value: 'active', label: `Активные · ${mine.filter(b => ['new', 'confirmed', 'issued'].includes(b.status)).length}` }, { value: 'past', label: 'История' }]} />
      {list.length ? <div className="flex flex-col gap-3">{list.map((b, i) => <BookingCard key={b.id} b={b} i={i} />)}</div>
        : <Empty icon={<CalendarCheck className="size-7" />} title={tab === 'active' ? 'Активных броней нет' : 'История пуста'} text="Соберите комплект и выберите даты, бронь появится здесь." action={<Button onClick={() => navTab('catalog')}>В каталог</Button>} />}
    </div>
  )
}

const FLOW: BookingStatus[] = ['new', 'confirmed', 'issued', 'returned']
const FLOW_LABEL = ['Оформлена', 'Подтверждена', 'В аренде', 'Возвращена']

export function BookingDetail() {
  const route = useRoute()
  const { bookings, products, settings, cancelMyBooking, addToCart, createLead, setRange } = useStore(useShallow(s => ({ bookings: s.bookings, products: s.products, settings: s.settings, cancelMyBooking: s.cancelMyBooking, addToCart: s.addToCart, createLead: s.createLead, setRange: s.setRange })))
  const me = useMe()
  const back = useNav(s => s.back), tab = useNav(s => s.tab)
  const b = bookings.find(b => b.id === route.params?.id)
  const [confirmCancel, setConfirmCancel] = useState(false)
  if (!b) return null
  const st = STATUS[b.status]
  const step = b.status === 'cancelled' ? -1 : FLOW.indexOf(b.status)
  const point = settings.points[b.city]
  const canCancel = (b.status === 'new' || b.status === 'confirmed') && b.start > Date.now()
  const repeat = () => {
    b.items.forEach(i => addToCart(i.productId, i.qty))
    const len = b.end - b.start
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(new Date(b.start).getHours(), 0, 0, 0)
    setRange({ start: d.getTime(), end: d.getTime() + len })
    toast('Тот же комплект на завтра, проверьте даты'); tab('cart')
  }
  return (
    <div className="flex flex-col gap-5 pb-10 max-w-2xl">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn>
        <div className="flex-1"><div className="tnum text-xl font-semibold">{b.code}</div><div className="text-xs text-muted">создана {dShort(b.createdAt)}</div></div><Badge tone={st.tone}>{st.label}</Badge></div>

      {b.status !== 'cancelled' && (
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex items-center">
            {FLOW.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }} className={cx('size-4 shrink-0', i <= step ? 'bg-accent' : 'bg-surface-3', i === step && 'ring-4 ring-accent/25')} />
                {i < FLOW.length - 1 && <div className="h-0.5 flex-1 bg-surface-3 mx-1 relative overflow-hidden"><motion.div className="absolute inset-0 bg-accent origin-left" initial={{ scaleX: 0 }} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ delay: 0.1 + i * 0.1, duration: 0.3 }} /></div>}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted">{FLOW_LABEL.map((l, i) => <span key={l} className={cx(i === step && 'text-fg font-semibold')}>{l}</span>)}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4"><div className="label mb-1">Получение</div><div className="font-semibold">{wd(b.start)}, {dShort(b.start)}</div><div className="tnum text-sm text-muted">{hm(b.start)}</div></div>
        <div className="rounded-2xl bg-surface p-4"><div className="label mb-1">Возврат</div><div className="font-semibold">{wd(b.end)}, {dShort(b.end)}</div><div className="tnum text-sm text-muted">{hm(b.end)}</div></div>
      </div>
      <div className="rounded-2xl bg-surface p-4 flex gap-3 text-sm"><MapPin className="size-4 text-accent mt-0.5 shrink-0" /><div>{b.deliveryType === 'delivery' ? <>Доставка: <b>{b.address}</b></> : <><b>{point.address}</b><div className="text-muted">{point.hours}</div></>}</div></div>

      <div className="rounded-2xl bg-surface divide-y divide-line">
        {b.items.map(it => { const p = products.find(p => p.id === it.productId); if (!p) return null; return (
          <div key={it.productId} className="flex items-center gap-3 p-3"><ProductArt p={p} size="sm" className="size-12 rounded-lg" /><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{p.name}</div><div className="text-xs text-muted tnum">{it.qty} × {money(it.price)}/сут</div></div><span className="tnum text-sm">{money(it.price * it.qty * b.days)}</span></div>
        ) })}
        <div className="p-3 flex flex-col gap-1.5 text-sm">
          {b.discount > 0 && <div className="flex justify-between text-ok"><span>Скидка{b.promo ? ` (${b.promo})` : ''}</span><span className="tnum">−{money(b.discount)}</span></div>}
          {b.delivery > 0 && <div className="flex justify-between"><span className="text-muted">Доставка</span><span className="tnum">{money(b.delivery)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Итого</span><span className="tnum">{money(b.total)}</span></div>
          <div className="flex justify-between text-xs text-muted"><span className="flex items-center gap-1"><Receipt className="size-3.5" />{b.paymentStatus === 'paid' ? 'Оплачено' : b.paymentStatus === 'partial' ? `Оплачено ${money(b.paid)}` : 'Не оплачено'}</span>{b.deposit > 0 && <span>Залог {money(b.deposit)}</span>}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <Button variant="soft" onClick={repeat}><Repeat className="size-4" /> Повторить</Button>
        {(b.status === 'issued' || b.status === 'confirmed') && <Button variant="soft" onClick={() => { createLead({ type: 'callback', name: me?.name ?? '', phone: me?.phone ?? '', text: `Продлить бронь ${b.code}`, city: b.city }); toast('Запрос на продление отправлен менеджеру') }}><Clock className="size-4" /> Продлить</Button>}
        {canCancel && <Button variant="danger" onClick={() => setConfirmCancel(true)}><XIcon className="size-4" /> Отменить</Button>}
      </div>

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Отменить бронь?"
        footer={<div className="flex gap-2"><Button variant="soft" block onClick={() => setConfirmCancel(false)}>Оставить</Button><Button variant="danger" block onClick={() => { cancelMyBooking(b.id); setConfirmCancel(false); toast('Бронь отменена') }}>Отменить бронь</Button></div>}>
        <p className="text-muted">Техника снова станет доступна другим. Если оплатили, вернём деньги тем же способом.</p>
      </Sheet>
    </div>
  )
}
