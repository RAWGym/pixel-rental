import { useRef, useState } from 'react'
import { ChevronLeft, Camera, Upload, RotateCcw, ShieldCheck, Check, IdCard, Clock, XCircle } from 'lucide-react'
import { useNav, useRoute } from '../store/nav'
import { useMe } from '../store/store'
import { api, DEMO_OTP } from '../data/api'
import { verificationOf, VERIFICATION_LABEL, type Verification } from '../data/types'
import { Button, IconBtn, Field, cx, toast, haptic } from '../ui/kit'

export function fmtPhone(v: string) {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('8')) d = '7' + d.slice(1)
  if (!d.startsWith('7')) d = '7' + d
  d = d.slice(0, 11)
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean)
  return '+7' + (p.length ? ' ' + p.join(' ') : '')
}

/** Сжимаем фото документа до ~1280px JPEG — чтобы влезало в хранилище и быстро грузилось менеджеру */
async function compress(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.78)
  } finally { URL.revokeObjectURL(url) }
}

/* ---------- Статус профиля ---------- */
export function VerificationBadge({ v, className }: { v: Verification; className?: string }) {
  const tone = { none: 'bg-surface-3 text-muted', pending: 'bg-warn/12 text-warn', verified: 'bg-ok/12 text-ok', rejected: 'bg-bad/12 text-bad' }[v]
  const Icon = { none: IdCard, pending: Clock, verified: Check, rejected: XCircle }[v]
  return <span className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap', tone, className)}><Icon className="size-3.5" />{VERIFICATION_LABEL[v]}</span>
}

/* ---------- Скан одной стороны удостоверения ---------- */
function IdShot({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  const cam = useRef<HTMLInputElement>(null), file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try { onChange(await compress(f)); haptic() } catch { toast('Не получилось прочитать фото', { tone: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {/* рамка-подсказка в пропорциях удостоверения (85,6 × 54 мм) */}
      <div className="relative w-full aspect-[1.585/1] rounded-2xl bg-surface-2 overflow-hidden">
        {value ? (
          <img src={value} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-3 rounded-xl border-2 border-dashed border-line-2 grid place-items-center text-center px-4">
            <div className="flex flex-col items-center gap-1.5 text-muted">
              <IdCard className="size-7" strokeWidth={1.5} />
              <span className="text-xs">Положите документ на тёмный фон, чтобы он целиком попал в рамку. Без бликов.</span>
            </div>
          </div>
        )}
        {busy && <div className="absolute inset-0 bg-bg/70 grid place-items-center text-sm">Обрабатываем…</div>}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className="flex gap-2">
        {value ? (
          <Button size="sm" variant="soft" className="flex-1" onClick={() => cam.current?.click()}><RotateCcw className="size-4" /> Переснять</Button>
        ) : (
          <Button size="sm" variant="soft" className="flex-1" onClick={() => cam.current?.click()}><Camera className="size-4" /> Снять</Button>
        )}
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => file.current?.click()}><Upload className="size-4" /> Загрузить</Button>
      </div>
    </div>
  )
}

/** Шаг со сканами — общий для регистрации и повторной отправки из профиля */
export function IdScanStep({ onDone, submitLabel = 'Отправить на проверку' }: { onDone: (front: string, back: string) => void | Promise<void>; submitLabel?: string }) {
  const [front, setFront] = useState<string>()
  const [back, setBack] = useState<string>()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <IdShot label="Лицевая сторона" value={front} onChange={setFront} />
        <IdShot label="Обратная сторона" value={back} onChange={setBack} />
      </div>
      <label className="flex gap-3 items-start text-sm cursor-pointer">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-accent)] shrink-0" />
        <span className="text-muted">Согласен(на) на сбор и обработку персональных данных для проверки личности и оформления аренды. Сканы видит только менеджер Pixel Rental.</span>
      </label>
      <Button block size="lg" disabled={!front || !back || !consent || busy} onClick={async () => { setBusy(true); await onDone(front!, back!); setBusy(false) }}>
        <ShieldCheck className="size-5" /> {submitLabel}
      </Button>
    </div>
  )
}

