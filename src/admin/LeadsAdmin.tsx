import { useState } from 'react'
import { motion } from 'framer-motion'
import { Phone, Package } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead } from './Admin'
import { Badge, Button, Sheet, Field, cx, toast } from '../ui/kit'
import { relTime, dShort } from '../lib/format'
import type { Lead, LeadStatus, LeadType } from '../data/types'

const TYPE: Record<LeadType, { label: string; tone: 'accent' | 'info' | 'warn' | 'muted' | 'ok' }> = {
  selection: { label: 'Подбор', tone: 'accent' }, waitlist: { label: 'Ждёт технику', tone: 'warn' }, callback: { label: 'Перезвонить', tone: 'info' }, question: { label: 'Вопрос', tone: 'muted' }, production: { label: 'Продакшн / КП', tone: 'ok' },
}
const COLS: { id: LeadStatus; label: string; dot: string }[] = [{ id: 'new', label: 'Новые', dot: 'bg-accent' }, { id: 'in_progress', label: 'В работе', dot: 'bg-info' }, { id: 'done', label: 'Закрыты', dot: 'bg-ok' }, { id: 'lost', label: 'Потеряны', dot: 'bg-faint' }]

export function LeadsAdmin() {
  const { leads, staff, products, upsertLead, staffId, log } = useStore()
  const [open, setOpen] = useState<Lead | null>(null)
  const [type, setType] = useState<LeadType | 'all'>('all')
  const list = leads.filter(l => type === 'all' || l.type === type)
  const move = (l: Lead, status: LeadStatus) => { upsertLead({ ...l, status, assigneeId: l.assigneeId ?? staffId ?? undefined }); log(`Заявка → ${COLS.find(c => c.id === status)?.label}`, l.name) }
  return (
    <div>
      <PageHead title="Заявки" />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-4">
        {(['all', ...Object.keys(TYPE)] as const).map(t => <button key={t} onClick={() => setType(t as any)} className={cx('h-8 px-3 rounded-full text-sm whitespace-nowrap border', type === t ? 'bg-accent text-accent-ink border-accent font-semibold' : 'border-line hover:border-line-2')}>{t === 'all' ? 'Все' : TYPE[t as LeadType].label}</button>)}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4">
        {COLS.map(col => { const items = list.filter(l => l.status === col.id); return (
          <div key={col.id} className="shrink-0 w-[290px] lg:w-auto rounded-2xl bg-surface/60 p-2.5 flex flex-col gap-2 min-h-40">
            <div className="flex items-center gap-2 px-1.5 py-1"><span className={cx('size-2', col.dot)} /><span className="font-semibold text-sm">{col.label}</span><span className="tnum text-xs text-muted ml-auto">{items.length}</span></div>
            {items.map((l, i) => { const p = products.find(p => p.id === l.productId); return (
              <motion.button layout key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => setOpen(l)}
                className="text-left rounded-xl bg-surface p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2"><Badge tone={TYPE[l.type].tone}>{TYPE[l.type].label}</Badge><span className="text-xs text-faint">{relTime(l.createdAt)}</span></div>
                <div className="text-sm line-clamp-3">{l.text}</div>
                {p && <div className="text-xs text-accent flex items-center gap-1"><Package className="size-3" />{p.name}</div>}
                <div className="flex items-center justify-between text-xs text-muted"><span>{l.name} · {l.city === 'almaty' ? 'Алм' : 'Аст'}</span>{l.assigneeId && <span className="font-medium text-fg">{staff.find(s => s.id === l.assigneeId)?.name.split(' ')[0]}</span>}</div>
              </motion.button>
            ) })}
          </div>
        ) })}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? TYPE[open.type].label : ''}>
        {open && (() => { const l = leads.find(x => x.id === open.id) ?? open; return (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-surface-2 p-3"><div className="font-semibold">{l.name}</div><div className="tnum text-sm text-muted flex items-center gap-1.5 select-all"><Phone className="size-3.5" />{l.phone}</div><div className="text-xs text-faint mt-1">{relTime(l.createdAt)} · {l.city === 'almaty' ? 'Алматы' : 'Астана'}{l.dates ? ` · даты ${dShort(l.dates.start)}-${dShort(l.dates.end)}` : ''}</div></div>
            <p className="leading-relaxed">{l.text}</p>
            <Field label="Ответственный"><select id="ld-assignee" className="field" value={l.assigneeId ?? ''} onChange={e => upsertLead({ ...l, assigneeId: e.target.value || undefined })}><option value="">Не назначен</option>{staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <div><div className="label mb-2">Статус</div><div className="grid grid-cols-2 gap-2">{COLS.map(c => <Button key={c.id} variant={l.status === c.id ? 'primary' : 'soft'} onClick={() => { move(l, c.id); toast(`Заявка: ${c.label.toLowerCase()}`) }}>{c.label}</Button>)}</div></div>
          </div>
        ) })()}
      </Sheet>
    </div>
  )
}
