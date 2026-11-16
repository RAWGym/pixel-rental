import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowLeft, PackageCheck, PackageOpen, ShieldCheck, ShieldAlert, Phone, Clock, Undo2, AlertTriangle, IdCard } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead, NoAccess, useAdminNav } from './Admin'
import { Seg } from './Chrome'
import { Badge, Button, cx, toast, haptic, ProductArt } from '../ui/kit'
import { money, dWithTime, daysWord } from '../lib/format'
import { freeUnits } from '../lib/availability'
import { verificationOf, VERIFICATION_LABEL, type Booking, type Contract, type IssueChecklist, type ReturnCheck } from '../data/types'
import { buildSnapshot, currentTemplate, sha256 } from '../lib/contract'
import { supabaseConfigured } from '../data/supabase'
import { SignatureScreen, type SignatureResult } from './SignatureScreen'
import { ContractBlock } from './ContractBlock'

type Tab = 'out' | 'onhand' | 'in'
const DAY = 864e5
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer select-none transition-colors', checked ? 'bg-ok/10' : 'bg-surface-2 hover:bg-surface-3', disabled && 'opacity-50 pointer-events-none')}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="size-5 accent-[var(--color-accent)] shrink-0" />
      <span className="text-sm">{children}</span>
    </label>
  )
}