type Step = 'phone' | 'code' | 'profile' | 'scan' | 'done'

/** Вход и регистрация: телефон → код → (новый клиент) имя/ИИН → скан удостоверения */
export function AuthScreen() {
  const route = useRoute()
  const back = useNav(s => s.back)
  const me = useMe()
  const next = route.params?.next as string | undefined
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('+7 ')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [iin, setIin] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // экран входа открыт поверх оформления/профиля — просто возвращаемся, там уже виден вошедший клиент
  const finish = () => back()

  const sendCode = async () => {
    setBusy(true); const r = await api.requestOtp(phone); setBusy(false)
    if (!r.ok) return setErr(r.error)
    setErr(''); setStep('code')
  }
  const checkCode = async (c = code) => {
    setBusy(true); const r = await api.verifyOtp(phone, c); setBusy(false)
    if (!r.ok) { setErr(r.error); setCode(''); return }
    setErr('')
    if (r.data.customer) { haptic(20); toast(`С возвращением, ${r.data.customer.name.split(' ')[0]}`); finish() } else setStep('profile')
  }
  const saveProfile = () => {
    if (name.trim().length < 2) return setErr('Укажите имя и фамилию')
    if (!/^\d{12}$/.test(iin)) return setErr('ИИН — 12 цифр')
    setErr(''); setStep('scan')
  }
  const register = async (front?: string, backSide?: string) => {
    const r = await api.register({ phone, name, iin, email: email || undefined, idFront: front, idBack: backSide })
    if (!r.ok) return setErr(r.error)
    haptic(30); setStep('done')
  }

  const STEPS: Step[] = ['phone', 'code', 'profile', 'scan']
  const idx = STEPS.indexOf(step)
  const title = { phone: 'Вход', code: 'Код из WhatsApp', profile: 'Знакомимся', scan: 'Скан удостоверения', done: 'Профиль на проверке' }[step]

  return (
    <div className="max-w-md mx-auto flex flex-col gap-6 pb-10">
      <div className="flex items-center gap-3">
        <IconBtn label="Назад" onClick={() => (step === 'code' ? setStep('phone') : step === 'scan' ? setStep('profile') : back())}><ChevronLeft className="size-5" /></IconBtn>
        <h1 className="text-xl font-semibold flex-1 min-w-0">{title}</h1>
      </div>
      {step !== 'done' && (
        <div className="flex gap-1.5" aria-hidden>{STEPS.map((s, i) => <span key={s} className={cx('h-1 flex-1 rounded-full transition-colors duration-200', i <= idx ? 'bg-accent' : 'bg-surface-3')} />)}</div>
      )}

      {step === 'phone' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">{next === 'checkout' ? 'Чтобы оформить бронь, войдите по номеру. Корзина сохранится.' : 'Войдите по номеру телефона: брони и избранное будут под рукой.'}</p>
          <Field label="Телефон" error={err || undefined}>
            <input id="auth-phone" autoFocus autoComplete="tel" inputMode="tel" className="field tnum" value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} onKeyDown={e => e.key === 'Enter' && sendCode()} />
          </Field>
          <Button block size="lg" disabled={phone.replace(/\D/g, '').length < 11 || busy} onClick={sendCode}>Получить код</Button>
        </div>
      )}

      {step === 'code' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">Отправили код на <span className="text-fg tnum whitespace-nowrap">{phone}</span>. В демо-версии код — <b className="text-fg tnum">{DEMO_OTP}</b>.</p>
          <Field label="Код" error={err || undefined}>
            <input id="auth-code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={4} className="field tnum text-center text-xl tracking-[.5em]" value={code}
              onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setCode(v); if (v.length === 4) checkCode(v) }} />
          </Field>
          <button className="text-sm text-muted self-start" onClick={() => { setCode(''); setStep('phone') }}>Изменить номер</button>
        </div>
      )}

      {step === 'profile' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">Вы у нас впервые. Данные нужны для договора аренды.</p>
          <Field label="Имя и фамилия"><input id="reg-name" autoFocus autoComplete="name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Айдана Сейткали" /></Field>
          <Field label="ИИН" hint="12 цифр, как в удостоверении"><input id="reg-iin" inputMode="numeric" className="field tnum" value={iin} onChange={e => setIin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="000000000000" /></Field>
          <Field label="Email (необязательно)"><input id="reg-email" type="email" autoComplete="email" className="field" value={email} onChange={e => setEmail(e.target.value)} placeholder="для чеков" /></Field>
          {err && <div className="text-sm text-bad">{err}</div>}
          <Button block size="lg" onClick={saveProfile}>Дальше</Button>
        </div>
      )}

      {step === 'scan' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">Сфотографируйте удостоверение личности с двух сторон. Менеджер проверит его, обычно за 15 минут. Бронировать можно уже сейчас.</p>
          <IdScanStep onDone={(f, b) => register(f, b)} />
          <button className="text-sm text-muted self-center py-2" onClick={() => register()}>Пропустить, сделаю позже</button>
          {err && <div className="text-sm text-bad">{err}</div>}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-5 items-start">
          <VerificationBadge v={verificationOf(me)} />
          <p className="text-muted">
            {verificationOf(me) === 'pending'
              ? 'Документы у менеджера. Пока идёт проверка, брони можно отправлять: они придут с пометкой «ждёт верификации».'
              : 'Профиль создан. Скан удостоверения можно отправить позже из профиля, без него бронь тоже уйдёт с пометкой «ждёт верификации».'}
          </p>
          <Button block size="lg" onClick={finish}>{next === 'checkout' ? 'Продолжить оформление' : 'Готово'}</Button>
        </div>
      )}
    </div>
  )
}

