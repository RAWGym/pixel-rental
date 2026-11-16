import { useState } from 'react'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead } from './Admin'
import { Button, Field, Toggle, toast, Sheet, Badge } from '../ui/kit'
import { money, dShort, hm, relTime } from '../lib/format'
import type { CityId } from '../data/types'
import { currentTemplate } from '../lib/contract'
import { supabaseConfigured } from '../data/supabase'

/** Текст договора аренды: правит владелец, каждое сохранение — новая версия (подписанные договоры хранят свой текст) */
function ContractTemplateEditor() {
  const settings = useStore(s => s.settings)
  const add = useStore(s => s.addContractTemplate)
  const cur = currentTemplate(settings)
  const [body, setBody] = useState(cur.body)
  const [busy, setBusy] = useState(false)
  const dirty = body.trim() !== cur.body.trim()
  const save = async () => {
    if (body.trim().length < 50) return toast('Слишком короткий текст договора')
    setBusy(true)
    try {
      const t = { version: cur.version + 1, body: body.trim(), createdAt: Date.now() }
      if (supabaseConfigured) { const { saveTemplateRemote } = await import('../data/supabase'); const r = await saveTemplateRemote(t); if (!r.ok) return toast(r.error, { tone: 'bad' }) }
      add(body.trim()); toast(`Сохранено: версия ${t.version}`, { tone: 'ok' })
    } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3 md:col-span-2">
      <div className="flex items-center gap-2"><div className="font-semibold">Договор аренды</div><Badge tone="accent">версия {cur.version}</Badge><span className="ml-auto text-xs text-muted">от {dShort(cur.createdAt)}</span></div>
      <textarea id="contract-body" className="field min-h-[220px] text-sm leading-relaxed" value={body} onChange={e => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!dirty || busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить новую версию'}</Button>
        {dirty && <Button variant="ghost" onClick={() => setBody(cur.body)}>Отменить правки</Button>}
        <span className="text-xs text-muted">Уже подписанные договоры не меняются: в каждом сохранён свой текст и его хэш.</span>
      </div>
    </section>
  )
}

export function SettingsAdmin() {
  const { settings, updateSettings, resetDemo } = useStore()
  const [reset, setReset] = useState(false)
  const card = 'rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3'
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <PageHead title="Настройки" sub="Изменения сразу видны клиентам в приложении" />
      <div className="grid md:grid-cols-2 gap-4">
        <section className={card}>
          <div className="font-semibold">Скидки за срок аренды</div>
          {settings.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-muted w-6">от</span><input id={`tier-d-${i}`} aria-label="Суток" type="number" className="field h-10 tnum w-20" value={t.days} onChange={e => updateSettings({ tiers: settings.tiers.map((x, j) => j === i ? { ...x, days: Number(e.target.value) } : x) })} />
              <span className="text-sm text-muted">суток</span><input id={`tier-p-${i}`} aria-label="Процент" type="number" className="field h-10 tnum w-20" value={t.percent} onChange={e => updateSettings({ tiers: settings.tiers.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x) })} /><span className="text-sm text-muted">%</span>
              <button aria-label="Удалить" onClick={() => updateSettings({ tiers: settings.tiers.filter((_, j) => j !== i) })} className="ml-auto size-9 grid place-items-center text-muted hover:text-bad"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Button variant="soft" size="sm" onClick={() => updateSettings({ tiers: [...settings.tiers, { days: 30, percent: 40 }] })}><Plus className="size-4" />Ступень</Button>
        </section>
        <section className={card}>
          <div className="font-semibold">Промокоды</div>
          {settings.promos.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input id={`pc-${i}`} aria-label="Код" className="field h-10 tnum flex-1" value={p.code} onChange={e => updateSettings({ promos: settings.promos.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x) })} />
              <input id={`pcp-${i}`} aria-label="Процент" type="number" className="field h-10 tnum w-20" value={p.percent} onChange={e => updateSettings({ promos: settings.promos.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x) })} />
              <Badge>{p.uses} исп.</Badge>
              <Toggle checked={p.active} label="Активен" onChange={v => updateSettings({ promos: settings.promos.map((x, j) => j === i ? { ...x, active: v } : x) })} />
            </div>
          ))}
          <Button variant="soft" size="sm" onClick={() => updateSettings({ promos: [...settings.promos, { code: 'NEWCODE', percent: 5, active: false, uses: 0 }] })}><Plus className="size-4" />Промокод</Button>
          <p className="text-xs text-muted">Скидки не суммируются: клиент получает большую из двух, за срок или по коду.</p>
        </section>
        <section className={card}>
          <div className="font-semibold">Залог и доставка</div>
          <div className="flex items-center justify-between gap-3"><span className="text-sm">Брать залог с новых клиентов</span><Toggle checked={settings.depositForNew} onChange={v => updateSettings({ depositForNew: v })} /></div>
          {(['almaty', 'astana'] as CityId[]).map(c => (
            <Field key={c} label={`Доставка, ${c === 'almaty' ? 'Алматы' : 'Астана'}, ₸`}><input id={`dlv-${c}`} type="number" className="field tnum" value={settings.deliveryFee[c]} onChange={e => updateSettings({ deliveryFee: { ...settings.deliveryFee, [c]: Number(e.target.value) } })} /></Field>
          ))}
        </section>
        {(['almaty', 'astana'] as CityId[]).map(c => { const p = settings.points[c]; const set = (patch: any) => updateSettings({ points: { ...settings.points, [c]: { ...p, ...patch } } }); return (
          <section key={c} className={card}>
            <div className="font-semibold">Точка: {c === 'almaty' ? 'Алматы' : 'Астана'}</div>
            <Field label="Адрес"><input id={`pt-a-${c}`} className="field" value={p.address} onChange={e => set({ address: e.target.value })} /></Field>
            <Field label="Режим работы (текст)"><input id={`pt-h-${c}`} className="field" value={p.hours} onChange={e => set({ hours: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="С, ч"><input id={`pt-o-${c}`} type="number" min={0} max={23} className="field tnum" value={p.open} onChange={e => set({ open: Number(e.target.value) })} /></Field>
              <Field label="До, ч"><input id={`pt-c-${c}`} type="number" min={1} max={24} className="field tnum" value={p.close} onChange={e => set({ close: Number(e.target.value) })} /></Field>
              <Field label="Телефон"><input id={`pt-p-${c}`} className="field tnum text-sm" value={p.phone} onChange={e => set({ phone: e.target.value })} placeholder="+7…" /></Field>
            </div>
          </section>
        ) })}
        {useStore.getState().can('settings') && <ContractTemplateEditor />}
      </div>
      <section className="rounded-2xl border border-bad/30 bg-bad/[0.05] p-4 flex items-center gap-3">
        <div className="flex-1"><div className="font-semibold">Демо-данные</div><div className="text-sm text-muted">Вернуть брони, заявки и настройки к исходному состоянию</div></div>
        <Button variant="danger" onClick={() => setReset(true)}><RotateCcw className="size-4" />Сбросить</Button>
      </section>
      <Sheet open={reset} onClose={() => setReset(false)} title="Сбросить демо-данные?" footer={<Button variant="danger" block onClick={() => { resetDemo(); toast('Сброшено') }}>Сбросить всё</Button>}>
        <p className="text-muted">Все изменения в этом браузере пропадут, и вы выйдете из админки.</p>
      </Sheet>
    </div>
  )
}

export function AuditAdmin() {
  const { audit, staff } = useStore()
  return (
    <div className="max-w-3xl">
      <PageHead title="Журнал действий" sub="Кто и что менял в админке" />
      <div className="rounded-2xl bg-surface divide-y divide-line">
        {audit.map(a => <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="w-28 shrink-0 text-xs text-muted">{dShort(a.at)}, {hm(a.at)}</span><span className="w-32 shrink-0 font-medium truncate">{staff.find(s => s.id === a.staffId)?.name.split(' ')[0] ?? '—'}</span><span className="flex-1 min-w-0 truncate">{a.action}{a.target && <span className="text-muted"> · {a.target}</span>}</span></div>)}
        {!audit.length && <div className="p-10 text-center text-muted">Пока пусто. Действия сотрудников появятся здесь.</div>}
      </div>
    </div>
  )
}
