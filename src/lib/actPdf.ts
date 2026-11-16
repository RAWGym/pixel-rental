/**
 * PDF «Акт приёма-передачи техники в аренду» — собирается в браузере (pdf-lib, шрифт Roboto с кириллицей).
 * Модуль грузится лениво — только при нажатии «Скачать акт».
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import regUrl from '../assets/fonts/Roboto-Regular.ttf?url'
import boldUrl from '../assets/fonts/Roboto-Bold.ttf?url'
import { RENTAL_D, PIXEL_D, LOGO_W } from '../ui/logoPaths'
import type { Contract } from '../data/types'

const A4 = { w: 595.28, h: 841.89 }
const M = 42
const INK = rgb(0.12, 0.1, 0.08), MUTED = rgb(0.42, 0.38, 0.34), LINE = rgb(0.85, 0.82, 0.78), ORANGE = rgb(1, 0.588, 0.184)
// в шрифте нет знака ₸ — пишем «тг»
const money = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ | /g, ' ') + ' тг'
const dt = (v: string | number) => new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const CITY: Record<string, string> = { almaty: 'Алматы', astana: 'Астана' }
const PAY: Record<string, string> = { kaspi: 'Kaspi', card: 'карта', cash: 'наличные', invoice: 'счёт' }

export async function buildActPdf(c: Contract, signaturePng: Uint8Array | null, opts: { address?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [reg, bold] = await Promise.all([regUrl, boldUrl].map(async u => new Uint8Array(await (await fetch(u)).arrayBuffer())))
  const F = await doc.embedFont(reg, { subset: true }), B = await doc.embedFont(bold, { subset: true })
  doc.setTitle(`Акт выдачи ${c.code}`); doc.setAuthor('Pixel Rental'); doc.setSubject('Акт приёма-передачи техники в аренду'); doc.setCreationDate(new Date(c.signedAt))

  let page: PDFPage = doc.addPage([A4.w, A4.h])
  let y = A4.h - M
  const W = A4.w - 2 * M
  const newPage = () => { page = doc.addPage([A4.w, A4.h]); y = A4.h - M }
  const need = (h: number) => { if (y - h < M + 30) newPage() }
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = []
    for (const para of text.replace(/ | /g, ' ').split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(t, size) <= width) line = t
        else { if (line) out.push(line); line = word }
      }
      out.push(line)
    }
    return out
  }
  const text = (s: string, x: number, size = 10, font = F, color = INK) => page.drawText(s.replace(/ | /g, ' '), { x, y, size, font, color })
  const para = (s: string, size = 10, font = F, color = INK, x = M, width = W, lead = 1.4) => {
    for (const l of wrap(s, font, size, width)) { need(size * lead); text(l, x, size, font, color); y -= size * lead }
  }
  const rule = (gap = 8) => { y -= gap / 2; page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE }); y -= gap }

  // шапка: логотип и номер
  const k = 150 / LOGO_W
  page.drawSvgPath(RENTAL_D + PIXEL_D, { x: M, y: y, scale: k, color: ORANGE })
  const right = (s: string, size: number, font: PDFFont, color = INK) => page.drawText(s, { x: A4.w - M - font.widthOfTextAtSize(s, size), y, size, font, color })
  y -= 6; right(`Договор № ${c.code}`, 11, B); y -= 14; right(dt(c.signedAt), 9, F, MUTED)
  y -= 26
  text('АКТ ПРИЁМА-ПЕРЕДАЧИ ТЕХНИКИ В АРЕНДУ', M, 15, B); y -= 22
  if (c.status === 'void') { text(`АННУЛИРОВАН: ${c.voidReason ?? ''}`, M, 11, B, rgb(0.75, 0.15, 0.1)); y -= 18 }

  const s = c.snapshot
  const kv = (k: string, v: string) => { need(15); text(k, M, 9.5, F, MUTED); para(v, 10, F, INK, M + 120, W - 120, 1.35) }
  kv('Поставщик', `Pixel Rental${opts.address ? `, ${CITY[s.city] ?? ''}, ${opts.address}` : `, ${CITY[s.city] ?? ''}`}`)
  kv('Арендатор', [s.customer.name, s.customer.phone, s.customer.iin ? `ИИН ${s.customer.iin}` : ''].filter(Boolean).join(', '))
  kv('Срок аренды', `${dt(s.start)} - ${dt(s.end)} (${s.days} сут.)`)
  rule(10)

  // таблица техники
  const cols = [M, M + 22, M + 250, M + 380, M + 420, M + W]
  const head = ['№', 'Наименование', 'Серийные номера', 'Кол.', 'Сумма']
  need(20); head.forEach((h, i) => text(h, i === 4 ? cols[5] - B.widthOfTextAtSize(h, 9) : cols[i], 9, B, MUTED)); y -= 14
  s.items.forEach((it, n) => {
    const name = wrap(it.name, F, 9.5, cols[2] - cols[1] - 8), sn = wrap(it.units.map(u => u.serial).join(', ') || '-', F, 9, cols[3] - cols[2] - 8)
    const rows = Math.max(name.length, sn.length), h = rows * 12 + 6
    need(h)
    const sum = money(it.price * it.qty * s.days)
    text(String(n + 1), cols[0], 9.5); text(String(it.qty), cols[3], 9.5); text(sum, cols[5] - F.widthOfTextAtSize(sum, 9.5), 9.5)
    const y0 = y
    name.forEach((l, i) => { y = y0 - i * 12; text(l, cols[1], 9.5) })
    sn.forEach((l, i) => { y = y0 - i * 12; text(l, cols[2], 9, F, MUTED) })
    y = y0 - h + 2
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.4, color: LINE })
    y -= 6
  })
  y -= 4
  const sumRow = (label: string, v: string, b = false) => { need(14); const f = b ? B : F; text(label, M + 260, 10, f, b ? INK : MUTED); text(v, A4.w - M - f.widthOfTextAtSize(v, 10), 10, f); y -= 14 }
  sumRow('Аренда', money(s.subtotal))
  if (s.discount) sumRow('Скидка', '−' + money(s.discount))
  if (s.delivery) sumRow('Доставка', money(s.delivery))
  sumRow('Итого к оплате', money(s.total), true)
  sumRow(`Оплачено (${PAY[s.payment_method] ?? s.payment_method})`, money(s.paid))
  rule(10)

  // чек-лист выдачи
  const ch = c.checklist ?? ({} as any)
  const mark = (v: boolean) => (v ? '[x]' : '[ ]')
  para(`${mark(ch.complete)} Комплектность проверена   ${mark(ch.condition)} Состояние осмотрено   ${mark(ch.payment)} Оплата получена`, 9.5)
  if (ch.note) para(`Замечания при выдаче: ${ch.note}`, 9.5, F, INK)
  if (c.verifiedOverride) para('Профиль арендатора не был подтверждён на момент выдачи; выдачу подтвердил сотрудник.', 9, F, rgb(0.7, 0.35, 0.05))
  rule(10)

  // условия
  need(18); text(`Условия аренды (версия ${c.version})`, M, 11, B); y -= 16
  para(c.terms, 9.5, F, INK, M, W, 1.45)
  y -= 6

  // подписи
  need(150)
  rule(6)
  const colW = (W - 30) / 2
  const sy = y
  text('Арендатор', M, 9.5, F, MUTED); y -= 6
  if (signaturePng) {
    const img = await doc.embedPng(signaturePng)
    const iw = colW, ih = (iw * img.height) / img.width
    page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih })
    y -= ih + 4
  } else y -= 74
  page.drawLine({ start: { x: M, y }, end: { x: M + colW, y }, thickness: 0.6, color: INK })
  y -= 14; text(c.signerName, M, 10, B); y -= 13; text(dt(c.signedAt), M, 9, F, MUTED)
  const by = y
  y = sy; const x2 = M + colW + 30
  text('Выдал (Pixel Rental)', x2, 9.5, F, MUTED); y -= 10 + (colW * 300) / 800
  page.drawLine({ start: { x: x2, y }, end: { x: x2 + colW, y }, thickness: 0.6, color: INK })
  y -= 14; text(c.issuedByName, x2, 10, B); y -= 13; text('подпись / печать', x2, 9, F, MUTED)
  y = Math.min(y, by) - 22

  // служебная информация для проверки подлинности
  need(60)
  para(`Хэш документа SHA-256: ${c.docHash}`, 7.5, F, MUTED, M, W, 1.3)
  para(`Хэш условий: ${c.termsHash}   ·   Хэш подписи: ${c.signatureHash}`, 7.5, F, MUTED, M, W, 1.3)
  para('Подпись арендатора: простая электронная подпись (собственноручное изображение подписи), сохранённая вместе с хэшем текста условий, временем, сотрудником и перечнем техники.', 7.5, F, MUTED, M, W, 1.3)

  // номера страниц
  const pages = doc.getPages()
  pages.forEach((p, i) => { const t = `${c.code} · стр. ${i + 1} из ${pages.length}`; p.drawText(t, { x: A4.w - M - F.widthOfTextAtSize(t, 8), y: 24, size: 8, font: F, color: MUTED }) })
  return doc.save()
}
