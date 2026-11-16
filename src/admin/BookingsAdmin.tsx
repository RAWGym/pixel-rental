import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Plus, Phone, Check, Truck, Store, X as XIcon, Trash2, Wallet } from 'lucide-react'
import { supabaseConfigured, staffCreateBooking } from '../data/supabase'
import { useStore } from '../store/store'
import { PageHead, NoAccess, useAdminNav } from './Admin'
import { Badge, Button, Sheet, Field, cx, toast, ProductArt, Stepper } from '../ui/kit'
import { money, dWithTime, relTime, daysWord, hm, dShort } from '../lib/format'
import type { Booking, BookingStatus, CityId, Source, PaymentMethod } from '../data/types'
import { freeUnits } from '../lib/availability'
import { calcPrice, rentalDays } from '../lib/pricing'
import { uid } from '../lib/rng'
import { matchProduct } from '../client/Catalog'
import { ContractBlock } from './ContractBlock'

export const STATUS_ADMIN: Record<BookingStatus, { label: string; tone: 'muted' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' }> = {
  new: { label: 'Новая', tone: 'warn' }, confirmed: { label: 'Подтверждена', tone: 'info' }, issued: { label: 'Выдана', tone: 'accent' }, returned: { label: 'Возвращена', tone: 'ok' }, cancelled: { label: 'Отменена', tone: 'muted' },
}
const SRC: Record<Source, string> = { app: 'Приложение', phone: 'Звонок', instagram: 'Instagram', whatsapp: 'WhatsApp', 'walk-in': 'Пришёл сам' }
const PAY: Record<PaymentMethod, string> = { kaspi: 'Kaspi', card: 'Карта', cash: 'Наличные', invoice: 'Счёт' }
type Filter = 'all' | BookingStatus | 'overdue' | 'today'

const NUM = new Set(["Сумма"])