export function IssueAdmin() {
  const { bookings, customers } = useStore()
  const can = useStore(s => s.can)
  const { focus } = useAdminNav()
  const [tab, setTab] = useState<Tab>('out')
  const [city, setCity] = useState<'all' | 'almaty' | 'astana'>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  useEffect(() => {
    if (!focus) return
    const b = bookings.find(x => x.id === focus); if (!b) return
    setTab(b.status === 'issued' ? (b.end < startOfDay() + DAY ? 'in' : 'onhand') : 'out'); setSel(b.id)
  }, [focus])
  const now = Date.now(), t0 = startOfDay()
  const cust = (id: string) => customers.find(c => c.id === id)
  const lists = useMemo(() => {
    const out = bookings.filter(b => (b.status === 'new' || b.status === 'confirmed') && b.code && b.end > now - DAY).sort((a, b) => a.start - b.start)
    const onhand = bookings.filter(b => b.status === 'issued').sort((a, b) => a.end - b.end)
    const inn = onhand.filter(b => b.end < t0 + DAY)
    return { out, onhand, in: inn }
  }, [bookings])
  const ql = q.trim().toLowerCase().replace(/\s/g, '')
  const list = lists[tab].filter(b => (city === 'all' || b.city === city) && (!ql || (() => { const c = cust(b.customerId); return [b.code, c?.name, c?.phone].some(v => v?.toLowerCase().replace(/\s/g, '').includes(ql)) })()))
  const selected = bookings.find(b => b.id === sel)
  if (!can('issue')) return <><PageHead title="Выдача" /><NoAccess what="выдача и приёмка техники" /></>

  return (
    <div>
      <PageHead title="Выдача" sub="Выдача техники по договору с подписью клиента и приёмка возвратов" />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Seg value={tab} onChange={v => { setTab(v); setSel(null) }} options={[
          { value: 'out', label: <span className="flex items-center gap-1.5">К выдаче<span className="tnum text-xs opacity-70">{lists.out.length}</span></span> },
          { value: 'onhand', label: <span className="flex items-center gap-1.5">На руках<span className="tnum text-xs opacity-70">{lists.onhand.length}</span></span> },
          { value: 'in', label: <span className="flex items-center gap-1.5">К приёму<span className="tnum text-xs opacity-70">{lists.in.length}</span></span> },
        ]} />
        <Seg size="sm" value={city} onChange={setCity} options={[{ value: 'all', label: 'Все точки' }, { value: 'almaty', label: 'Алматы' }, { value: 'astana', label: 'Астана' }]} />
        <label className="relative flex-1 min-w-[200px]"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="issue-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Код, имя или телефон" className="field h-10 pl-9" /></label>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 items-start">
        <ul className={cx('flex flex-col gap-2 min-w-0', selected && 'max-lg:hidden')}>
          {list.length === 0 && <li className="rounded-2xl bg-surface-2 p-6 text-center text-sm text-muted">{tab === 'out' ? 'Нет броней к выдаче' : tab === 'in' ? 'Сегодня возвратов нет' : 'Сейчас ничего не выдано'}</li>}
          {list.slice(0, 150).map((b, i) => {
            const c = cust(b.customerId), v = verificationOf(c), late = b.status === 'issued' && b.end < now
            const today = b.start >= t0 && b.start < t0 + DAY
            return (
              <li key={b.id} className="enter-item" style={{ ['--i' as any]: Math.min(i, 12) }}>
                <button onClick={() => setSel(b.id)} className={cx('press w-full text-left rounded-2xl p-3 flex items-center gap-3 transition-colors', sel === b.id ? 'bg-surface-3 ring-1 ring-accent/60' : 'bg-surface-2 hover:bg-surface-3')}>
                  <span className={cx('size-10 grid place-items-center rounded-xl shrink-0', late ? 'bg-bad/15 text-bad' : tab === 'out' ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info')}>{tab === 'out' ? <PackageOpen className="size-5" /> : <Undo2 className="size-5" />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2"><span className="font-semibold tnum">{b.code}</span>{late ? <Badge tone="bad">Просрочка</Badge> : today && tab === 'out' ? <Badge tone="accent">Сегодня</Badge> : null}{v !== 'verified' && tab === 'out' && <Badge tone="warn">{VERIFICATION_LABEL[v]}</Badge>}</span>
                    <span className="block text-sm truncate">{c?.name ?? '—'}</span>
                    <span className="block text-xs text-muted tnum truncate">{tab === 'out' ? `Выдача ${dWithTime(b.start)}` : `Возврат ${dWithTime(b.end)}`} · {b.items.reduce((n, i) => n + i.qty, 0)} поз. · {money(b.total)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className={cx('min-w-0', !selected && 'max-lg:hidden')}>
          {selected ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => setSel(null)} className="lg:hidden self-start text-sm text-muted flex items-center gap-1.5 py-1"><ArrowLeft className="size-4" />К списку</button>
              {selected.status === 'issued' ? <ReturnPanel key={selected.id} b={selected} onDone={() => setSel(null)} /> : selected.status === 'new' || selected.status === 'confirmed' ? <IssuePanel key={selected.id} b={selected} onDone={() => setSel(null)} /> : <ContractBlock b={selected} />}
            </div>
          ) : (
            <div className="max-lg:hidden rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted flex flex-col items-center gap-3"><PackageCheck className="size-8 text-faint" />Выберите бронь слева</div>
          )}
        </div>
      </div>
    </div>
  )
}

function CustomerCard({ b }: { b: Booking }) {
  const c = useStore(s => s.customers.find(x => x.id === b.customerId))
  const can = useStore(s => s.can)
  const v = verificationOf(c)
  const [scans, setScans] = useState<{ front?: string; back?: string }>({ front: c?.idFront, back: c?.idBack })
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!show || !supabaseConfigured || !c || !can('verify')) return
    import('../data/supabase').then(m => m.scanUrls(c.id)).then(setScans).catch(() => {})
  }, [show])
  return (
    <div className="rounded-2xl bg-surface-2 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">{c?.name ?? '—'}</span>
        {v === 'verified' ? <Badge tone="ok"><ShieldCheck className="size-3.5 inline -mt-0.5 mr-1" />Профиль подтверждён</Badge> : <Badge tone="warn"><ShieldAlert className="size-3.5 inline -mt-0.5 mr-1" />{VERIFICATION_LABEL[v]}</Badge>}
        {c?.blacklisted && <Badge tone="bad">Чёрный список</Badge>}
      </div>
      <div className="text-sm text-muted flex items-center gap-1.5 tnum"><Phone className="size-3.5" />{c?.phone}{c?.iin && <span className="ml-2">ИИН {c.iin}</span>}</div>
      {(can('verify') || scans.front) && (
        <button onClick={() => setShow(s => !s)} className="self-start text-sm text-accent flex items-center gap-1.5"><IdCard className="size-4" />{show ? 'Скрыть удостоверение' : 'Сверить с удостоверением'}</button>
      )}
      {show && (
        <div className="grid grid-cols-2 gap-2">
          {(['front', 'back'] as const).map(s => <div key={s} className="aspect-[1.58] rounded-xl bg-surface-3 overflow-hidden grid place-items-center">{scans[s] ? <img src={scans[s]} alt={s === 'front' ? 'Лицевая сторона' : 'Обратная сторона'} className="w-full h-full object-cover" /> : <span className="text-xs text-muted">Скана нет</span>}</div>)}
        </div>
      )}
    </div>
  )
}

function Summary({ b }: { b: Booking }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="label mb-0.5">Выдача</div><div className="font-medium tnum">{dWithTime(b.start)}</div></div>
      <div className={cx('rounded-xl p-2.5', b.status === 'issued' && b.end < Date.now() ? 'bg-bad/15' : 'bg-surface-2')}><div className="label mb-0.5">Возврат</div><div className="font-medium tnum">{dWithTime(b.end)}</div></div>
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="label mb-0.5">Итого · {daysWord(b.days)}</div><div className="font-medium tnum">{money(b.total)}</div><div className={cx('text-xs tnum', b.paid >= b.total ? 'text-ok' : 'text-warn')}>оплачено {money(b.paid)}</div></div>
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="label mb-0.5">Залог</div><div className="font-medium tnum">{money(b.deposit)}</div></div>
    </div>
  )
}

function IssuePanel({ b, onDone }: { b: Booking; onDone: () => void }) {
  const s = useStore()
  const c = s.customers.find(x => x.id === b.customerId)
  const v = verificationOf(c)
  const canOverride = s.can('issue.override')
  // единицы техники: по позициям, можно заменить на свободную того же товара
  const [units, setUnits] = useState<Record<string, string[]>>(() => Object.fromEntries(b.items.map(i => [i.productId, [...i.unitIds]])))
  const [ch, setCh] = useState<IssueChecklist>({ complete: false, condition: false, payment: b.paid >= b.total, deposit: b.deposit === 0, note: '' })
  const [override, setOverride] = useState(false)
  const [signing, setSigning] = useState(false)
  const [busy, setBusy] = useState(false)
  const tpl = currentTemplate(s.settings)
  const changed = b.items.some(i => (units[i.productId] ?? []).join() !== i.unitIds.join())
  const filled = b.items.every(i => (units[i.productId] ?? []).filter(Boolean).length === i.qty && new Set(units[i.productId]).size === i.qty)
  const badUnit = b.items.some(i => (units[i.productId] ?? []).some(id => { const u = s.units.find(x => x.id === id); return !u || u.maintenance || u.condition === 'repair' }))
  const verifiedOk = v === 'verified' || (override && canOverride)
  const ready = ch.complete && ch.condition && ch.payment && ch.deposit && filled && !badUnit && verifiedOk && !c?.blacklisted
  const snapshot = useMemo(() => buildSnapshot(b, c, s.products, s.units, units), [b, c, units])

  const done = async (r: SignatureResult) => {
    setBusy(true)
    try {
      if (supabaseConfigured) {
        const { issueRemote } = await import('../data/supabase')
        const res = await issueRemote({ bookingId: b.id, signerName: r.signerName, png: r.png, pngHash: r.hash, strokes: r.strokes, checklist: ch, unitIds: changed ? Object.values(units).flat() : undefined, override: v !== 'verified' && override })
        if (!res.ok) { toast(res.error, { tone: 'bad' }); return }
        s.issueBooking(b.id, res.data, changed ? units : undefined)
      } else {
        // демо: договор хранится в брони, подпись — data URL
        const me = s.staff.find(x => x.id === s.staffId)
        const termsHash = sha256(tpl.body)
        const contract: Contract = {
          id: `ct-${Date.now().toString(36)}`, bookingId: b.id, code: b.code, version: tpl.version, terms: tpl.body, termsHash, snapshot,
          docHash: sha256(tpl.body + '\n' + JSON.stringify(snapshot) + '\n' + r.hash), signerName: r.signerName, signaturePath: r.dataUrl, signatureHash: r.hash,
          checklist: ch, verifiedOverride: v !== 'verified', signedAt: Date.now(), issuedBy: s.staffId ?? '', issuedByName: me?.name ?? '—', userAgent: navigator.userAgent, status: 'signed',
        }
        s.issueBooking(b.id, contract, changed ? units : undefined)
      }
      haptic(30); toast(`${b.code}: выдана, договор подписан`, { tone: 'ok' })
      setSigning(false); onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><h2 className="text-xl font-semibold tnum">{b.code}</h2><Badge tone={b.status === 'new' ? 'warn' : 'info'}>{b.status === 'new' ? 'Новая' : 'Подтверждена'}</Badge><span className="ml-auto text-sm text-muted">{b.city === 'almaty' ? 'Алматы' : 'Астана'}</span></div>
      <CustomerCard b={b} />
      <Summary b={b} />
      <div className="rounded-2xl border border-line divide-y divide-line">
        {b.items.map(it => {
          const p = s.products.find(x => x.id === it.productId)
          const free = freeUnits(s.units, s.bookings, it.productId, b.city, b.start, b.end, b.id)
          const options = s.units.filter(u => u.productId === it.productId && u.city === b.city && (free.some(f => f.id === u.id) || it.unitIds.includes(u.id)))
          return (
            <div key={it.productId} className="p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">{p && <ProductArt p={p} size="sm" className="size-10 rounded-lg shrink-0" />}<div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p?.name ?? it.productId}</div><div className="text-xs text-muted tnum">{it.qty} шт · {money(it.price)}/сут</div></div></div>
              <div className="grid sm:grid-cols-2 gap-2">
                {Array.from({ length: it.qty }, (_, k) => {
                  const val = units[it.productId]?.[k] ?? ''
                  const u = s.units.find(x => x.id === val)
                  return (
                    <label key={k} className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Единица {it.qty > 1 ? k + 1 : ''} · серийный №</span>
                      <select className={cx('field h-10 py-0 tnum', u && (u.maintenance || u.condition === 'repair') && 'border-bad')} value={val}
                        onChange={e => setUnits(m => { const arr = [...(m[it.productId] ?? [])]; arr[k] = e.target.value; return { ...m, [it.productId]: arr } })}>
                        <option value="">— выбрать —</option>
                        {options.map(o => <option key={o.id} value={o.id} disabled={(units[it.productId] ?? []).includes(o.id) && o.id !== val}>{o.serial}{o.condition === 'new' ? ' · новая' : o.condition === 'worn' ? ' · б/у' : ''}{o.maintenance || o.condition === 'repair' ? ' · обслуживание' : ''}</option>)}
                      </select>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-2">
        <div className="label">Чек-лист выдачи</div>
        <Check checked={ch.complete} onChange={x => setCh({ ...ch, complete: x })}>Комплектность проверена (кабели, АКБ, крышки, кейс)</Check>
        <Check checked={ch.condition} onChange={x => setCh({ ...ch, condition: x })}>Состояние осмотрено, повреждения отмечены</Check>
        <Check checked={ch.payment} onChange={x => setCh({ ...ch, payment: x })}>Оплата аренды получена{b.paid < b.total ? ` (осталось ${money(b.total - b.paid)})` : ''}</Check>
        <Check checked={ch.deposit} onChange={x => setCh({ ...ch, deposit: x })} disabled={b.deposit === 0}>{b.deposit ? `Залог ${money(b.deposit)} получен` : 'Залог не требуется'}</Check>
        <textarea className="field min-h-[64px]" placeholder="Замечания: царапина на корпусе, нет бленды…" value={ch.note} onChange={e => setCh({ ...ch, note: e.target.value })} />
      </div>
      {c?.blacklisted && <div className="rounded-xl bg-bad/15 text-bad p-3 text-sm flex gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5" />Клиент в чёрном списке — выдача запрещена</div>}
      {v !== 'verified' && !c?.blacklisted && (
        <div className="rounded-xl bg-warn/10 p-3 text-sm flex flex-col gap-2">
          <div className="flex gap-2"><ShieldAlert className="size-4 shrink-0 mt-0.5 text-warn" /><span>Профиль клиента {v === 'pending' ? 'ещё на проверке' : v === 'rejected' ? 'отклонён' : 'не проверен'}. Выдача без проверки документов — под ответственность сотрудника, запишется в журнал.</span></div>
          {canOverride ? <Check checked={override} onChange={setOverride}>Сверил удостоверение лично, разрешаю выдачу</Check> : <span className="text-xs text-muted">Разрешить выдачу может менеджер или владелец.</span>}
        </div>
      )}
      {badUnit && <div className="text-sm text-bad">Одна из единиц на обслуживании — выберите другую.</div>}
      <Button size="lg" block disabled={!ready} onClick={() => { haptic(15); setSigning(true) }} className="h-14 text-base"><PackageCheck className="size-5" />Выдать</Button>
      {!ready && <div className="text-xs text-muted text-center -mt-1">{!filled ? 'Выберите единицы техники' : !(ch.complete && ch.condition && ch.payment && ch.deposit) ? 'Отметьте все пункты чек-листа' : !verifiedOk ? 'Нужна проверка профиля или разрешение менеджера' : ''}</div>}
      {signing && <SignatureScreen snapshot={snapshot} terms={tpl.body} version={tpl.version} defaultName={c?.name ?? ''} busy={busy} onCancel={() => setSigning(false)} onConfirm={done} />}
    </div>
  )
}

function ReturnPanel({ b, onDone }: { b: Booking; onDone: () => void }) {
  const s = useStore()
  const [ch, setCh] = useState<ReturnCheck>({ complete: false, condition: false, clean: false, note: '' })
  const [busy, setBusy] = useState(false)
  const late = b.end < Date.now()
  const accept = async () => {
    setBusy(true)
    try {
      if (supabaseConfigured) { const { returnRemote } = await import('../data/supabase'); const r = await returnRemote(b.id, ch, ch.note); if (!r.ok) return toast(r.error, { tone: 'bad' }) }
      s.returnBooking(b.id, ch, ch.note); haptic(20); toast(`${b.code}: техника принята`, { tone: 'ok' }); onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><h2 className="text-xl font-semibold tnum">{b.code}</h2>{late ? <Badge tone="bad"><Clock className="size-3.5 inline -mt-0.5 mr-1" />Просрочка</Badge> : <Badge tone="accent">На руках</Badge>}</div>
      <CustomerCard b={b} />
      <Summary b={b} />
      <ContractBlock b={b} />
      <div className="flex flex-col gap-2">
        <div className="label">Приёмка</div>
        <Check checked={ch.complete} onChange={x => setCh({ ...ch, complete: x })}>Всё возвращено по акту, серийные номера совпадают</Check>
        <Check checked={ch.condition} onChange={x => setCh({ ...ch, condition: x })}>Состояние без новых повреждений</Check>
        <Check checked={ch.clean} onChange={x => setCh({ ...ch, clean: x })}>Техника чистая, АКБ на месте</Check>
        <textarea className="field min-h-[64px]" placeholder="Замечания при возврате" value={ch.note} onChange={e => setCh({ ...ch, note: e.target.value })} />
      </div>
      <Button size="lg" block variant={ch.complete && ch.condition ? 'primary' : 'soft'} disabled={busy || !ch.complete} onClick={accept} className="h-14 text-base"><Undo2 className="size-5" />{busy ? 'Сохраняем…' : 'Принять'}</Button>
      {!ch.complete && <div className="text-xs text-muted text-center -mt-1">Отметьте, что всё возвращено</div>}
    </div>
  )
}