/** Мягкий экран вместо оформления, пока клиент не вошёл */
export function CheckoutGate() {
  const go = useNav(s => s.go), back = useNav(s => s.back)
  return (
    <div className="max-w-md mx-auto flex flex-col gap-6 pt-6 pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="text-xl font-semibold">Оформление</h1></div>
      <div className="rounded-3xl bg-surface p-6 flex flex-col gap-4 items-start">
        <span className="size-12 grid place-items-center rounded-2xl bg-accent/12 text-accent"><ShieldCheck className="size-6" /></span>
        <div>
          <div className="text-lg font-semibold">Войдите, чтобы оформить</div>
          <p className="text-muted mt-1">Корзина сохранится. Вход по номеру телефона, код придёт в WhatsApp. Новым клиентам понадобится фото удостоверения.</p>
        </div>
        <Button block size="lg" onClick={() => go('auth', { next: 'checkout' })}>Войти по номеру</Button>
        <Button block variant="ghost" onClick={back}>Вернуться в корзину</Button>
      </div>
    </div>
  )
}

/** Повторная отправка скана из профиля (после отказа или если пропустили при регистрации) */
export function VerifyScreen() {
  const back = useNav(s => s.back)
  const me = useMe()
  const v = verificationOf(me)
  return (
    <div className="max-w-md mx-auto flex flex-col gap-5 pb-10">
      <div className="flex items-center gap-3"><IconBtn label="Назад" onClick={back}><ChevronLeft className="size-5" /></IconBtn><h1 className="text-xl font-semibold flex-1">Проверка личности</h1></div>
      <VerificationBadge v={v} className="self-start" />
      {v === 'rejected' && me?.rejectReason && <div className="rounded-2xl bg-bad/[0.08] p-3.5 text-sm"><b>Причина:</b> <span className="text-muted">{me.rejectReason}</span></div>}
      {v === 'verified' ? <p className="text-muted">Профиль подтверждён. Брони уходят менеджеру сразу.</p>
        : v === 'pending' ? <p className="text-muted">Документы у менеджера. Обычно проверка занимает до 15 минут в рабочее время.</p>
        : <IdScanStep onDone={async (f, b) => { await api.submitId(f, b); haptic(30); toast('Отправили на проверку'); back() }} />}
    </div>
  )
}
