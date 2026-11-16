/**
 * Два языка клиентской части: русский (исходный текст интерфейса) и казахский.
 * Как работает: интерфейс пишется по-русски; при выборе KZ слой перевода заменяет видимый текст,
 * подсказки (placeholder, aria-label, title, alt) по словарю kk.ts — точное совпадение или шаблон с {0}.
 * Так переводятся и тексты из констант и данных (категории, сценарии, статусы), без переписывания экранов.
 * Админка остаётся на русском (внутри .adm перевод не применяется).
 */
import { create } from 'zustand'
// словарь грузится отдельным файлом и только при выборе KZ
type Dict = typeof import('./kk')
let D: Dict | null = null
let loading: Promise<Dict> | null = null
export const loadKK = () => (loading ??= import('./kk').then(m => { D = m; TPL = compile(m.KK); TPL_WA = compile(m.KK_WA); return m }))

export type Lang = 'ru' | 'kk'
const KEY = 'px-lang'
const initial = (): Lang => {
  try { const s = localStorage.getItem(KEY); if (s === 'ru' || s === 'kk') return s } catch { /* noop */ }
  return /^kk|^kz/i.test(navigator.language || '') ? 'kk' : 'ru'
}
export const useLang = create<{ lang: Lang; set: (l: Lang) => void }>(set => ({
  lang: initial(),
  set: l => { set({ lang: l }); try { localStorage.setItem(KEY, l) } catch { /* noop */ } },
}))

/* ---------- словарь: точные строки и шаблоны ---------- */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
type Tpl = { re: RegExp; to: string }
const compile = (dict: Record<string, string>): Tpl[] => Object.entries(dict).filter(([k]) => /\{\d\}/.test(k)).map(([k, to]) => {
  const order: number[] = []
  const re = new RegExp('^' + esc(k).replace(/\\\{(\d)\\\}/g, (_m, n) => { order.push(+n); return '(.+?)' }) + '$', 's')
  // в переводе подставляем значения по номерам
  return { re, to: to.replace(/\{(\d)\}/g, (_m, n) => `\u0000${order.indexOf(+n)}\u0000`) }
})
let TPL: Tpl[] = []
let TPL_WA: Tpl[] = []
const RU_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const RU_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WD: Record<string, string> = { Пн: 'Дс', Вт: 'Сс', Ср: 'Ср', Чт: 'Бс', Пт: 'Жм', Сб: 'Сн', Вс: 'Жс' }

/** даты внутри строки: «17 ноя», «17 ноября», «Ноябрь 2026», «Пн, 17 ноя» */
function dates(s: string) {
  if (!/\d/.test(s) && !RU_NOM.some(m => s.includes(m))) return s
  return s
    .replace(/(\d{1,2})\s(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?![а-я])/g, (_m, d, mo) => `${d} ${D!.KK_MONTHS_FULL[RU_FULL.indexOf(mo)]}`)
    .replace(/(\d{1,2})\s(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)(?![а-я])/g, (_m, d, mo) => `${d} ${D!.KK_MONTHS_SHORT[RU_SHORT.indexOf(mo)]}`)
    .replace(/(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)(?![а-я])/g, m => D!.KK_MONTHS_NOM[RU_NOM.indexOf(m)])
    .replace(/(^|[\s(])(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?=,|\s|$)/g, (_m, a, w) => a + WD[w])
}

function lookup(text: string, dict: Record<string, string>, tpl: Tpl[]): string | null {
  const core = text.trim()
  if (!core || !/[а-яё]/i.test(core)) return null
  const lead = text.slice(0, text.indexOf(core)), tail = text.slice(text.indexOf(core) + core.length)
  const hit = dict[core]
  if (hit !== undefined) return lead + hit + tail
  for (const t of tpl) {
    const m = core.match(t.re)
    if (m) return lead + t.to.replace(/\u0000(\d)\u0000/g, (_x, i) => tr(m[+i + 1])) + tail
  }
  const d = dates(core)
  return d !== core ? lead + d + tail : null
}
/** перевод строки (в коде: сообщения, тексты вне DOM) */
export function tr(s: string): string {
  if (useLang.getState().lang === 'ru' || !D) return s
  return lookup(s, D.KK, TPL) ?? s
}
/** сообщение для WhatsApp: построчно */
export function trMessage(s: string): string {
  if (useLang.getState().lang === 'ru' || !D) return s
  return s.split('\n').map(line => lookup(line, D!.KK_WA, TPL_WA) ?? lookup(line, D!.KK, TPL) ?? line).join('\n')
}

/* ---------- перевод на странице ---------- */
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const
const textOrig = new WeakMap<Text, { ru: string; out: string }>()
const attrOrig = new WeakMap<Element, Record<string, { ru: string; out: string }>>()
const skip = (el: Element | null) => !!el?.closest('.adm, script, style, textarea, [data-no-i18n], [contenteditable]')

function doText(n: Text, lang: Lang) {
  const rec = textOrig.get(n)
  // React поменял текст сам — это новый русский оригинал
  const ru = rec && n.data === rec.out ? rec.ru : n.data
  if (lang === 'ru') { if (rec) { textOrig.delete(n); if (n.data !== ru) n.data = ru } return }
  if (skip(n.parentElement) || !D) return
  const out = lookup(ru, D.KK, TPL)
  if (out === null) { if (rec) textOrig.delete(n); return }
  textOrig.set(n, { ru, out })
  if (n.data !== out) n.data = out
}
function doAttrs(el: Element, lang: Lang) {
  let recs = attrOrig.get(el)
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (v == null) continue
    const rec = recs?.[a]
    const ru = rec && v === rec.out ? rec.ru : v
    if (lang === 'ru') { if (rec) { delete recs![a]; if (v !== ru) el.setAttribute(a, ru) } continue }
    if (skip(el) || !D) continue
    const out = lookup(ru, D.KK, TPL)
    if (out === null) continue
    if (!recs) attrOrig.set(el, (recs = {}))
    recs[a] = { ru, out }
    if (v !== out) el.setAttribute(a, out)
  }
}
function walk(root: Node, lang: Lang) {
  if (root.nodeType === 3) return doText(root as Text, lang)
  if (root.nodeType !== 1) return
  const el = root as Element
  if (el.matches('.adm, script, style')) return
  doAttrs(el, lang)
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => (n.nodeType === 1 && (n as Element).matches('.adm, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n as Text, lang) : doAttrs(n as Element, lang)
}

let observer: MutationObserver | null = null
export function initI18n() {
  const apply = async (lang: Lang) => {
    // KZ при старте: не показываем русский текст, пока грузится словарь (не дольше 0,8 с)
    if (lang === 'kk' && !D) { const h = document.documentElement; h.style.visibility = 'hidden'; const t = setTimeout(() => { h.style.visibility = '' }, 800); await loadKK().finally(() => { clearTimeout(t); h.style.visibility = '' }) }
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru'
    observer?.disconnect()
    walk(document.body, lang)
    if (lang === 'kk') {
      observer ??= new MutationObserver(list => {
        const l = useLang.getState().lang
        for (const m of list) {
          if (m.type === 'characterData') doText(m.target as Text, l)
          else if (m.type === 'attributes') doAttrs(m.target as Element, l)
          else m.addedNodes.forEach(n => walk(n, l))
        }
      })
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
    }
  }
  apply(useLang.getState().lang)
  useLang.subscribe((s, prev) => { if (s.lang !== prev.lang) apply(s.lang) })
}
