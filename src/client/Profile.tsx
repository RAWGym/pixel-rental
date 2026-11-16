import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MapPin, HelpCircle, LogOut, ChevronRight, ChevronLeft, ShieldCheck, Sparkles, Check, Phone, Navigation, Send, RotateCcw, LayoutDashboard, Plus } from 'lucide-react'
import { Columns3, Presentation, Clock, Download, ShoppingBag } from 'lucide-react'
import { useShop } from '../store/shop'
import { useShallow } from 'zustand/react/shallow'
import { useStore, useMe } from '../store/store'
import { useNav, useRoute } from '../store/nav'
import { Button, IconBtn, Badge, Empty, Segmented, Field, cx, toast, Sheet, CatIcon, ProductArt, haptic } from '../ui/kit'
import { ProductCard, DateBar, useAvailMap } from './common'
import { LoginCard } from './Bookings'
import { VerificationBadge } from './Auth'
import { useInstall } from './Install'
import { refreshApp } from './Refresh'
import { verificationOf } from '../data/types'
import { PRESETS, resolvePreset } from '../data/presets'
import { freeUnits } from '../lib/availability'
import { placeLine, money, num, daysWord, countdown, wd, dWithTime } from '../lib/format'
import { rentalDays } from '../lib/pricing'

function Row({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 text-left">
      <span className="size-9 grid place-items-center rounded-lg bg-surface-2 text-accent shrink-0">{icon}</span>
      <span className="flex-1 min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-xs text-muted truncate">{hint}</span>}</span>
      <ChevronRight className="size-4 text-faint" />
    </button>
  )
}

