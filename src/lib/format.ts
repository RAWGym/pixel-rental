const nf = new Intl.NumberFormat('ru-RU')
// неразрывные пробелы: цена никогда не переносится на две строки
/** адрес и вывеска: «ул. Толе би, 174 · Pixel Shop» */
export const placeLine = (p: { address: string; name?: string }) => (p.name ? `${p.address} · ${p.name}` : p.address)
export const money = (n: number) => `${nf.format(Math.round(n)).replace(/\s/g, ' ')} ₸`
export const num = (n: number) => nf.format(Math.round(n))

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

export const dShort = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
export const dFull = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]}` }
export const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export const dWithTime = (t: number) => `${dShort(t)}, ${hm(t)}`
export const wd = (t: number) => WD[new Date(t).getDay()]

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
export const daysWord = (n: number) => `${n} ${plural(n, 'сутки', 'суток', 'суток')}`

export function rangeLabel(s: number, e: number) {
  const a = new Date(s), b = new Date(e)
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}-${b.getDate()} ${MONTHS[b.getMonth()]}`
  return `${dShort(s)} - ${dShort(e)}`
}

export function relTime(t: number) {
  const diff = Date.now() - t
  const m = Math.round(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`
  return dShort(t)
}

export function countdown(to: number) {
  const diff = to - Date.now()
  if (diff <= 0) return 'сейчас'
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d} д ${h % 24} ч`
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h} ч ${m} мин`
}

// поиск: транслит и разговорные названия брендов
const ALIASES: [RegExp, string][] = [
  // сначала длинные и составные названия, чтобы «сони» не сработало внутри «панасоник»
  [/[еe]-? ?маунт|emount/g, 'sony e'], [/эр ?эф(?![а-я])/g, 'rf'], [/(?<![а-яё])(?:и ?)?эф(?![а-я])/g, 'ef'],
  [/никон/g, 'nikon'], [/панасоник|панас/g, 'panasonic'], [/[сз]енн?х[аэ]й[зс]ер/g, 'sennheiser'], [/рода|рёде|роуд/g, 'rode'], [/апт[юу]р|аптьюр/g, 'aputure'],
  [/нанлайт/g, 'nanlite'], [/тилта/g, 'tilta'], [/смол ?риг|смолл ?риг/g, 'smallrig'], [/лексар/g, 'lexar'], [/сан ?диск/g, 'sandisk'], [/самсунг/g, 'samsung'],
  [/кингстон/g, 'kingston'], [/шура|шур(?![а-я])/g, 'shure'], [/атомос/g, 'atomos'], [/м[аэ]нфротто/g, 'manfrotto'], [/сируи|сируй/g, 'sirui'], [/лаова/g, 'laowa'],
  [/самь?янг/g, 'samyang'], [/фил ?ворлд|филворд/g, 'feelworld'], [/лиллипут|лилипут/g, 'lilliput'], [/улан[зд]и/g, 'ulanzi'], [/зум\s?h/g, 'zoom h'],
  [/сони|соня/g, 'sony'], [/к[эа]нон|кенон/g, 'canon'], [/фудж?и|фуджифильм|фуджик/g, 'fujifilm'], [/д?джи ?ай|диджиай|джиай/g, 'dji'],
  [/го ?про|гопро/g, 'gopro'], [/апь?ючер|апучер|амаран/g, 'aputure'], [/годокс/g, 'godox'], [/сигма/g, 'sigma'], [/тамрон/g, 'tamron'],
  [/ронин/g, 'ronin'], [/осмо/g, 'osmo'], [/холлиленд|холиленд/g, 'hollyland'], [/роде|рода|рёде|роуд|род/g, 'rode'], [/блэкмэджик|блекмеджик|бмпсс/g, 'blackmagic'],
  [/петличк\S*/g, 'mic петлички lark'], [/дрон\S*/g, 'дрон mini'], [/стаб\S*/g, 'ronin rs стабилизатор'], [/фикс/g, 'mm f1'],
  [/фх ?3/g, 'fx3'], [/фх ?6/g, 'fx6'], [/а7/g, 'a7'],
]
export function normalizeQuery(q: string) {
  let s = q.toLowerCase().trim().replace(/ё/g, 'е')
  for (const [re, v] of ALIASES) s = s.replace(re, v)
  return s
}
