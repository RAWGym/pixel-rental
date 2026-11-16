import { useState } from 'react'
import { Lock, Mail, KeyRound, ArrowLeft, Clock, LogOut, UserPlus } from 'lucide-react'
import { Logo, Button, Field, cx, toast } from '../ui/kit'
import { staffSignIn, staffSignUp, staffResetPassword, staffSetPassword, staffSignOut, useStaffAuth } from '../data/supabase'

type Mode = 'signin' | 'signup' | 'reset'

const theme = () => { try { return localStorage.getItem('px-admin-theme') || 'dark' } catch { return 'dark' } }
const leave = () => (window as any).__pxLeaveAdmin?.()

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm grid place-items-center gutter py-10" data-theme={theme()}>
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between rise"><Logo className="h-8 w-auto" /><span className="text-xs text-muted">Админка</span></div>
        {children}
        <button onClick={leave} className="text-sm text-muted hover:text-fg flex items-center gap-2 justify-center"><ArrowLeft className="size-4" />В приложение для клиентов</button>
      </div>
    </div>
  )
}

/** Вход сотрудника по email и паролю (Supabase Auth). Роль выдаёт владелец — сам себе её назначить нельзя. */
export function StaffLogin() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      if (mode === 'signin') { const r = await staffSignIn(email, password); if (!r.ok) setErr(r.error) }
      if (mode === 'signup') {
        if (password.length < 8) { setErr('Пароль: минимум 8 символов'); return }
        const r = await staffSignUp(email, password, name)
        if (!r.ok) setErr(r.error); else if (r.data.confirm) setSent('Проверьте почту: мы отправили ссылку для подтверждения. После неё войдите и попросите владельца выдать роль.')
      }
      if (mode === 'reset') { const r = await staffResetPassword(email); if (!r.ok) setErr(r.error); else setSent('Если такой email есть, на него пришла ссылка для смены пароля.') }
    } finally { setBusy(false) }
  }

  return (
    <Frame>
      <form onSubmit={submit} className="glass rise p-6 flex flex-col gap-4" style={{ ['--i' as any]: 1 }}>
        <div>
          <div className="text-xl font-semibold flex items-center gap-2"><Lock className="size-5 text-accent" />{mode === 'signin' ? 'Вход для сотрудников' : mode === 'signup' ? 'Новый аккаунт сотрудника' : 'Сброс пароля'}</div>
          <p className="text-sm text-muted mt-1">{mode === 'signup' ? 'После регистрации владелец назначит вам роль. До этого админка закрыта.' : mode === 'reset' ? 'Пришлём ссылку для нового пароля.' : 'Права зависят от роли: владелец, менеджер, склад, бухгалтерия.'}</p>
        </div>
        {sent ? <div className="rounded-xl bg-ok/10 text-sm p-3">{sent}</div> : (<>
          {mode === 'signup' && <Field label="Имя и фамилия"><input id="st-name" className="field" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required /></Field>}
          <Field label="Email"><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="st-email" type="email" className="field pl-10" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div></Field>
          {mode !== 'reset' && <Field label="Пароль"><div className="relative"><KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><input id="st-pass" type="password" className="field pl-10" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : 1} /></div></Field>}
          {err && <div className="text-sm text-bad">{err}</div>}
          <Button type="submit" block size="lg" disabled={busy}>{busy ? 'Секунду…' : mode === 'signin' ? 'Войти' : mode === 'signup' ? 'Создать аккаунт' : 'Отправить ссылку'}</Button>
        </>)}
        <div className="flex justify-between text-sm">
          {mode !== 'signin' ? <button type="button" className="text-muted hover:text-fg" onClick={() => { setMode('signin'); setSent(null); setErr('') }}>← Ко входу</button>
            : <button type="button" className="text-muted hover:text-fg" onClick={() => { setMode('reset'); setErr('') }}>Забыли пароль?</button>}
          {mode === 'signin' && <button type="button" className="text-accent font-medium flex items-center gap-1.5" onClick={() => { setMode('signup'); setErr('') }}><UserPlus className="size-4" />Новый сотрудник</button>}
        </div>
      </form>
    </Frame>
  )
}

/** Пришли по ссылке из письма «сброс пароля» */
export function StaffSetPassword() {
  const [p1, setP1] = useState(''), [p2, setP2] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  return (
    <Frame>
      <form className="glass rise p-6 flex flex-col gap-4" onSubmit={async e => {
        e.preventDefault()
        if (p1.length < 8) return setErr('Минимум 8 символов')
        if (p1 !== p2) return setErr('Пароли не совпадают')
        setBusy(true); const r = await staffSetPassword(p1); setBusy(false)
        if (!r.ok) setErr(r.error); else toast('Пароль обновлён')
      }}>
        <div className="text-xl font-semibold flex items-center gap-2"><KeyRound className="size-5 text-accent" />Новый пароль</div>
        <Field label="Пароль"><input id="sp-1" type="password" className="field" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></Field>
        <Field label="Ещё раз"><input id="sp-2" type="password" className="field" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></Field>
        {err && <div className="text-sm text-bad">{err}</div>}
        <Button type="submit" block size="lg" disabled={busy}>Сохранить и войти</Button>
      </form>
    </Frame>
  )
}

/** Аккаунт есть, роль не назначена */
export function StaffPending() {
  const email = useStaffAuth(s => s.email)
  return (
    <Frame>
      <div className="glass rise p-6 flex flex-col gap-4">
        <div className="text-xl font-semibold flex items-center gap-2"><Clock className="size-5 text-warn" />Роль ещё не назначена</div>
        <p className="text-sm text-muted">Вы вошли как <b className="text-fg">{email}</b>. Попросите владельца выдать вам роль, затем обновите страницу.</p>
        <Button variant="soft" block onClick={() => staffSignOut()}><LogOut className="size-4" />Выйти</Button>
      </div>
    </Frame>
  )
}

export const StaffLoading = () => <div className={cx('adm grid place-items-center text-sm text-muted')} data-theme={theme()}>Проверяем вход…</div>
