import { useState, useEffect } from 'react'
import { Plus, Lock, Trash2 } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead } from './Admin'
import { Badge, Button, Sheet, Field, Toggle, cx, toast, Segmented } from '../ui/kit'
import type { Permission, Role, Staff } from '../data/types'
import { uid } from '../lib/rng'

export const PERMS: { id: Permission; label: string; group: string }[] = [
  { id: 'dashboard', label: 'Сводка', group: 'Общее' }, { id: 'finance', label: 'Финансы и выручка', group: 'Общее' },
  { id: 'bookings.view', label: 'Видеть брони', group: 'Брони' }, { id: 'bookings.edit', label: 'Создавать и менять', group: 'Брони' }, { id: 'bookings.cancel', label: 'Отменять', group: 'Брони' }, { id: 'calendar', label: 'Шахматка', group: 'Брони' },
  { id: 'products.view', label: 'Видеть товары', group: 'Каталог' }, { id: 'products.edit', label: 'Редактировать товары', group: 'Каталог' }, { id: 'pricing.edit', label: 'Цены и залоги', group: 'Каталог' }, { id: 'units.edit', label: 'Единицы, ТО, списание', group: 'Каталог' },
  { id: 'leads', label: 'Заявки', group: 'Клиенты' }, { id: 'customers', label: 'База клиентов', group: 'Клиенты' }, { id: 'customers.blacklist', label: 'Чёрный список', group: 'Клиенты' },
  { id: 'staff', label: 'Сотрудники и роли', group: 'Управление' }, { id: 'settings', label: 'Настройки', group: 'Управление' },
]
const PALETTE = ['#FF962E', '#5AB0FF', '#7EE08A', '#C9A7FF', '#F2C14E', '#FF7FA8']