export function BookingsAdmin() {
  const { bookings, customers, staffId, staff } = useStore()
  const can = useStore(s => s.can)
  const { focus } = useAdminNav()
  const me = staff.find(s => s.id === staffId)
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [city, setCity] = useState<CityId | 'all'>(me?.city ?? 'all')
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (!focus) return; if (focus === 'create') setCreating(true); else if (focus === 'new' || focus === 'overdue') setF(focus as Filter); else setOpen(focus) }, [focus])
  const now = Date.now()
  const t0 = new Date(); t0.setHours(0, 0, 0, 0)
  const test = (b: Booking, x: Filter) => x === 'all' ? true : x === 'overdue' ? b.status === 'issued' && b.end < now : x === 'today' ? (b.start >= t0.getTime() && b.start < t0.getTime() + 864e5) || (b.status === 'issued' && b.end >= t0.getTime() && b.end < t0.getTime() + 864e5) : b.status === x
  const cust = (id: string) => customers.find(c => c.id === id)
  const list = useMemo(() => bookings.filter(b => (city === 'all' || b.city === city) && test(b, f) && (!q || `${b.code} ${cust(b.customerId)?.name} ${cust(b.customerId)?.phone}`.toLowerCase().includes(q.toLowerCase()))), [bookings, f, q, city, customers])
  const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'Все' }, { id: 'today', label: 'Сегодня' }, { id: 'new', label: 'Новые' }, { id: 'confirmed', label: 'Подтверждены' }, { id: 'issued', label: 'На руках' }, { id: 'overdue', label: 'Просрочены' }, { id: 'returned', label: 'Возвращены' }, { id: 'cancelled', label: 'Отменены' }]

  return (
    <div>
      <PageHead title="Брони" sub={`${list.length} из ${bookings.length}`} actions={can('bookings.edit') ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />Новая бронь</Button> : undefined} />
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="bk-search" className="field pl-10 h-11" placeholder="Код брони, имя или телефон" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select id="bk-city" className="field h-11 md:w-44" value={city} onChange={e => setCity(e.target.value as any)}><option value="all">Все города</option><option value="almaty">Алматы</option><option value="astana">Астана</option></select>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-4">
        {FILTERS.map(x => { const n = bookings.filter(b => (city === 'all' || b.city === city) && test(b, x.id)).length; return (
          <button key={x.id} onClick={() => setF(x.id)} className={cx('h-8 px-3 rounded-full text-sm whitespace-nowrap border flex items-center gap-1.5', f === x.id ? 'bg-accent text-accent-ink border-accent font-semibold' : 'border-line hover:border-line-2', x.id === 'overdue' && n > 0 && f !== x.id && 'border-bad/50 text-bad')}>
            {x.label}<span className="tnum text-xs opacity-70">{n}</span></button>) })}
      </div>

      <div className="rounded-2xl bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-xs text-muted border-b border-line">{['Бронь', 'Клиент', 'Период', 'Состав', 'Статус', 'Оплата', 'Сумма'].map(h => <th key={h} className={cx('px-4 py-3 font-medium', NUM.has(h) && 'num')}>{h}</th>)}</tr></thead>
          <tbody>
            {list.slice(0, 120).map((b, i) => { const c = cust(b.customerId); const od = b.status === 'issued' && b.end < now; return (
              <tr key={b.id} onClick={() => setOpen(b.id)} className="border-b border-line/60 last:border-0 hover:bg-surface-2 cursor-pointer">
                <td className="px-4 py-3"><div className="tnum font-semibold">{b.code}</div><div className="text-xs text-faint">{b.city === 'almaty' ? 'Алматы' : 'Астана'} · {SRC[b.source]}</div></td>
                <td className="px-4 py-3"><div className="font-medium flex items-center gap-1.5">{c?.name}{c?.blacklisted && <Badge tone="bad">ЧС</Badge>}</div><div className="text-xs text-muted tnum">{c?.phone}</div></td>
                <td className="px-4 py-3 whitespace-nowrap"><div>{dWithTime(b.start)}</div><div className={cx('text-xs', od ? 'text-bad font-semibold' : 'text-muted')}>до {dWithTime(b.end)}</div></td>
                <td className="px-4 py-3 text-muted">{b.items.reduce((s, i) => s + i.qty, 0)} поз. · {daysWord(b.days)}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{od ? <Badge tone="bad">Просрочена</Badge> : <Badge tone={STATUS_ADMIN[b.status].tone}>{STATUS_ADMIN[b.status].label}</Badge>}{b.awaitingVerification && <Badge tone="warn">Ждёт верификации</Badge>}</div></td>
                <td className="px-4 py-3"><span className={cx('text-xs font-semibold', b.paymentStatus === 'paid' ? 'text-ok' : b.paymentStatus === 'partial' ? 'text-warn' : 'text-muted')}>{b.paymentStatus === 'paid' ? 'Оплачено' : b.paymentStatus === 'partial' ? 'Частично' : 'Нет'}</span><div className="text-xs text-faint">{PAY[b.paymentMethod]}</div></td>
                <td className="num">{money(b.total)}</td>
              </tr>
            ) })}
          </tbody>
        </table>
        {!list.length && <div className="p-10 text-center text-muted">Под фильтр ничего не попало</div>}
      </div>
      <BookingSheet id={open} onClose={() => setOpen(null)} />
      <CreateBooking open={creating} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpen(id) }} />
    </div>
  )
}

function BookingSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { bookings, customers, products, units, staff, setBookingStatus, addPayment, patchBooking } = useStore()
  const can = useStore(s => s.can)
  const b = bookings.find(b => b.id === id)
  const [pay, setPay] = useState('')
  const [cancelReason, setCancelReason] = useState<string | null>(null)
  if (!b) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const c = customers.find(c => c.id === b.customerId)
  const edit = can('bookings.edit')
  const next: { s: BookingStatus; label: string } | null = b.status === 'new' ? { s: 'confirmed', label: 'Подтвердить' } : b.status === 'confirmed' ? { s: 'issued', label: 'Выдать клиенту' } : b.status === 'issued' ? { s: 'returned', label: 'Принять возврат' } : null
  const od = b.status === 'issued' && b.end < Date.now()
  return (
    <Sheet open={!!id} onClose={onClose} wide title={<span className="flex items-center gap-3"><span className="tnum">{b.code}</span>{od ? <Badge tone="bad">Просрочена</Badge> : <Badge tone={STATUS_ADMIN[b.status].tone}>{STATUS_ADMIN[b.status].label}</Badge>}</span>}
      footer={edit ? (
        <div className="flex flex-wrap gap-2">
          {next && <Button onClick={() => { if (next.s === 'issued' || next.s === 'returned') { onClose(); useAdminNav.getState().go('issue', b.id); return } setBookingStatus(b.id, next.s); toast(`${b.code}: ${STATUS_ADMIN[next.s].label.toLowerCase()}`) }}><Check className="size-4" />{next.label}</Button>}
          {(b.status === 'new' || b.status === 'confirmed') && can('bookings.cancel') && <Button variant="danger" onClick={() => setCancelReason('')}>Отменить</Button>}
        </div>
      ) : <NoAccess what="изменять брони" />}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="label mb-1">Клиент</div>
            <div className="font-semibold flex items-center gap-2">{c?.name}{c?.verified && <Badge tone="ok">Проверен</Badge>}{c?.blacklisted && <Badge tone="bad">Чёрный список</Badge>}</div>
            <div className="tnum text-sm text-muted flex items-center gap-1.5 select-all"><Phone className="size-3.5" />{c?.phone}</div>
            {c?.company && <div className="text-sm text-muted">{c.company}</div>}
            {c?.note && <div className="text-xs text-warn mt-1">{c.note}</div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-3"><div className="label mb-1">Выдача</div><div className="font-medium">{dWithTime(b.start)}</div></div>
            <div className={cx('rounded-xl p-3', od ? 'bg-bad/15' : 'bg-surface-2')}><div className="label mb-1">Возврат</div><div className="font-medium">{dWithTime(b.end)}</div></div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-sm flex items-center gap-2">{b.deliveryType === 'delivery' ? <><Truck className="size-4 text-accent" />Доставка: {b.address}</> : <><Store className="size-4 text-accent" />Самовывоз, {b.city === 'almaty' ? 'Алматы' : 'Астана'}</>}</div>
          {b.comment && <div className="rounded-xl border border-line p-3 text-sm"><div className="label mb-1">Комментарий клиента</div>{b.comment}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Менеджер"><select id="bk-manager" disabled={!edit} className="field h-10 py-0" value={b.managerId ?? ''} onChange={e => patchBooking(b.id, { managerId: e.target.value }, `Ответственный: ${staff.find(s => s.id === e.target.value)?.name}`)}><option value="">-</option>{staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Источник"><div className="field h-10 py-0 flex items-center">{SRC[b.source]}</div></Field>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line divide-y divide-line">
            {b.items.map(it => { const p = products.find(p => p.id === it.productId); return (
              <div key={it.productId} className="p-2.5 flex items-center gap-3">
                {p && <ProductArt p={p} size="sm" className="size-10 rounded-lg shrink-0" />}
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p?.name}</div><div className="text-xs tnum text-muted truncate">{it.unitIds.map(u => units.find(x => x.id === u)?.serial ?? u).join(', ')}</div></div>
                <div className="text-right tnum text-sm">{it.qty}×{money(it.price)}</div>
              </div>
            ) })}
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-sm flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="text-muted">Аренда, {daysWord(b.days)}</span><span className="tnum">{money(b.subtotal)}</span></div>
            {b.discount > 0 && <div className="flex justify-between text-ok"><span>Скидка{b.promo ? ` ${b.promo}` : ''}</span><span className="tnum">−{money(b.discount)}</span></div>}
            {b.delivery > 0 && <div className="flex justify-between"><span className="text-muted">Доставка</span><span className="tnum">{money(b.delivery)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Итого</span><span className="tnum">{money(b.total)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Оплачено ({PAY[b.paymentMethod]})</span><span className="tnum">{money(b.paid)}</span></div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1"><motion.div className="h-full bg-ok" initial={{ width: 0 }} animate={{ width: `${(b.paid / b.total) * 100}%` }} /></div>
            {edit && b.paid < b.total && b.status !== 'cancelled' && (
              <div className="flex gap-2 mt-2">
                <input id="bk-pay" className="field h-10 tnum" inputMode="numeric" placeholder={String(b.total - b.paid)} value={pay} onChange={e => setPay(e.target.value.replace(/\D/g, ''))} />
                <Button variant="soft" className="h-10 shrink-0" onClick={() => { addPayment(b.id, Number(pay || b.total - b.paid)); setPay(''); toast('Оплата учтена') }}><Wallet className="size-4" />Внести</Button>
              </div>
            )}
          </div>
          <ContractBlock b={b} />
          <div>
            <div className="label mb-2">История</div>
            <ol className="relative border-l border-line ml-1.5 flex flex-col gap-3">
              {[...b.history].reverse().map((h, i) => (
                <li key={i} className="pl-4 relative"><span className={cx('absolute -left-[5px] top-1.5 size-2', i === 0 ? 'bg-accent' : 'bg-line-2')} /><div className="text-sm">{h.text}</div><div className="text-xs text-muted">{h.by} · {dShort(h.at)}, {hm(h.at)}</div></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <Sheet open={cancelReason !== null} onClose={() => setCancelReason(null)} title={`Отменить ${b.code}?`} footer={<Button variant="danger" block onClick={() => { setBookingStatus(b.id, 'cancelled', cancelReason || 'без причины'); setCancelReason(null); toast('Бронь отменена, техника освобождена') }}>Отменить бронь</Button>}>
        <Field label="Причина"><input id="bk-cancel" className="field" value={cancelReason ?? ''} onChange={e => setCancelReason(e.target.value)} placeholder="Клиент перенёс съёмку" /></Field>
      </Sheet>
    </Sheet>
  )
}

const toLocal = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16) }

function CreateBooking({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { customers, products, units, bookings, settings, staffId, staff } = useStore()
  const me = staff.find(s => s.id === staffId)
  const [custQ, setCustQ] = useState('')
  const [custId, setCustId] = useState<string | null>(null)
  const [newCust, setNewCust] = useState({ name: '', phone: '' })
  const [city, setCity] = useState<CityId>(me?.city === 'astana' ? 'astana' : 'almaty')
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
  const [start, setStart] = useState(d.getTime())
  const [end, setEnd] = useState(d.getTime() + 864e5)
  const [pq, setPq] = useState('')
  const [lines, setLines] = useState<{ id: string; qty: number }[]>([])
  const [source, setSource] = useState<Source>('phone')
  const [method, setMethod] = useState<PaymentMethod>('kaspi')
  const days = rentalDays(start, end)
  const found = pq.length > 1 ? products.filter(p => !p.hidden && matchProduct(p, pq)).slice(0, 6) : []
  const lineItems = lines.map(l => ({ ...l, p: products.find(p => p.id === l.id)!, free: freeUnits(units, bookings, l.id, city, start, end).length }))
  const pr = calcPrice(lineItems.map(l => ({ price: l.p.price, qty: l.qty })), days, settings)
  const custList = custQ ? customers.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(custQ.toLowerCase())).slice(0, 5) : []
  const okCust = custId || (newCust.name && newCust.phone.replace(/\D/g, '').length >= 10)
  const ok = okCust && lineItems.length && lineItems.every(l => l.free >= l.qty) && end > start

  const create = async () => {
    // общая база: бронь создаёт сервер (подбор единиц и защита от двойной брони)
    if (supabaseConfigured) {
      const r = await staffCreateBooking({ customerId: custId, newName: newCust.name, newPhone: newCust.phone, city, start, end, items: lineItems.map(l => ({ productId: l.id, qty: l.qty })) })
      if (!r.ok) { toast(r.error, { tone: 'bad' }); return }
      toast(`Бронь ${r.data.code} создана`)
      setLines([]); setCustId(null); setCustQ(''); setNewCust({ name: '', phone: '' })
      onCreated(r.data.id)
      return
    }
    const s = useStore.getState()
    let cid = custId
    let cs = s.customers
    if (!cid) { cid = uid('c'); cs = [{ id: cid, name: newCust.name, phone: newCust.phone, verified: false, blacklisted: false, createdAt: Date.now(), tags: ['Новый'] }, ...cs] }
    const items = lineItems.map(l => ({ productId: l.id, qty: l.qty, price: l.p.price, unitIds: freeUnits(s.units, s.bookings, l.id, city, start, end).slice(0, l.qty).map(u => u.id) }))
    const n = 1040 + s.bookings.length + 1
    const b: Booking = { id: uid('b'), code: `PX-${n}`, customerId: cid, city, items, start, end, days, subtotal: pr.subtotal, discount: pr.discount, delivery: 0, total: pr.total, paid: 0, paymentStatus: 'unpaid', paymentMethod: method, deliveryType: 'pickup', status: 'confirmed', source, managerId: staffId ?? undefined, createdAt: Date.now(), history: [{ at: Date.now(), by: me?.name.split(' ')[0] ?? '-', text: 'Создана менеджером и подтверждена' }] }
    useStore.setState({ bookings: [b, ...s.bookings], customers: cs })
    s.log('Создана бронь', b.code)
    toast(`Бронь ${b.code} создана`)
    setLines([]); setCustId(null); setCustQ(''); setNewCust({ name: '', phone: '' })
    onCreated(b.id)
  }

  return (
    <Sheet open={open} onClose={onClose} wide title="Новая бронь" footer={<div className="flex items-center gap-3"><div className="flex-1"><div className="tnum font-semibold text-lg">{money(pr.total)}</div><div className="text-xs text-muted">{daysWord(days)}{pr.discount ? `, скидка ${pr.percent}%` : ''}</div></div><Button size="lg" disabled={!ok} onClick={create}>Создать</Button></div>}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-3">
          <div className="label">Клиент</div>
          {custId ? (
            <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><div><div className="font-medium">{customers.find(c => c.id === custId)?.name}</div><div className="text-xs tnum text-muted">{customers.find(c => c.id === custId)?.phone}</div></div><button className="text-sm text-muted" onClick={() => setCustId(null)}>Сменить</button></div>
          ) : (
            <>
              <input id="nb-cust" className="field" placeholder="Найти по имени или телефону" value={custQ} onChange={e => setCustQ(e.target.value)} />
              {custList.map(c => <button key={c.id} onClick={() => setCustId(c.id)} className="flex justify-between text-left p-2.5 rounded-lg hover:bg-surface-2 text-sm"><span>{c.name}{c.blacklisted && <span className="text-bad"> · ЧС</span>}</span><span className="tnum text-muted">{c.phone}</span></button>)}
              <div className="text-xs text-faint">или новый клиент:</div>
              <div className="grid grid-cols-2 gap-2"><input id="nb-name" className="field" placeholder="Имя" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} /><input id="nb-phone" className="field tnum" placeholder="+7…" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} /></div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Город"><select id="nb-city" className="field" value={city} onChange={e => setCity(e.target.value as CityId)}><option value="almaty">Алматы</option><option value="astana">Астана</option></select></Field>
            <Field label="Источник"><select id="nb-src" className="field" value={source} onChange={e => setSource(e.target.value as Source)}>{Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Выдача"><input id="nb-start" type="datetime-local" className="field tnum text-sm" value={toLocal(start)} onChange={e => setStart(new Date(e.target.value).getTime())} /></Field>
            <Field label="Возврат"><input id="nb-end" type="datetime-local" className="field tnum text-sm" value={toLocal(end)} onChange={e => setEnd(new Date(e.target.value).getTime())} /></Field>
            <Field label="Оплата"><select id="nb-pay" className="field" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{Object.entries(PAY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="label">Техника</div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input id="nb-prod" className="field pl-10" placeholder="FX3, петлички, 600x…" value={pq} onChange={e => setPq(e.target.value)} />
          </div>
          {found.map(p => { const fr = freeUnits(units, bookings, p.id, city, start, end).length; return (
            <button key={p.id} disabled={!fr} onClick={() => { setLines(l => l.some(x => x.id === p.id) ? l : [...l, { id: p.id, qty: 1 }]); setPq('') }} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-2 text-left text-sm disabled:opacity-40">
              <Plus className="size-4 text-accent" /><span className="flex-1 truncate">{p.name}</span><span className={cx('text-xs', fr ? 'text-ok' : 'text-bad')}>{fr ? `своб. ${fr}` : 'занято'}</span><span className="tnum text-xs">{money(p.price)}</span>
            </button>
          ) })}
          <div className="flex flex-col gap-2">
            {lineItems.map(l => (
              <div key={l.id} className={cx('flex items-center gap-2 p-2 rounded-xl border', l.free < l.qty ? 'border-bad/50' : 'border-line')}>
                <span className="flex-1 text-sm truncate">{l.p.name}</span>
                <Stepper size="sm" value={l.qty} max={l.free} min={1} onChange={n => setLines(ls => ls.map(x => x.id === l.id ? { ...x, qty: n } : x))} />
                <button aria-label="Убрать" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))} className="size-8 grid place-items-center text-muted hover:text-bad"><Trash2 className="size-4" /></button>
              </div>
            ))}
            {!lineItems.length && <div className="text-sm text-faint py-4 text-center border border-dashed border-line rounded-xl">Найдите и добавьте технику</div>}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