export function ProfileScreen() {
  const me = useMe()
  const { bookings, favorites, city, setCity, logout, resetDemo } = useStore(useShallow(s => ({ bookings: s.bookings, favorites: s.favorites, city: s.city, setCity: s.setCity, logout: s.logout, resetDemo: s.resetDemo })))
  const go = useNav(s => s.go)
  const [resetOpen, setResetOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const inst = useInstall()
  const compareN = useStore(s => (s.compare ?? []).length)
  const shopOrdersN = useShop(s => s.orders.length)
  const runDemo = useStore(s => s.runDemo)
  const reminders = useMemo(() => {
    if (!me) return []
    const now = Date.now()
    return bookings.filter(b => b.customerId === me.id && (b.status === 'issued' || ((b.status === 'confirmed' || b.status === 'new') && b.start - now < 3 * 86400000 && b.start > now)))
      .map(b => b.status === 'issued' ? { b, kind: 'return' as const, t: b.end, late: b.end < now } : { b, kind: 'pickup' as const, t: b.start, late: false })
      .sort((a, b) => a.t - b.t).slice(0, 3)
  }, [bookings, me])
  const stats = useMemo(() => {
    const mine = bookings.filter(b => b.customerId === me?.id && b.status !== 'cancelled')
    return { count: mine.length, saved: mine.reduce((s, b) => s + b.discount, 0), days: mine.reduce((s, b) => s + b.days, 0) }
  }, [bookings, me])
  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="font-display text-2xl font-semibold">Профиль</h1>
      <div className="grid gap-5 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] desk:gap-6 items-start">
      <div className="flex flex-col gap-5 min-w-0">
      {me ? (
        <div className="rounded-3xl bg-surface p-5 flex flex-col gap-4 relative overflow-hidden">
          <div className="relative flex items-center gap-4">
            <div className="size-14 shrink-0 grid place-items-center rounded-2xl bg-accent text-accent-ink font-semibold text-xl">{me.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
            <div className="flex-1 min-w-0"><div className="font-display font-semibold text-lg truncate">{me.name}</div><div className="tnum text-sm text-muted">{me.phone}</div></div>
          </div>
          <button onClick={() => go('verify')} className="relative press flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-left">
            <ShieldCheck className="size-5 text-muted shrink-0" />
            <span className="flex-1 min-w-0 text-sm">Проверка личности</span>
            <VerificationBadge v={verificationOf(me)} />
          </button>
          <div className="relative grid grid-cols-3 gap-2">
            {[[stats.count, 'броней'], [stats.days, 'суток съёмок'], [money(stats.saved), 'сэкономлено']].map(([v, l]) => (
              <div key={l as string} className="rounded-xl bg-surface-2 p-3"><div className="tnum font-semibold text-lg truncate">{v}</div><div className="text-xs text-muted">{l}</div></div>
            ))}
          </div>
        </div>
      ) : <LoginCard />}

      {/* напоминания: что вернуть и что забрать */}
      {reminders.length > 0 && (
        <div className="flex flex-col gap-2">
          {reminders.map(r => (
            <button key={r.b.id} onClick={() => go('booking', { id: r.b.id })} className={cx('press flex items-center gap-3 rounded-2xl p-3.5 text-left', r.late ? 'bg-bad/[0.1]' : 'bg-surface')}>
              <span className={cx('size-10 grid place-items-center rounded-xl shrink-0', r.late ? 'bg-bad/15 text-bad' : r.kind === 'return' ? 'bg-ok/12 text-ok' : 'bg-accent/12 text-accent')}><Clock className="size-5" /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{r.late ? 'Срок возврата прошёл' : r.kind === 'return' ? `Вернуть через ${countdown(r.t)}` : `Забрать через ${countdown(r.t)}`}</span>
                <span className="block text-xs text-muted truncate">{r.b.code} · {wd(r.t)}, {dWithTime(r.t)} · {r.b.items.length} поз.</span>
              </span>
              <ChevronRight className="size-4 text-faint shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div><div className="label mb-2">Город</div>
        <Segmented layoutId="city-p" value={city} onChange={setCity} options={[{ value: 'almaty', label: 'Алматы' }, { value: 'astana', label: 'Астана' }]} /></div>
      </div>
      <div className="flex flex-col gap-5 min-w-0">

      <div className="rounded-2xl bg-surface divide-y divide-line overflow-hidden">
        <Row icon={<ShoppingBag className="size-4" />} label="Мои покупки" hint={shopOrdersN ? `${shopOrdersN}` : undefined} onClick={() => go('shopOrders')} />
        <Row icon={<Heart className="size-4" />} label="Избранное" hint={`${favorites.length} позиций`} onClick={() => go('favorites')} />
        <Row icon={<Columns3 className="size-4" />} label="Сравнение" hint={compareN ? `${compareN} из 3` : undefined} onClick={() => go('compare')} />
        <Row icon={<Sparkles className="size-4" />} label="Собрать комплект под съёмку" onClick={() => go('kit')} />
        {inst.available && <Row icon={<Download className="size-4" />} label="Установить приложение" onClick={inst.run} />}
        <Row icon={<RotateCcw className="size-4" />} label="Обновить приложение" onClick={async () => { toast('Обновляем…'); await refreshApp(); toast('Готово, всё актуально') }} />
        <Row icon={<MapPin className="size-4" />} label="Контакты и адреса" onClick={() => go('contacts')} />
        <Row icon={<HelpCircle className="size-4" />} label="Условия аренды и FAQ" onClick={() => go('terms')} />
      </div>

      <div className="rounded-2xl bg-surface divide-y divide-line overflow-hidden">
        <Row icon={<LayoutDashboard className="size-4" />} label="Админка для сотрудников" onClick={() => { if (location.protocol.startsWith('http')) { history.pushState(null, '', '/admin'); dispatchEvent(new PopStateEvent('popstate')) } else location.hash = 'admin' }} />
        <Row icon={<Presentation className="size-4" />} label="Демо-сценарий" onClick={() => setDemoOpen(true)} />
        <Row icon={<RotateCcw className="size-4" />} label="Сбросить демо-данные" onClick={() => setResetOpen(true)} />
        {me && <Row icon={<LogOut className="size-4" />} label="Выйти" onClick={() => { logout(); toast('Вы вышли') }} />}
      </div>
      </div>
      </div>
      {inst.sheet}
      <Sheet open={demoOpen} onClose={() => setDemoOpen(false)} title="Демо-сценарий" footer={<Button block size="lg" onClick={() => { runDemo(); setDemoOpen(false); haptic(30); toast('Демо готово: Айдана, 3 брони, избранное и корзина'); useNav.getState().tab('home') }}><Presentation className="size-5" /> Запустить</Button>}>
        <p className="text-muted">Данные вернутся к красивому стартовому набору: вы подтверждённый клиент Айдана, у вас ближайшая бронь на FX3 и две прошлые, избранное, сравнение FX3 и A7 IV, в корзине готовый комплект. Всё только в этом браузере.</p>
      </Sheet>
      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Сбросить демо?" footer={<Button variant="danger" block onClick={() => { resetDemo(); setResetOpen(false); toast('Данные сброшены') }}>Сбросить</Button>}>
        <p className="text-muted">Брони, заявки и изменения в админке вернутся к исходным демо-данным. Это касается только этого браузера.</p>
      </Sheet>
    </div>
  )
}

export function Favorites() {
  const { favorites, products } = useStore(useShallow(s => ({ favorites: s.favorites, products: s.products })))
  const back = useNav(s => s.back), tab = useNav(s => s.tab)
  const list = favorites.map(id => products.find(p => p.id === id)).filter(Boolean) as any[]
  const avail = useAvailMap()
  const addToCart = useStore(s => s.addToCart)
  const freeFav = list.filter(p => (avail.get(p.id)?.free ?? 0) > 0)
  const kitFromFav = () => {
    freeFav.forEach(p => addToCart(p.id)); haptic(20)
    toast(freeFav.length === list.length ? `Комплект из ${freeFav.length} позиций в корзине` : `В корзине ${freeFav.length} из ${list.length}: остальное занято на эти даты`); tab('cart')
  }
  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Избранное</h1></div>
      {list.length > 0 && (
        <button onClick={kitFromFav} className="press flex items-center gap-3 rounded-2xl bg-accent/[0.08] p-3.5 text-left">
          <span className="size-10 grid place-items-center rounded-xl bg-accent text-accent-ink shrink-0"><Sparkles className="size-5" /></span>
          <span className="flex-1 min-w-0"><span className="block font-medium">Собрать комплект из избранного</span><span className="block text-xs text-muted">{freeFav.length} из {list.length} свободны на ваши даты · {money(freeFav.reduce((s, p) => s + p.price, 0))}/сут</span></span>
          <ChevronRight className="size-4 text-faint shrink-0" />
        </button>
      )}
      {list.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{list.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}</div>
        : <Empty icon={<Heart className="size-7" />} title="Пока пусто" text="Отмечайте технику сердечком, чтобы не искать её заново." action={<Button onClick={() => tab('catalog')}>В каталог</Button>} />}
    </div>
  )
}

export function KitBuilder() {
  const { products, units, bookings, city, range, addToCart, createLead } = useStore(useShallow(s => ({ products: s.products, units: s.units, bookings: s.bookings, city: s.city, range: s.range, addToCart: s.addToCart, createLead: s.createLead })))
  const me = useMe()
  const back = useNav(s => s.back), tab = useNav(s => s.tab)
  const route = useRoute()
  const [pid, setPid] = useState<string>(PRESETS.some(p => p.id === route.params?.preset) ? route.params!.preset : PRESETS[0].id)
  const preset = PRESETS.find(p => p.id === pid)!
  const items = useMemo(() => resolvePreset(preset, products).map(i => ({ ...i, free: freeUnits(units, bookings, i.product.id, city, range.start, range.end).length })), [preset, products, units, bookings, city, range])
  const [off, setOff] = useState<string[]>([])
  const chosen = items.filter(i => !off.includes(i.product.id) && i.free > 0)
  const perDay = chosen.reduce((s, i) => s + i.product.price * Math.min(i.qty, i.free), 0)
  const days = rentalDays(range.start, range.end)
  const [leadOpen, setLeadOpen] = useState(false)
  const [lead, setLead] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', text: '' })

  return (
    <div className="flex flex-col gap-5 pb-40 md:pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><div><h1 className="font-display text-2xl font-semibold">Собрать комплект</h1><p className="text-sm text-muted">Выберите задачу, уберите лишнее, добавьте одним касанием</p></div></div>
      <DateBar />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => { setPid(p.id); setOff([]); haptic() }} className={cx('relative text-left p-3.5 rounded-2xl border transition-colors', pid === p.id ? 'border-accent bg-accent/[0.07]' : 'border-line bg-surface hover:border-line-2')}>
            <div className="label">{p.tag}</div><div className="font-display font-semibold mt-1">{p.title}</div><div className="text-xs text-muted mt-0.5 line-clamp-2">{p.subtitle}</div>
            {pid === p.id && <span className="absolute top-3 right-3 size-2 bg-accent" />}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.ul key={pid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="rounded-2xl bg-surface divide-y divide-line overflow-hidden">
          {items.map(({ product, qty, free }) => {
            const on = !off.includes(product.id) && free > 0
            return (
              <li key={product.id}>
                <button disabled={free === 0} onClick={() => setOff(on ? [...off, product.id] : off.filter(x => x !== product.id))} className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-2 disabled:opacity-50">
                  <span className={cx('size-5 grid place-items-center border-2 shrink-0 transition-colors', on ? 'bg-accent border-accent text-accent-ink' : 'border-line-2')}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
                  <ProductArt p={product} size="sm" className="size-11 rounded-lg shrink-0" />
                  <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{product.name}</span><span className="block text-xs text-muted">{free === 0 ? 'Занято на эти даты' : `${qty > 1 ? `${Math.min(qty, free)} шт · ` : ''}${product.kind}`}</span></span>
                  <span className="tnum text-sm">{num(product.price * Math.min(qty, Math.max(free, 1)))} ₸</span>
                </button>
              </li>
            )
          })}
        </motion.ul>
      </AnimatePresence>
      <button onClick={() => setLeadOpen(true)} className="rounded-2xl border border-dashed border-line-2 p-4 text-left hover:border-accent flex items-center gap-3">
        <span className="size-10 grid place-items-center rounded-xl bg-surface-2 text-accent"><Send className="size-4" /></span>
        <span><span className="block font-semibold">Не нашли свою задачу?</span><span className="block text-sm text-muted">Опишите съёмку, менеджер соберёт комплект под бюджет</span></span>
      </button>

      <div className="fixed md:static left-0 right-0 z-40 gutter md:px-0 pb-3 md:pb-0" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <Button size="lg" block disabled={!chosen.length} className="shadow-2xl shadow-black/60 md:shadow-none" onClick={() => {
          chosen.forEach(i => addToCart(i.product.id, Math.min(i.qty, i.free))); haptic(20); toast(`${chosen.length} позиций в корзине`); tab('cart')
        }}>Добавить {chosen.length} · <span className="tnum">{money(perDay * days)}</span><span className="text-xs opacity-70">за {daysWord(days)}</span></Button>
      </div>

      <Sheet open={leadOpen} onClose={() => setLeadOpen(false)} title="Подбор техники"
        footer={<Button block size="lg" disabled={!lead.name || lead.phone.replace(/\D/g, '').length < 10 || lead.text.length < 5} onClick={() => { createLead({ type: 'selection', ...lead, city, dates: range }); setLeadOpen(false); toast('Заявка у менеджера. Ответим в течение 15 минут') }}>Отправить заявку</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Что снимаете?"><textarea id="lead-text" rows={4} className="field resize-none" value={lead.text} onChange={e => setLead({ ...lead, text: e.target.value })} placeholder="Например: клип в павильоне, 2 смены, нужен свет и стаб, бюджет до 80 000 ₸/сутки" /></Field>
          <Field label="Имя"><input id="lead-name" className="field" value={lead.name} onChange={e => setLead({ ...lead, name: e.target.value })} /></Field>
          <Field label="Телефон / WhatsApp"><input id="lead-phone" className="field tnum" inputMode="tel" value={lead.phone} onChange={e => setLead({ ...lead, phone: e.target.value })} placeholder="+7 7__ ___ __ __" /></Field>
        </div>
      </Sheet>
    </div>
  )
}

export function Contacts() {
  const { settings, createLead, city } = useStore(useShallow(s => ({ settings: s.settings, createLead: s.createLead, city: s.city })))
  const me = useMe()
  const back = useNav(s => s.back)
  const [q, setQ] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', text: '' })
  const h = new Date().getHours()
  return (
    <div className="grid gap-5 pb-10 md:grid-cols-2 items-start">
      <div className="md:col-span-2 flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Контакты</h1></div>
      {(['almaty', 'astana'] as const).map(c => {
        const p = settings.points[c]
        const open = p.close === 24 || (h >= p.open && h < p.close)
        return (
          <div key={c} className="rounded-2xl bg-surface overflow-hidden">
            <div className="h-28 dot-grid relative bg-surface-2">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 0 30%, color-mix(in oklab, var(--color-line-2) 70%, transparent) 30% 32%, transparent 32% 60%, color-mix(in oklab, var(--color-line-2) 70%, transparent) 60% 61.5%, transparent 61.5%)' }} />
              <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"><MapPin className="size-8 text-accent fill-accent/20" /></motion.div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between"><div className="font-display font-semibold">{c === 'almaty' ? 'Алматы' : 'Астана'}</div><Badge tone={open ? 'ok' : 'bad'}>{open ? 'Открыто' : 'Закрыто'}</Badge></div>
              <div>{placeLine(p)}</div><div className="text-sm text-muted">{p.hours}</div>
              {p.phone && <div className="tnum text-sm select-all flex items-center gap-2"><Phone className="size-4 text-muted" />{p.phone}</div>}
              <a href={`https://2gis.kz/${c}/search/${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-accent"><Navigation className="size-4" /> Открыть в 2ГИС</a>
            </div>
          </div>
        )
      })}
      <div className="md:col-span-2 rounded-2xl bg-surface p-4 flex flex-col gap-3">
        <div className="font-display font-semibold">Задать вопрос</div>
        <textarea id="q-text" rows={3} className="field resize-none" value={q.text} onChange={e => setQ({ ...q, text: e.target.value })} placeholder="Ваш вопрос" />
        <div className="grid grid-cols-2 gap-2"><input id="q-name" className="field" value={q.name} onChange={e => setQ({ ...q, name: e.target.value })} placeholder="Имя" /><input id="q-phone" className="field tnum" value={q.phone} onChange={e => setQ({ ...q, phone: e.target.value })} placeholder="Телефон" /></div>
        <Button disabled={!q.text || !q.phone} onClick={() => { createLead({ type: 'question', ...q, city }); setQ({ ...q, text: '' }); toast('Отправили, ответим в WhatsApp') }}>Отправить</Button>
      </div>
    </div>
  )
}

export function Terms() {
  const back = useNav(s => s.back)
  const settings = useStore(s => s.settings)
  const route = useRoute()
  const [open, setOpen] = useState<number | null>(0)
  const faq = [
    ['Как считаются сутки?', `Сутки идут от времени выдачи. Взяли в 18:00, вернули на следующий день до 18:00: это одни сутки. Минимальный срок ${settings.minHours} часа.`],
    ['Какие документы нужны?', 'Удостоверение личности или паспорт. Для юрлиц: доверенность или реквизиты для счёта.'],
    ['Есть ли скидки за срок?', `Да, автоматически: ${settings.tiers.map(t => `от ${t.days} суток −${t.percent}%`).join(', ')}.`],
    ['Доставка', `Привезём на площадку: ${money(settings.deliveryFee.almaty)} по Алматы, ${money(settings.deliveryFee.astana)} по Астане. Укажите адрес при оформлении.`],
    ['Если что-то сломалось', 'Сразу напишите менеджеру. Мелкий износ не считаем. Серьёзные повреждения оцениваем по стоимости ремонта.'],
    ['Можно отменить или перенести?', 'Да, прямо в приложении в разделе «Брони», пока техника не выдана. Если оплатили, вернём деньги.'],
  ]
  // с баннера: сразу открыть нужный вопрос
  useEffect(() => { const q = route.params?.q; if (q) { const n = faq.findIndex(([t]) => t === q); if (n >= 0) setOpen(n) } }, [route.params?.q])
  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="font-display text-2xl font-semibold">Условия и FAQ</h1></div>
      <div className="rounded-2xl bg-surface divide-y divide-line overflow-hidden">
        {faq.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left font-medium hover:bg-surface-2">
              {q}<motion.span animate={{ rotate: open === i ? 45 : 0 }}><Plus className="size-4 text-accent" /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="px-4 pb-4 text-muted leading-relaxed">{a}</p></motion.div>}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  )
}