export function StaffAdmin() {
  const { staff, roles, upsertStaff, upsertRole, removeRole, staffId } = useStore()
  const [tab, setTab] = useState<'staff' | 'roles'>('staff')
  const [edit, setEdit] = useState<Staff | null>(null)
  return (
    <div>
      <PageHead title="Сотрудники и роли" sub="Кто имеет доступ и что может делать" actions={tab === 'staff'
        ? <Button onClick={() => setEdit({ id: uid('s'), name: '', phone: '', roleId: 'manager', city: 'almaty', active: true, pin: String(Math.floor(1000 + Math.random() * 9000)), createdAt: Date.now() })}><Plus className="size-4" />Сотрудник</Button>
        : <Button onClick={() => { upsertRole({ id: uid('r'), name: 'Новая роль', color: PALETTE[roles.length % PALETTE.length], permissions: ['dashboard', 'bookings.view'] }); toast('Роль добавлена') }}><Plus className="size-4" />Роль</Button>} />
      <Segmented layoutId="staff-tab" className="max-w-sm mb-5" value={tab} onChange={setTab} options={[{ value: 'staff', label: `Сотрудники · ${staff.length}` }, { value: 'roles', label: `Роли · ${roles.length}` }]} />

      {tab === 'staff' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {staff.map(s => { const r = roles.find(r => r.id === s.roleId); return (
            <button key={s.id} onClick={() => setEdit(s)} className={cx('text-left rounded-2xl bg-surface p-4 flex items-center gap-3', !s.active && 'opacity-50')}>
              <span className="size-11 grid place-items-center rounded-xl font-semibold shrink-0" style={{ background: `${r?.color}22`, color: r?.color }}>{s.name.split(' ').map(w => w[0]).join('')}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{s.name}{s.id === staffId && <span className="text-xs text-muted"> (вы)</span>}</span><span className="block text-xs tnum text-muted">{s.phone}</span>
                <span className="flex gap-1 mt-1.5"><Badge><span style={{ color: r?.color }}>{r?.name}</span></Badge><Badge>{s.city === 'all' ? 'Все города' : s.city === 'almaty' ? 'Алматы' : 'Астана'}</Badge>{!s.active && <Badge tone="bad">Отключён</Badge>}</span></span>
            </button>
          ) })}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-line"><th className="text-left px-4 py-3 text-xs text-muted font-medium">Право</th>{roles.map(r => (
              <th key={r.id} className="px-3 py-3 min-w-28">
                {r.system ? <span className="flex items-center justify-center gap-1 font-semibold" style={{ color: r.color }}><Lock className="size-3" />{r.name}</span>
                  : <div className="flex items-center gap-1 justify-center"><input id={`role-${r.id}`} aria-label="Название роли" className="bg-transparent text-center font-semibold w-24 outline-none border-b border-transparent focus:border-accent" style={{ color: r.color }} value={r.name} onChange={e => upsertRole({ ...r, name: e.target.value })} />
                    {!staff.some(s => s.roleId === r.id) && <button aria-label="Удалить роль" onClick={() => { removeRole(r.id); toast('Роль удалена') }} className="text-faint hover:text-bad"><Trash2 className="size-3.5" /></button>}</div>}
                <div className="text-xs text-faint font-normal mt-0.5">{staff.filter(s => s.roleId === r.id).length} чел.</div>
              </th>))}</tr></thead>
            <tbody>
              {PERMS.map((p, i) => (
                <tr key={p.id} className={cx('border-b border-line/50 last:border-0', (i === 0 || PERMS[i - 1].group !== p.group) && 'border-t border-line')}>
                  <td className="px-4 py-2.5"><div>{p.label}</div>{(i === 0 || PERMS[i - 1].group !== p.group) && <div className="text-xs label">{p.group}</div>}</td>
                  {roles.map(r => { const on = r.permissions.includes(p.id); return (
                    <td key={r.id} className="text-center px-3 py-2.5">
                      <button disabled={r.system} aria-label={`${r.name}: ${p.label}`} onClick={() => upsertRole({ ...r, permissions: on ? r.permissions.filter(x => x !== p.id) : [...r.permissions, p.id] })}
                        className={cx('size-6 inline-grid place-items-center border-2 transition-colors', on ? 'bg-accent border-accent' : 'border-line-2 hover:border-muted', r.system && 'opacity-60')}>
                        {on && <span className="size-2 bg-accent-ink" />}
                      </button>
                    </td>) })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <StaffEditor s={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function StaffEditor({ s, onClose }: { s: Staff | null; onClose: () => void }) {
  const { roles, upsertStaff, staffId } = useStore()
  const [f, setF] = useState(s)
  useEffect(() => setF(s), [s])
  if (!f) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const self = f.id === staffId
  return (
    <Sheet open={!!s} onClose={onClose} title={f.name || 'Новый сотрудник'} footer={<Button block disabled={!f.name.trim() || f.pin.length !== 4} onClick={() => { upsertStaff(f); toast('Сохранено'); onClose() }}>Сохранить</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Имя и фамилия"><input id="st-name" className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Телефон"><input id="st-phone" className="field tnum" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Роль"><select id="st-role" disabled={self} className="field" value={f.roleId} onChange={e => setF({ ...f, roleId: e.target.value })}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Город"><select id="st-city" className="field" value={f.city} onChange={e => setF({ ...f, city: e.target.value as any })}><option value="all">Все</option><option value="almaty">Алматы</option><option value="astana">Астана</option></select></Field>
        </div>
        <Field label="PIN для входа" hint="4 цифры"><input id="st-pin" className="field tnum" maxLength={4} inputMode="numeric" value={f.pin} onChange={e => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
        <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><span className="text-sm">Доступ включён</span><Toggle checked={f.active} onChange={v => !self && setF({ ...f, active: v })} /></div>
        {self && <div className="text-xs text-muted">Свою роль и доступ поменять нельзя, чтобы случайно не потерять вход.</div>}
      </div>
    </Sheet>
  )
}
