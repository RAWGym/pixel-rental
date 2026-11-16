import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Plus, Trash2, Eye, EyeOff, Percent, Wrench } from 'lucide-react'
import { useStore } from '../store/store'
import { PageHead, NoAccess, useAdminNav } from './Admin'
import { Badge, Button, Sheet, Field, Toggle, cx, toast, ProductArt } from '../ui/kit'
import { CATEGORIES, catName } from '../data/categories'
import type { CategoryId, Product, Unit, UnitCondition, CityId } from '../data/types'
import { money } from '../lib/format'
import { busyUnitIds } from '../lib/availability'
import { matchProduct } from '../client/Catalog'
import { uid } from '../lib/rng'

const COND: Record<UnitCondition, string> = { new: 'Новое', good: 'Хорошее', worn: 'Есть износ', repair: 'В ремонте' }

const NUM = new Set(["Цена/сут", "Алматы", "Астана"])

export function ProductsAdmin() {
  const { products, units, bookings } = useStore()
  const can = useStore(s => s.can)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [edit, setEdit] = useState<Product | null>(null)
  const [bulk, setBulk] = useState(false)
  const focus = useAdminNav(s => s.focus)
  useEffect(() => { if (!focus) return; if (focus === 'create') setEdit(blank()); else { const p = products.find(x => x.id === focus); if (p) setEdit(p) } }, [focus])
  const busy = useMemo(() => busyUnitIds(bookings, Date.now(), Date.now() + 1), [bookings])
  const list = useMemo(() => products.filter(p => (cat === 'all' || p.category === cat) && matchProduct(p, q)), [products, cat, q])
  const blank = (): Product => ({ id: uid('p-'), name: '', kind: 'Камера', brand: '', category: cat === 'all' ? 'cameras' : cat, price: 5000, isNew: true, specs: [], tags: [], createdAt: Date.now() })
  return (
    <div>
      <PageHead title="Товары и наличие" sub={`${products.length} позиций, ${units.length} единиц техники`} actions={<>
        {can('pricing.edit') && <Button variant="soft" onClick={() => setBulk(true)}><Percent className="size-4" />Изменить цены</Button>}
        {can('products.edit') && <Button onClick={() => setEdit(blank())}><Plus className="size-4" />Новый товар</Button>}</>} />
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="pr-q" className="field pl-10 h-11" placeholder="Название, бренд" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select id="pr-cat" className="field h-11 md:w-56" value={cat} onChange={e => setCat(e.target.value as any)}><option value="all">Все категории</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <div className="rounded-2xl bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-xs text-muted border-b border-line">{['Товар', 'Категория', 'Цена/сут', 'Алматы', 'Астана', 'Сейчас', ''].map(h => <th key={h} className={cx('px-4 py-3 font-medium', NUM.has(h) && 'num')}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map(p => {
              const us = units.filter(u => u.productId === p.id)
              const a = us.filter(u => u.city === 'almaty'), s = us.filter(u => u.city === 'astana')
              const out = us.filter(u => busy.has(u.id)).length, rep = us.filter(u => u.maintenance || u.condition === 'repair').length
              return (
                <tr key={p.id} onClick={() => setEdit(p)} className={cx('border-b border-line/60 last:border-0 hover:bg-surface-2 cursor-pointer', p.hidden && 'opacity-50')}>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3"><ProductArt p={p} size="sm" className="size-10 rounded-lg shrink-0" /><div className="min-w-0"><div className="font-medium truncate max-w-[280px] flex items-center gap-1.5">{p.name}{p.isNew && <Badge tone="accent" className="h-5 tnum">NEW</Badge>}</div><div className="text-xs text-muted">{p.brand} · {p.kind}</div></div></div></td>
                  <td className="px-4 py-2.5 text-muted">{catName(p.category)}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{a.length}</td>
                  <td className="num">{s.length}</td>
                  <td className="px-4 py-2.5"><div className="flex gap-1">{out > 0 && <Badge tone="accent">{out} на руках</Badge>}{rep > 0 && <Badge tone="warn"><Wrench className="size-3" />{rep}</Badge>}{!out && !rep && <span className="text-xs text-ok">всё на складе</span>}</div></td>
                  <td className="px-4 py-2.5">{p.hidden ? <EyeOff className="size-4 text-muted" /> : <Eye className="size-4 text-faint" />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ProductEditor p={edit} onClose={() => setEdit(null)} />
      <BulkPrice open={bulk} onClose={() => setBulk(false)} />
    </div>
  )
}

function ProductEditor({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const { units, upsertProduct, upsertUnit, removeUnit, bookings } = useStore()
  const can = useStore(s => s.can)
  const [f, setF] = useState<Product | null>(p)
  useEffect(() => setF(p), [p])
  const mine = units.filter(u => u.productId === p?.id)
  const edit = can('products.edit'), price = can('pricing.edit'), uedit = can('units.edit')
  const isNew = p && !useStore.getState().products.some(x => x.id === p.id)
  if (!f) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const set = (patch: Partial<Product>) => setF({ ...f, ...patch })
  const addUnit = (city: CityId) => upsertUnit({ id: `${f.id}#${uid()}`, productId: f.id, serial: `${f.brand.slice(0, 3).toUpperCase() || 'PXL'}-${Math.floor(10000 + Math.random() * 89999)}`, city, condition: 'new', maintenance: false })
  const hasActive = (u: Unit) => bookings.some(b => ['new', 'confirmed', 'issued'].includes(b.status) && b.items.some(i => i.unitIds.includes(u.id)))
  return (
    <Sheet open={!!p} onClose={onClose} wide title={isNew ? 'Новый товар' : f.name}
      footer={edit || price ? <div className="flex gap-2 justify-end"><Button variant="soft" onClick={onClose}>Закрыть</Button><Button disabled={!f.name.trim()} onClick={() => { upsertProduct({ ...f, name: f.name.trim(), includes: (f.includes ?? []).map(x => x.trim()).filter(Boolean), specs: f.specs.map(x => x.trim()).filter(Boolean) }); toast('Сохранено'); onClose() }}>Сохранить</Button></div> : <NoAccess what="редактировать товары" />}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-3">
          <Field label="Название"><input id="pe-name" disabled={!edit} className="field" value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Бренд"><input id="pe-brand" disabled={!edit} className="field" value={f.brand} onChange={e => set({ brand: e.target.value })} /></Field>
            <Field label="Тип"><input id="pe-kind" disabled={!edit} className="field" value={f.kind} onChange={e => set({ kind: e.target.value })} /></Field>
          </div>
          <Field label="Категория"><select id="pe-cat" disabled={!edit} className="field" value={f.category} onChange={e => set({ category: e.target.value as CategoryId })}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div>
            <Field label="Цена, ₸/сутки" hint={!price ? 'Нужно право «Цены»' : undefined}><input id="pe-price" disabled={!price} className="field tnum" inputMode="numeric" value={f.price} onChange={e => set({ price: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          </div>
          <Field label="Характеристики" hint="Каждая с новой строки"><textarea id="pe-specs" disabled={!edit} rows={4} className="field resize-none text-sm" value={f.specs.join('\n')} onChange={e => set({ specs: e.target.value.split('\n') })} /></Field>
          <Field label="Что в комплекте" hint="Каждая позиция с новой строки — видно клиенту на странице товара"><textarea id="pe-inc" disabled={!edit} rows={3} className="field resize-none text-sm" value={(f.includes ?? []).join('\n')} onChange={e => set({ includes: e.target.value.split('\n') })} placeholder={'Камера\nАккумулятор ×2\nЗарядное устройство'} /></Field>
          <GalleryEditor value={f.gallery ?? []} disabled={!edit} onChange={g => set({ gallery: g })} />
          <Field label="Описание"><textarea id="pe-desc" disabled={!edit} rows={3} className="field resize-none text-sm" value={f.description ?? ''} onChange={e => set({ description: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><span className="text-sm">Метка NEW</span><Toggle checked={f.isNew} onChange={v => edit && set({ isNew: v })} /></div>
          <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3"><span className="text-sm">Показывать в каталоге</span><Toggle checked={!f.hidden} onChange={v => edit && set({ hidden: !v })} /></div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><div className="label">Единицы техники · {mine.length}</div>{uedit && !isNew && <div className="flex gap-1"><Button size="sm" variant="soft" onClick={() => addUnit('almaty')}><Plus className="size-3.5" />Алматы</Button><Button size="sm" variant="soft" onClick={() => addUnit('astana')}><Plus className="size-3.5" />Астана</Button></div>}</div>
          {isNew && <div className="text-sm text-muted">Сохраните товар, затем добавьте единицы.</div>}
          {mine.map(u => (
            <div key={u.id} className="rounded-xl border border-line p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input id={`u-serial-${u.id}`} disabled={!uedit} className="field h-9 py-0 tnum text-sm flex-1" value={u.serial} onChange={e => upsertUnit({ ...u, serial: e.target.value })} />
                <select id={`u-city-${u.id}`} disabled={!uedit} className="field h-9 py-0 w-28 text-sm" value={u.city} onChange={e => upsertUnit({ ...u, city: e.target.value as CityId })}><option value="almaty">Алматы</option><option value="astana">Астана</option></select>
                {uedit && <button aria-label="Списать" title={hasActive(u) ? 'Есть активные брони' : 'Списать'} disabled={hasActive(u)} onClick={() => { removeUnit(u.id); toast('Единица списана') }} className="size-9 grid place-items-center rounded-lg text-muted hover:text-bad disabled:opacity-30"><Trash2 className="size-4" /></button>}
              </div>
              <div className="flex items-center gap-2">
                <select id={`u-cond-${u.id}`} disabled={!uedit} className="field h-9 py-0 text-sm flex-1" value={u.condition} onChange={e => upsertUnit({ ...u, condition: e.target.value as UnitCondition })}>{Object.entries(COND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap"><Toggle checked={u.maintenance} onChange={v => uedit && upsertUnit({ ...u, maintenance: v })} label="Обслуживание" />На ТО</label>
              </div>
              {hasActive(u) && <div className="text-xs text-accent">Есть активные брони на эту единицу</div>}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function BulkPrice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { products, upsertProduct } = useStore()
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [pct, setPct] = useState(10)
  const affected = products.filter(p => cat === 'all' || p.category === cat)
  const round = (n: number) => Math.round(n / 100) * 100
  return (
    <Sheet open={open} onClose={onClose} title="Массовое изменение цен" footer={<Button block onClick={() => { affected.forEach(p => upsertProduct({ ...p, price: round(p.price * (1 + pct / 100)) })); toast(`Цены обновлены: ${affected.length} позиций`); onClose() }}>Применить к {affected.length}</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Категория"><select id="bp-cat" className="field" value={cat} onChange={e => setCat(e.target.value as any)}><option value="all">Все</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Изменение, %" hint="Отрицательное значение снижает цены. Округляем до 100 ₸"><input id="bp-pct" type="number" className="field tnum" value={pct} onChange={e => setPct(Number(e.target.value))} /></Field>
        <div className="rounded-xl bg-surface-2 p-3 text-sm flex flex-col gap-1">{affected.slice(0, 4).map(p => <div key={p.id} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tnum shrink-0">{money(p.price)} → <b>{money(round(p.price * (1 + pct / 100)))}</b></span></div>)}{affected.length > 4 && <div className="text-xs text-muted">и ещё {affected.length - 4}</div>}</div>
      </div>
    </Sheet>
  )
}

/** Галерея товара: доп. фото (сжимаются до 1600px JPEG), порядок — стрелками */
function GalleryEditor({ value, onChange, disabled }: { value: string[]; onChange: (g: string[]) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const add = async (files: FileList | null) => {
    if (!files) return
    const out: string[] = []
    for (const f of [...files].slice(0, 8)) {
      const url = URL.createObjectURL(f)
      try {
        const img = new Image(); img.src = url; await img.decode()
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); out.push(c.toDataURL('image/jpeg', 0.8))
      } catch { toast('Не удалось прочитать фото', { tone: 'bad' }) } finally { URL.revokeObjectURL(url) }
    }
    onChange([...value, ...out])
  }
  const move = (i: number, d: number) => { const g = [...value]; const [x] = g.splice(i, 1); g.splice(Math.max(0, Math.min(g.length, i + d)), 0, x); onChange(g) }
  return (
    <div>
      <div className="text-sm text-muted mb-1.5 font-medium">Галерея <span className="text-faint font-normal">· доп. фото после основного</span></div>
      <div className="flex gap-2 flex-wrap">
        {value.map((src, i) => (
          <div key={i} className="relative size-20 rounded-xl overflow-hidden bg-surface-2">
            <img src={src} alt="" className="size-full object-cover" />
            {!disabled && <div className="absolute inset-x-0 bottom-0 flex justify-between bg-bg/80 text-xs">
              <button onClick={() => move(i, -1)} className="px-1.5 py-0.5" aria-label="Левее">←</button>
              <button onClick={() => onChange(value.filter((_, k) => k !== i))} className="px-1.5 py-0.5 text-bad" aria-label="Удалить">✕</button>
              <button onClick={() => move(i, 1)} className="px-1.5 py-0.5" aria-label="Правее">→</button>
            </div>}
          </div>
        ))}
        {!disabled && <button onClick={() => ref.current?.click()} className="press size-20 rounded-xl border-2 border-dashed border-line-2 grid place-items-center text-muted text-xs text-center">+ фото</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
    </div>
  )
}
