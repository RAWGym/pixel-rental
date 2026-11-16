import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Download, Upload, MessageCircle, Phone, Trash2, ImagePlus, X as XIcon, Printer } from 'lucide-react'
import { useStore } from '../store/store'
import { useShop } from '../store/shop'
import { PageHead, NoAccess, useAdminNav } from './Admin'
import { Seg } from './Chrome'
import { Badge, Button, Sheet, Field, Toggle, cx, toast } from '../ui/kit'
import { money, dShort, hm, normalizeQuery } from '../lib/format'
import { DELIVERY_LABEL, SHOP_CAT_LABEL, SHOP_STATUS, TRADEIN_COND, shopImage, shopName, waLink, type ShopOrder, type ShopOrderStatus, type ShopProduct, type ShopPromo } from '../data/shop'

const LIVE = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const remote = () => import('../data/shopRemote')
type Tab = 'orders' | 'products' | 'settings'

export function ShopAdmin() {
  const can = useStore(s => s.can)
  const { focus } = useAdminNav()
  const [tab, setTab] = useState<Tab>('orders')
  const orders = useShop(s => s.orders), products = useShop(s => s.products)
  useEffect(() => { if (focus && orders.some(o => o.id === focus)) setTab('orders') }, [focus])
  if (!can('shop') && !can('shop.view')) return <><PageHead title="Магазин" /><NoAccess what="магазин" /></>
  const fresh = orders.filter(o => o.status === 'whatsapp').length
  const low = products.filter(p => p.active && p.stock === 0).length
  return (
    <div>
      <PageHead title="Магазин" sub={`${products.filter(p => p.active).length} товаров · ${orders.length} заказов`} />
      <div className="mb-4"><Seg value={tab} onChange={setTab} options={[
        { value: 'orders', label: <span className="flex items-center gap-1.5">Заказы{fresh > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-ink text-xs font-semibold grid place-items-center tnum">{fresh}</span>}</span> },
        { value: 'products', label: <span className="flex items-center gap-1.5">Товары и остатки{low > 0 && <span className="text-xs text-bad tnum" title="Нет в наличии">{low}</span>}</span> },
        ...(can('shop') ? [{ value: 'settings' as Tab, label: 'Настройки' }] : []),
      ]} /></div>
      <div key={tab} className="fade-in">{tab === 'orders' ? <Orders /> : tab === 'products' ? <Products /> : <SettingsTab />}</div>
    </div>
  )
}

/* ---------- заказы ---------- */
function Orders() {
  const orders = useShop(s => s.orders)
  const { focus } = useAdminNav()
  const [f, setF] = useState<'all' | ShopOrderStatus>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(focus && orders.some(o => o.id === focus) ? focus : null)
  const n = normalizeQuery(q).replace(/\s/g, '')
  const list = orders.filter(o => (f === 'all' || o.status === f) && (!n || [o.code, o.name, o.phone].some(v => normalizeQuery(v).replace(/\s/g, '').includes(n))))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Seg size="sm" value={f} onChange={setF} options={[{ value: 'all', label: 'Все' }, { value: 'whatsapp', label: 'Новые' }, { value: 'confirmed', label: 'Подтверждены' }, { value: 'paid', label: 'Оплачены' }, { value: 'done', label: 'Выданы' }, { value: 'cancelled', label: 'Отменены' }]} />
        <label className="relative flex-1 min-w-[200px]"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="so-search" className="field h-10 pl-9" placeholder="Код, имя или телефон" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      {list.length === 0 ? <div className="rounded-2xl bg-surface-2 p-8 text-center text-sm text-muted">Заказов нет</div> : (
        <div className="rounded-2xl border border-line overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-left text-xs text-muted border-b border-line">{['Заказ', 'Клиент', 'Состав', 'Получение', 'Сумма', 'Статус'].map(h => <th key={h} className={cx('px-4 py-3 font-medium', h === 'Сумма' && 'num')}>{h}</th>)}</tr></thead>
            <tbody>{list.map(o => (
              <tr key={o.id} onClick={() => setOpen(o.id)} className="border-b border-line/60 last:border-0 hover:bg-surface-2 cursor-pointer">
                <td className="px-4 py-2.5"><div className="font-semibold tnum">{o.code}</div><div className="text-xs text-muted">{dShort(o.createdAt)}, {hm(o.createdAt)}</div></td>
                <td className="px-4 py-2.5"><div className="truncate max-w-[180px]">{o.name}</div><div className="text-xs text-muted tnum">{o.phone}</div></td>
                <td className="px-4 py-2.5 text-muted"><div className="truncate max-w-[240px]">{o.items.map(i => i.title).join(', ')}</div>{o.tradein && <Badge tone="info" className="mt-1">Трейд-ин</Badge>}</td>
                <td className="px-4 py-2.5 text-muted">{DELIVERY_LABEL[o.delivery]}</td>
                <td className="num tnum font-medium">{money(o.total)}</td>
                <td className="px-4 py-2.5"><Badge tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <OrderSheet id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

const NEXT: Partial<Record<ShopOrderStatus, ShopOrderStatus>> = { whatsapp: 'confirmed', confirmed: 'paid', paid: 'packed', packed: 'done' }
function OrderSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const o = useShop(s => s.orders.find(x => x.id === id))
  const wa = useShop(s => s.settings.waPhone)
  const can = useStore(s => s.can)
  const [busy, setBusy] = useState(false)
  const [cancel, setCancel] = useState<string | null>(null)
  if (!o) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const setStatus = async (s: ShopOrderStatus, note?: string) => {
    setBusy(true)
    try {
      if (LIVE) { const r = await (await remote()).setShopOrderStatusRemote(o.id, s, note); if (!r.ok) return toast(r.error, { tone: 'bad' }) }
      else useShop.getState().setOrderStatus(o.id, s, note)
      toast(`${o.code}: ${SHOP_STATUS[s].label.toLowerCase()}`)
    } finally { setBusy(false) }
  }
  const next = NEXT[o.status]
  const t = o.tradein
  return (
    <Sheet open={!!id} onClose={onClose} wide title={<span className="flex items-center gap-3"><span className="tnum">{o.code}</span><Badge tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Badge></span>}
      footer={can('shop') && o.status !== 'cancelled' ? (
        <div className="flex flex-wrap gap-2">
          {next && <Button disabled={busy} onClick={() => setStatus(next)}>{SHOP_STATUS[next].label}</Button>}
          <Button variant="soft" onClick={() => printReceipt(o)}><Printer className="size-4" />Печать</Button>
          {o.status !== 'done' && <Button variant="danger" onClick={() => setCancel('')}>Отменить</Button>}
        </div>
      ) : <Button variant="soft" onClick={() => printReceipt(o)}><Printer className="size-4" />Печать</Button>}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="label mb-1">Клиент</div><div className="font-semibold">{o.name}</div>
            <div className="text-sm text-muted tnum flex items-center gap-1.5"><Phone className="size-3.5" />{o.phone}</div>
            <a href={waLink(o.phone, `Здравствуйте, ${o.name.split(' ')[0]}! Это Pixel Shop, по заказу ${o.code}.`)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent font-medium"><MessageCircle className="size-4" />Написать в WhatsApp</a>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-sm flex flex-col gap-1">
            <div><span className="text-muted">Получение: </span>{DELIVERY_LABEL[o.delivery]}{o.address ? `, ${o.address}` : ''}</div>
            <div><span className="text-muted">Оплата: </span>{o.payment}</div>
            {o.promo && <div><span className="text-muted">Промокод: </span>{o.promo}</div>}
            {o.comment && <div><span className="text-muted">Комментарий: </span>{o.comment}</div>}
          </div>
          {t && (
            <div className="rounded-xl border border-info/40 p-3 text-sm flex flex-col gap-1">
              <div className="font-semibold">Трейд-ин</div>
              <div>{t.model} · {TRADEIN_COND[t.condition]}</div>
              {t.complete && <div className="text-muted">Комплект: {t.complete}</div>}
              {t.shutter && <div className="text-muted">Пробег затвора: {t.shutter}</div>}
              {t.comment && <div className="text-muted">{t.comment}</div>}
              <div className="text-xs text-muted">Фото клиент присылает в WhatsApp.</div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line divide-y divide-line">
            {o.items.map(i => <div key={i.productId} className="p-2.5 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate">{i.title}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><span className="tnum shrink-0">{money(i.price * i.qty)}</span></div>)}
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-sm flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="text-muted">Товары</span><span className="tnum">{money(o.subtotal)}</span></div>
            {o.discount > 0 && <div className="flex justify-between text-ok"><span>Скидка</span><span className="tnum">−{money(o.discount)}</span></div>}
            {o.delivery !== 'pickup' && <div className="flex justify-between"><span className="text-muted">Доставка</span><span className="tnum">{o.deliveryFee == null ? 'уточнить' : money(o.deliveryFee)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Итого</span><span className="tnum">{money(o.total)}</span></div>
          </div>
          <div><div className="label mb-2">История</div>
            <ol className="relative border-l border-line ml-1.5 flex flex-col gap-3">{[...o.history].reverse().map((h, i) => <li key={i} className="pl-4 relative"><span className={cx('absolute -left-[5px] top-1.5 size-2', i === 0 ? 'bg-accent' : 'bg-line-2')} /><div className="text-sm">{h.text}</div><div className="text-xs text-muted">{h.by} · {dShort(h.at)}, {hm(h.at)}</div></li>)}</ol>
          </div>
        </div>
      </div>
      <Sheet open={cancel !== null} onClose={() => setCancel(null)} title={`Отменить ${o.code}?`} footer={<Button variant="danger" block onClick={async () => { await setStatus('cancelled', cancel || undefined); setCancel(null) }}>Отменить и вернуть остаток</Button>}>
        <Field label="Причина"><input id="so-cancel" className="field" value={cancel ?? ''} onChange={e => setCancel(e.target.value)} placeholder="Клиент передумал" /></Field>
      </Sheet>
    </Sheet>
  )
}

/** простая печатная форма заказа (накладная) */
function printReceipt(o: ShopOrder) {
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const rows = o.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.title)}</td><td>${i.qty}</td><td class=r>${money(i.price * i.qty)}</td></tr>`).join('')
  const html = `<!doctype html><meta charset=utf-8><title>${o.code}</title><style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.m{color:#666}</style>
<h1>Pixel Shop · заказ ${o.code}</h1><div class=m>${dShort(o.createdAt)}, ${hm(o.createdAt)}</div>
<p>${esc(o.name)}, ${esc(o.phone)}<br>${DELIVERY_LABEL[o.delivery]}${o.address ? ', ' + esc(o.address) : ''}<br>Оплата: ${esc(o.payment)}</p>
<table><tr><th>№</th><th>Товар</th><th>Кол.</th><th class=r>Сумма</th></tr>${rows}</table>
<p class=r>${o.discount ? `Скидка: −${money(o.discount)}<br>` : ''}${o.delivery !== 'pickup' ? `Доставка: ${o.deliveryFee == null ? 'уточняется' : money(o.deliveryFee)}<br>` : ''}<b>Итого: ${money(o.total)}</b></p>
<p style="margin-top:48px">Выдал ____________________ &nbsp; Получил ____________________</p>`
  const w = window.open('', '_blank'); if (!w) return toast('Разрешите всплывающие окна')
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 200)
}

/* ---------- товары и остатки ---------- */
function Products() {
  const products = useShop(s => s.products)
  const can = useStore(s => s.can)
  const edit = can('shop')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'all' | 'cameras' | 'lenses'>('all')
  const [open, setOpen] = useState<ShopProduct | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const n = normalizeQuery(q).replace(/\s/g, '')
  const list = products.filter(p => (cat === 'all' || p.category === cat) && (!n || normalizeQuery(shopName(p)).replace(/\s/g, '').includes(n))).sort((a, b) => a.sort - b.sort)
  const blank = (): ShopProduct => ({ id: `sp-${Date.now().toString(36)}`, brand: '', title: '', category: 'cameras', specs: [], includes: [], condition: 'new', price: 0, stock: 1, active: true, sort: products.length + 1, images: [], createdAt: Date.now() })
  const quick = (p: ShopProduct, patch: Partial<ShopProduct>) => useShop.getState().upsertProduct({ ...p, ...patch })
  const exportCsv = () => {
    const head = 'id;brand;title;category;price;old_price;stock;active'
    const rows = products.map(p => [p.id, p.brand, p.title, p.category, p.price, p.oldPrice ?? '', p.stock, p.active ? 1 : 0].join(';'))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head, ...rows].join('\n')], { type: 'text/csv' })); a.download = 'pixel-shop.csv'; a.click()
  }
  const importCsv = async (file: File) => {
    const lines = (await file.text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1)
    let n = 0
    for (const l of lines) {
      const [id, , , , price, old, stock, active] = l.split(';')
      const p = useShop.getState().products.find(x => x.id === id); if (!p) continue
      quick(p, { price: Number(price) || p.price, oldPrice: old ? Number(old) : undefined, stock: Math.max(0, Number(stock) || 0), active: active !== '0' }); n++
    }
    toast(`Обновлено: ${n}`)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Seg size="sm" value={cat} onChange={setCat} options={[{ value: 'all', label: 'Все' }, { value: 'cameras', label: 'Камеры' }, { value: 'lenses', label: 'Объективы' }]} />
        <label className="relative flex-1 min-w-[180px]"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="sp-search" className="field h-10 pl-9" placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} /></label>
        <Button variant="soft" className="h-10" onClick={exportCsv}><Download className="size-4" />CSV</Button>
        {edit && <><Button variant="soft" className="h-10" onClick={() => fileRef.current?.click()}><Upload className="size-4" />Импорт</Button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }} />
          <Button className="h-10" onClick={() => setOpen(blank())}><Plus className="size-4" />Товар</Button></>}
      </div>
      <div className="rounded-2xl border border-line overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-xs text-muted border-b border-line">{['Товар', 'Категория', 'Цена', 'Старая', 'Остаток', 'В продаже'].map(h => <th key={h} className={cx('px-4 py-3 font-medium', ['Цена', 'Старая', 'Остаток'].includes(h) && 'num')}>{h}</th>)}</tr></thead>
          <tbody>{list.map(p => (
            <tr key={p.id} className={cx('border-b border-line/60 last:border-0', !p.active && 'opacity-50')}>
              <td className="px-4 py-2"><button onClick={() => setOpen(p)} className="flex items-center gap-3 text-left"><span className="size-10 rounded-lg bg-white grid place-items-center overflow-hidden shrink-0">{shopImage(p.images[0]) && <img src={shopImage(p.images[0])} alt="" className="size-full object-contain p-0.5" />}</span><span className="font-medium">{shopName(p)}</span></button></td>
              <td className="px-4 py-2 text-muted">{SHOP_CAT_LABEL[p.category]}</td>
              <td className="num"><input aria-label="Цена" disabled={!edit} className="field h-9 w-28 tnum text-right" inputMode="numeric" defaultValue={p.price} onBlur={e => { const v = Number(e.target.value.replace(/\D/g, '')); if (v && v !== p.price) quick(p, { price: v }) }} /></td>
              <td className="num"><input aria-label="Старая цена" disabled={!edit} className="field h-9 w-28 tnum text-right" inputMode="numeric" defaultValue={p.oldPrice ?? ''} onBlur={e => { const v = Number(e.target.value.replace(/\D/g, '')) || undefined; if (v !== p.oldPrice) quick(p, { oldPrice: v }) }} /></td>
              <td className="num"><input aria-label="Остаток" disabled={!edit} className={cx('field h-9 w-20 tnum text-right', p.stock === 0 ? 'text-bad' : p.stock <= 1 ? 'text-warn' : '')} inputMode="numeric" defaultValue={p.stock} onBlur={e => { const v = Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0); if (v !== p.stock) quick(p, { stock: v }) }} /></td>
              <td className="px-4 py-2"><Toggle checked={p.active} label="В продаже" onChange={v => edit && quick(p, { active: v })} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {open && <ProductEditor p={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ProductEditor({ p, onClose }: { p: ShopProduct; onClose: () => void }) {
  const [f, setF] = useState(p)
  const edit = useStore(s => s.can('shop'))
  const set = (patch: Partial<ShopProduct>) => setF({ ...f, ...patch })
  const fileRef = useRef<HTMLInputElement>(null)
  const addPhoto = async (file: File) => {
    // сжимаем до 1600 px webp на устройстве
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/webp', 0.85))
    if (LIVE) { const r = await (await remote()).uploadShopPhoto(f.id, blob); if (!r.ok) return toast(r.error, { tone: 'bad' }); set({ images: [...f.images, r.data] }) }
    else set({ images: [...f.images, c.toDataURL('image/webp', 0.85)] })
  }
  const save = () => {
    if (!f.brand.trim() || !f.title.trim()) return toast('Укажите бренд и название')
    useShop.getState().upsertProduct({ ...f, brand: f.brand.trim(), title: f.title.trim(), specs: f.specs.map(s => s.trim()).filter(Boolean), includes: f.includes.map(s => s.trim()).filter(Boolean) })
    toast('Сохранено'); onClose()
  }
  return (
    <Sheet open onClose={onClose} wide title={shopName(f).trim() || 'Новый товар'} footer={edit ? <Button block onClick={save}>Сохранить</Button> : undefined}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2"><Field label="Бренд"><input id="sp-brand" disabled={!edit} className="field" value={f.brand} onChange={e => set({ brand: e.target.value })} /></Field><Field label="Модель"><input id="sp-title" disabled={!edit} className="field" value={f.title} onChange={e => set({ title: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Категория"><select id="sp-cat" disabled={!edit} className="field" value={f.category} onChange={e => set({ category: e.target.value as any })}><option value="cameras">Камеры</option><option value="lenses">Объективы</option></select></Field>
            <Field label="Состояние"><select id="sp-cond" disabled={!edit} className="field" value={f.condition} onChange={e => set({ condition: e.target.value as any })}><option value="new">Новое</option><option value="used">Б/у</option></select></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Цена, ₸"><input id="sp-price" disabled={!edit} className="field tnum" inputMode="numeric" value={f.price || ''} onChange={e => set({ price: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="Старая цена"><input id="sp-old" disabled={!edit} className="field tnum" inputMode="numeric" value={f.oldPrice ?? ''} onChange={e => set({ oldPrice: Number(e.target.value.replace(/\D/g, '')) || undefined })} /></Field>
            <Field label="Остаток"><input id="sp-stock" disabled={!edit} className="field tnum" inputMode="numeric" value={f.stock} onChange={e => set({ stock: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
          </div>
          <Field label="Описание"><textarea id="sp-desc" disabled={!edit} rows={3} className="field resize-none" value={f.description ?? ''} onChange={e => set({ description: e.target.value || undefined })} /></Field>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Характеристики" hint="Каждая с новой строки"><textarea id="sp-specs" disabled={!edit} rows={4} className="field resize-none text-sm" value={f.specs.join('\n')} onChange={e => set({ specs: e.target.value.split('\n') })} /></Field>
          <Field label="Комплектация" hint="Каждая позиция с новой строки"><textarea id="sp-inc" disabled={!edit} rows={3} className="field resize-none text-sm" value={f.includes.join('\n')} onChange={e => set({ includes: e.target.value.split('\n') })} /></Field>
          <div><div className="label mb-2">Фото</div>
            <div className="flex flex-wrap gap-2">
              {f.images.map((src, i) => (
                <div key={i} className="relative size-20 rounded-xl bg-white overflow-hidden">
                  <img src={shopImage(src)} alt="" className="size-full object-contain p-1" />
                  {edit && <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50">
                    <button aria-label="Раньше" disabled={i === 0} onClick={() => { const a = [...f.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ images: a }) }} className="px-1.5 text-white text-xs disabled:opacity-30">←</button>
                    <button aria-label="Удалить фото" onClick={() => set({ images: f.images.filter((_, j) => j !== i) })} className="px-1.5 text-white"><Trash2 className="size-3.5" /></button>
                    <button aria-label="Позже" disabled={i === f.images.length - 1} onClick={() => { const a = [...f.images]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set({ images: a }) }} className="px-1.5 text-white text-xs disabled:opacity-30">→</button>
                  </div>}
                </div>
              ))}
              {edit && <button onClick={() => fileRef.current?.click()} className="size-20 rounded-xl border border-dashed border-line-2 grid place-items-center text-muted hover:text-fg"><ImagePlus className="size-6" /></button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) addPhoto(file); e.target.value = '' }} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3"><span className="text-sm">В продаже</span><Toggle checked={f.active} onChange={v => set({ active: v })} /></label>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- настройки и промокоды ---------- */
function SettingsTab() {
  const settings = useShop(s => s.settings), promos = useShop(s => s.promos)
  const [s, setS] = useState(settings)
  const [pay, setPay] = useState(settings.payments.join('\n'))
  const [np, setNp] = useState<ShopPromo>({ code: '', percent: 5, active: true, uses: 0 })
  const dirty = JSON.stringify({ ...s, payments: pay.split('\n').map(x => x.trim()).filter(Boolean) }) !== JSON.stringify(settings)
  const save = () => {
    const wa = s.waPhone.replace(/\D/g, '')
    if (!/^7\d{10}$/.test(wa)) return toast('WhatsApp: формат 7XXXXXXXXXX')
    useShop.getState().updateSettings({ ...s, waPhone: wa, payments: pay.split('\n').map(x => x.trim()).filter(Boolean) }); toast('Сохранено')
  }
  const card = 'rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3'
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-5xl">
      <section className={card}>
        <div className="font-semibold">Заказы в WhatsApp</div>
        <Field label="Номер WhatsApp" hint="Формат 7XXXXXXXXXX"><input id="ss-wa" className="field tnum" value={s.waPhone} onChange={e => setS({ ...s, waPhone: e.target.value })} /></Field>
        <Field label="Часы магазина"><input id="ss-hours" className="field" value={s.hours} onChange={e => setS({ ...s, hours: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Доставка по Алматы, ₸"><input id="ss-city" className="field tnum" inputMode="numeric" value={s.deliveryCityFee} onChange={e => setS({ ...s, deliveryCityFee: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
          <Field label="По Казахстану, ₸" hint="Пусто: уточнит менеджер"><input id="ss-kz" className="field tnum" inputMode="numeric" value={s.deliveryKzFee ?? ''} onChange={e => setS({ ...s, deliveryKzFee: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Field>
        </div>
        <Field label="Способы оплаты" hint="Каждый с новой строки"><textarea id="ss-pay" rows={4} className="field resize-none text-sm" value={pay} onChange={e => setPay(e.target.value)} /></Field>
        <Button disabled={!dirty} onClick={save}>Сохранить</Button>
      </section>
      <section className={card}>
        <div className="font-semibold">Промокоды магазина</div>
        {promos.map(p => (
          <div key={p.code} className="flex items-center gap-2 text-sm">
            <span className="font-medium tnum flex-1">{p.code}</span><span className="text-muted">{p.percent ? `−${p.percent}%` : ''}{p.amount ? ` −${money(p.amount)}` : ''}</span>
            <Badge>{p.uses}{p.maxUses ? `/${p.maxUses}` : ''} исп.</Badge>
            <Toggle checked={p.active} label="Активен" onChange={v => useShop.getState().upsertPromo({ ...p, active: v })} />
            <button aria-label="Удалить" onClick={() => useShop.getState().removePromo(p.code)} className="size-8 grid place-items-center text-muted hover:text-bad"><XIcon className="size-4" /></button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-end">
          <Field label="Новый код"><input id="sp-code" className="field uppercase" value={np.code} onChange={e => setNp({ ...np, code: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
          <Field label="%"><input id="sp-pct" className="field tnum" inputMode="numeric" value={np.percent ?? ''} onChange={e => setNp({ ...np, percent: Number(e.target.value.replace(/\D/g, '')) || undefined })} /></Field>
          <Button variant="soft" className="h-11" disabled={np.code.length < 3 || !np.percent} onClick={() => { useShop.getState().upsertPromo(np); setNp({ code: '', percent: 5, active: true, uses: 0 }) }}><Plus className="size-4" /></Button>
        </div>
      </section>
    </div>
  )
}

/** для сводки: выручка магазина отдельно от аренды */
export function useShopStats(from: number, to: number) {
  const orders = useShop(s => s.orders)
  return useMemo(() => {
    const done = orders.filter(o => o.status !== 'cancelled' && o.createdAt >= from && o.createdAt < to)
    const revenue = done.reduce((a, o) => a + o.total, 0)
    const top = new Map<string, number>(); for (const o of done) for (const i of o.items) top.set(i.title, (top.get(i.title) ?? 0) + i.qty)
    return { count: done.length, revenue, avg: done.length ? Math.round(revenue / done.length) : 0, top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) }
  }, [orders, from, to])
}
