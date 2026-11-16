import { useMemo, useState, useEffect } from 'react'
import { Search, ShieldCheck, Ban, Clock, Check, X } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead, NoAccess, useAdminNav } from './Admin'
import { Badge, Button, Sheet, Field, Toggle, cx, toast } from '../ui/kit'
import { money, dShort, relTime } from '../lib/format'
import { verificationOf, VERIFICATION_LABEL, type Customer } from '../data/types'
import { api } from '../data/api'
import { STATUS_ADMIN } from './BookingsAdmin'

export function CustomersAdmin() {
  const { customers, bookings } = useStore()
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'vip' | 'new' | 'black'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const focus = useAdminNav(s => s.focus)
  const upsertCustomer = useStore(s => s.upsertCustomer)
  // переход из поиска или «+ Клиент»
  useEffect(() => {
    if (!focus) return
    if (focus === 'create') { const id = `c-${Date.now().toString(36)}`; upsertCustomer({ id, name: 'Новый клиент', phone: '+7 ', verified: false, blacklisted: false, createdAt: Date.now(), tags: ['Новый'] }); setOpen(id) }
    else if (customers.some(c => c.id === focus)) setOpen(focus)
  }, [focus])
  const stats = useMemo(() => { const m = new Map<string, { n: number; sum: number; last: number }>(); for (const b of bookings) { if (b.status === 'cancelled') continue; const s = m.get(b.customerId) ?? { n: 0, sum: 0, last: 0 }; s.n++; s.sum += b.total; s.last = Math.max(s.last, b.start); m.set(b.customerId, s) } return m }, [bookings])
  const list = customers.filter(c => `${c.name} ${c.phone} ${c.company ?? ''}`.toLowerCase().includes(q.toLowerCase()) && (f === 'all' || (f === 'black' && c.blacklisted) || (f === 'new' && !c.verified) || (f === 'vip' && (stats.get(c.id)?.n ?? 0) >= 5)))
    .sort((a, b) => (stats.get(b.id)?.sum ?? 0) - (stats.get(a.id)?.sum ?? 0))
  return (
    <div>
      <PageHead title="Клиенты" sub={`${customers.length} в базе`} />
      <VerificationQueue />
      <div className="flex flex-col md:flex-row gap-2 mb-3"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="cu-q" className="field pl-10 h-11" placeholder="Имя, телефон, компания" value={q} onChange={e => setQ(e.target.value)} /></div></div>
      <div className="flex gap-1.5 mb-4">{([['all', 'Все'], ['vip', '5+ броней'], ['new', 'Не проверены'], ['black', 'Чёрный список']] as const).map(([id, l]) => <button key={id} onClick={() => setF(id)} className={cx('h-8 px-3 rounded-full text-sm whitespace-nowrap border', f === id ? 'bg-accent text-accent-ink border-accent font-semibold' : 'border-line hover:border-line-2')}>{l}</button>)}</div>
      <div className="rounded-2xl bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-left text-xs text-muted border-b border-line">{['Клиент', 'Телефон', 'Броней', 'Сумма', 'Последняя', 'Статус'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{list.map(c => { const s = stats.get(c.id); return (
            <tr key={c.id} onClick={() => setOpen(c.id)} className="border-b border-line/60 last:border-0 hover:bg-surface-2 cursor-pointer">
              <td className="px-4 py-3"><div className="font-medium">{c.name}</div>{c.company && <div className="text-xs text-muted">{c.company}</div>}</td>
              <td className="px-4 py-3 tnum text-muted">{c.phone}</td>
              <td className="px-4 py-3 tnum">{s?.n ?? 0}</td>
              <td className="px-4 py-3 tnum">{money(s?.sum ?? 0)}</td>
              <td className="px-4 py-3 text-muted">{s?.last ? dShort(s.last) : '—'}</td>
              <td className="px-4 py-3"><div className="flex gap-1">{c.blacklisted ? <Badge tone="bad">ЧС</Badge> : (() => { const v = verificationOf(c); return <Badge tone={v === 'verified' ? 'ok' : v === 'pending' ? 'warn' : v === 'rejected' ? 'bad' : 'muted'}>{VERIFICATION_LABEL[v]}</Badge> })()}{c.tags.filter(t => t !== 'Новый').map(t => <Badge key={t}>{t}</Badge>)}</div></td>
            </tr>) })}</tbody>
        </table>
      </div>
      <CustomerSheet id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function CustomerSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { customers, bookings, upsertCustomer } = useStore()
  const can = useStore(s => s.can)
  const go = useAdminNav(s => s.go)
  const c0 = customers.find(c => c.id === id)
  const [c, setC] = useState<Customer | undefined>(c0)
  useEffect(() => setC(c0), [id])
  if (!c) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const bs = bookings.filter(b => b.customerId === c.id).sort((a, b) => b.start - a.start)
  return (
    <Sheet open={!!id} onClose={onClose} wide title={c.name} footer={<div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Закрыть</Button><Button onClick={() => { upsertCustomer(c); toast('Клиент сохранён'); onClose() }}>Сохранить</Button></div>}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-3">
          <Field label="Имя"><input id="cs-name" className="field" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Телефон"><input id="cs-phone" className="field tnum" value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} /></Field><Field label="Компания"><input id="cs-company" className="field" value={c.company ?? ''} onChange={e => setC({ ...c, company: e.target.value })} /></Field></div>
          <Field label="Заметка для команды"><textarea id="cs-note" rows={3} className="field resize-none" value={c.note ?? ''} onChange={e => setC({ ...c, note: e.target.value })} placeholder="Например: всегда берёт FX3 с клеткой" /></Field>
          <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><span className="text-sm flex items-center gap-2"><ShieldCheck className="size-4 text-ok" />Документы проверены, без залога</span><Toggle checked={c.verified} onChange={v => setC({ ...c, verified: v })} /></div>
          {can('customers.blacklist') ? <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><span className="text-sm flex items-center gap-2"><Ban className="size-4 text-bad" />Чёрный список: онлайн-бронь запрещена</span><Toggle checked={c.blacklisted} onChange={v => setC({ ...c, blacklisted: v })} /></div> : <NoAccess what="чёрный список" />}
          <div className="text-xs text-faint">Клиент с {dShort(c.createdAt)}</div>
        </div>
        <div>
          <div className="label mb-2">Брони · {bs.length}</div>
          <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
            {bs.map(b => <button key={b.id} onClick={() => { onClose(); go('bookings', b.id) }} className="flex items-center gap-3 p-2.5 rounded-xl border border-line hover:border-line-2 text-left text-sm"><span className="tnum">{b.code}</span><span className="text-muted flex-1">{dShort(b.start)}</span><Badge tone={STATUS_ADMIN[b.status].tone}>{STATUS_ADMIN[b.status].label}</Badge><span className="tnum">{money(b.total)}</span></button>)}
            {!bs.length && <div className="text-sm text-muted">Броней пока нет</div>}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

const REASONS = ['Фото нечитаемо или с бликами', 'Видна не вся карта', 'Документ просрочен', 'Данные не совпадают с ИИН']

/** Очередь верификации: новые клиенты прислали сканы удостоверения */
function VerificationQueue() {
  const customers = useStore(s => s.customers)
  const queue = customers.filter(c => verificationOf(c) === 'pending').sort((a, b) => (a.consentAt ?? 0) - (b.consentAt ?? 0))
  const [open, setOpen] = useState<string | null>(null)
  if (!queue.length) return null
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2"><Clock className="size-4 text-warn" /><span className="font-semibold">Очередь верификации</span><Badge tone="warn">{queue.length}</Badge></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {queue.map(c => (
          <button key={c.id} onClick={() => setOpen(c.id)} className="press flex items-center gap-3 rounded-2xl bg-surface p-3 text-left hover:bg-surface-2">
            <span className="flex -space-x-3 shrink-0">
              {[c.idFront, c.idBack].map((src, i) => src ? <img key={i} src={src} alt="" className="h-11 aspect-[1.585/1] object-cover rounded-lg border-2 border-surface" /> : null)}
            </span>
            <span className="flex-1 min-w-0"><span className="block font-medium truncate">{c.name}</span><span className="block text-xs text-muted tnum truncate">{c.phone} · ИИН {c.iin ?? '—'}</span></span>
            <span className="text-xs text-faint shrink-0">{c.consentAt ? relTime(c.consentAt) : ''}</span>
          </button>
        ))}
      </div>
      <ReviewSheet id={open} onClose={() => setOpen(null)} />
    </section>
  )
}

function ReviewSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const c = useStore(s => s.customers.find(c => c.id === id))
  const bookings = useStore(s => s.bookings)
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  useEffect(() => { setReject(false); setReason('') }, [id])
  if (!c) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const waiting = bookings.filter(b => b.customerId === c.id && b.awaitingVerification).length
  const decide = async (ok: boolean) => {
    await api.reviewCustomer(c.id, ok, ok ? undefined : reason.trim())
    toast(ok ? `${c.name.split(' ')[0]}: профиль подтверждён` : 'Отклонено, клиент увидит причину')
    onClose()
  }
  return (
    <Sheet open={!!id} onClose={onClose} wide title={`Проверка: ${c.name}`}
      footer={reject ? (
        <div className="flex gap-2"><Button variant="soft" onClick={() => setReject(false)}>Назад</Button><Button block variant="danger" disabled={reason.trim().length < 3} onClick={() => decide(false)}><X className="size-4" /> Отклонить</Button></div>
      ) : (
        <div className="flex gap-2"><Button variant="soft" onClick={() => setReject(true)}>Отклонить…</Button><Button block onClick={() => decide(true)}><Check className="size-4" /> Подтвердить</Button></div>
      )}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[['Телефон', c.phone], ['ИИН', c.iin ?? '—'], ['Email', c.email ?? '—'], ['Согласие', c.consentAt ? dShort(c.consentAt) : '—']].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 p-3 min-w-0"><div className="text-xs text-muted">{l}</div><div className="tnum truncate">{v}</div></div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[['Лицевая сторона', c.idFront], ['Обратная сторона', c.idBack]].map(([l, src]) => (
            <figure key={l} className="flex flex-col gap-1.5 min-w-0">
              <figcaption className="text-xs text-muted">{l}</figcaption>
              {src ? <button onClick={() => setZoom(src!)} className="block"><img src={src} alt={l} className="w-full aspect-[1.585/1] object-cover rounded-xl bg-surface-2" /></button>
                : <div className="w-full aspect-[1.585/1] rounded-xl bg-surface-2 grid place-items-center text-sm text-muted">Нет фото</div>}
            </figure>
          ))}
        </div>
        {waiting > 0 && <div className="text-sm text-warn">Ждут верификации броней: {waiting}. После подтверждения пометка снимется.</div>}
        {reject && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r} onClick={() => setReason(r)} className={cx('h-8 px-3 rounded-full text-sm', reason === r ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg')}>{r}</button>)}</div>
            <Field label="Причина (увидит клиент)"><textarea id="rv-reason" rows={2} className="field resize-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="Например: переснимите обратную сторону без бликов" /></Field>
          </div>
        )}
      </div>
      {zoom && <button className="fixed inset-0 z-[95] bg-black/90 grid place-items-center p-4" onClick={() => setZoom(null)} aria-label="Закрыть"><img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" /></button>}
    </Sheet>
  )
}
