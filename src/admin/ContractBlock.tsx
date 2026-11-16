import { useEffect, useState } from 'react'
import { FileSignature, Download, Printer, ShieldAlert, Ban } from 'lucide-react'
import type { Booking, Contract } from '../data/types'
import { useStore } from '../store/store'
import { Button, Badge, Sheet, Field, cx, toast } from '../ui/kit'
import { supabaseConfigured } from '../data/supabase'
import { dataUrlBytes } from '../lib/contract'

const dt = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

async function sigSrc(c: Contract) {
  if (c.signaturePath.startsWith('data:')) return c.signaturePath
  if (!supabaseConfigured) return null
  const { signatureUrl } = await import('../data/supabase')
  return signatureUrl(c.signaturePath)
}

/** PDF акта: собирается на устройстве; open=true — открыть и отправить на печать */
export async function actPdf(c: Contract, mode: 'download' | 'print') {
  const [{ buildActPdf }, src] = await Promise.all([import('../lib/actPdf'), sigSrc(c)])
  let png: Uint8Array | null = null
  if (src) png = src.startsWith('data:') ? dataUrlBytes(src) : new Uint8Array(await (await fetch(src)).arrayBuffer())
  const pt = useStore.getState().settings.points?.[c.snapshot.city]
  const address = pt ? [pt.address, pt.name].filter(Boolean).join(', ') : undefined
  const bytes = await buildActPdf(c, png, { address })
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  if (mode === 'download') {
    const a = document.createElement('a'); a.href = url; a.download = `Акт-${c.code}.pdf`; document.body.appendChild(a); a.click(); a.remove()
  } else {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; f.src = url
    f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print() } catch { window.open(url, '_blank') } }
    document.body.appendChild(f); setTimeout(() => f.remove(), 60_000)
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function SignatureImg({ c, className }: { c: Contract; className?: string }) {
  const [src, setSrc] = useState<string | null>(c.signaturePath.startsWith('data:') ? c.signaturePath : null)
  useEffect(() => { let live = true; sigSrc(c).then(s => { if (live) setSrc(s) }).catch(() => {}); return () => { live = false } }, [c.signaturePath])
  return (
    <div className={cx('rounded-xl bg-[#f6f1e9] grid place-items-center overflow-hidden', className)}>
      {src ? <img src={src} alt={`Подпись: ${c.signerName}`} className="w-full h-full object-contain" /> : <span className="text-xs text-[#8d8170]">Подпись загружается…</span>}
    </div>
  )
}

/** Блок «Договор» в брони (админка): подпись, кто и когда выдал, хэш, PDF, печать, аннулирование */
export function ContractBlock({ b }: { b: Booking }) {
  const c = b.contract
  const can = useStore(s => s.can)
  const [busy, setBusy] = useState<'' | 'download' | 'print'>('')
  const [voiding, setVoiding] = useState<string | null>(null)
  if (!c) {
    if (b.status === 'issued' || b.status === 'returned') return <div className="rounded-xl border border-line p-3 text-sm text-muted flex items-center gap-2"><FileSignature className="size-4" />Выдана до появления электронных договоров, подписанного акта нет</div>
    return null
  }
  const run = async (mode: 'download' | 'print') => { setBusy(mode); try { await actPdf(c, mode) } catch (e: any) { toast('Не удалось собрать PDF: ' + (e?.message ?? e)) } finally { setBusy('') } }
  const doVoid = async () => {
    const reason = (voiding ?? '').trim(); if (reason.length < 3) return toast('Укажите причину')
    if (supabaseConfigured) { const { voidRemote } = await import('../data/supabase'); const r = await voidRemote(c.id, reason); if (!r.ok) return toast(r.error) }
    useStore.getState().voidContract(b.id, reason); setVoiding(null); toast('Договор аннулирован')
  }
  return (
    <div className={cx('rounded-xl border p-3 flex flex-col gap-3', c.status === 'void' ? 'border-bad/50' : 'border-line')}>
      <div className="flex items-center gap-2"><FileSignature className="size-4 text-accent" /><span className="font-semibold text-sm">Договор № {c.code}</span>
        {c.status === 'void' ? <Badge tone="bad">Аннулирован</Badge> : <Badge tone="ok">Подписан</Badge>}<span className="ml-auto text-xs text-muted">v{c.version}</span></div>
      <SignatureImg c={c} className="h-24" />
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">Подписал</span><span className="font-medium truncate">{c.signerName}</span>
        <span className="text-muted">Когда</span><span className="tnum">{dt(c.signedAt)}</span>
        <span className="text-muted">Выдал</span><span className="truncate">{c.issuedByName}</span>
        <span className="text-muted">Хэш</span><span className="tnum text-xs text-muted truncate" title={c.docHash}>{c.docHash.slice(0, 16)}…</span>
      </div>
      {c.verifiedOverride && <div className="text-xs text-warn flex items-center gap-1.5"><ShieldAlert className="size-3.5" />Выдано без проверенного профиля, разрешил сотрудник</div>}
      {c.status === 'void' && c.voidReason && <div className="text-xs text-bad">Причина аннулирования: {c.voidReason}</div>}
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" className="h-10" disabled={!!busy} onClick={() => run('download')}><Download className="size-4" />{busy === 'download' ? 'Собираем…' : 'Скачать акт (PDF)'}</Button>
        <Button variant="soft" className="h-10" disabled={!!busy} onClick={() => run('print')}><Printer className="size-4" />Распечатать</Button>
        {c.status === 'signed' && can('contracts.void') && <Button variant="ghost" className="h-10 text-bad" onClick={() => setVoiding('')}><Ban className="size-4" />Аннулировать</Button>}
      </div>
      <Sheet open={voiding !== null} onClose={() => setVoiding(null)} title={`Аннулировать договор ${c.code}?`} footer={<Button variant="danger" block onClick={doVoid}>Аннулировать</Button>}>
        <p className="text-sm text-muted mb-3">Запись и подпись останутся в базе с пометкой «аннулирован». Используйте, если выдача оформлена по ошибке.</p>
        <Field label="Причина"><input id="ct-void" className="field" value={voiding ?? ''} onChange={e => setVoiding(e.target.value)} placeholder="Ошибка в составе выдачи" /></Field>
      </Sheet>
    </div>
  )
}
