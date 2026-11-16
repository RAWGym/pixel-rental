import { DEFAULT_TEMPLATES } from '../lib/contract'
import { RAW, NEW_ITEMS } from './raw'
import type { Product, Unit, CategoryId, Customer, Staff, Role, Booking, Lead, Settings, CityId, BookingItem, Source, PaymentMethod } from './types'
import { hash, mulberry32 } from '../lib/rng'
import { calcPrice } from '../lib/pricing'

const KIND_PREFIX: [RegExp, string][] = [
  [/^Фотоаппарат\s+/i, 'Фотоаппарат'], [/^Кинокамера\s+/i, 'Кинокамера'], [/^Камера\s+/i, 'Камера'],
  [/^Экшн[- ]камера\s+/i, 'Экшн-камера'], [/^Об[ъь]ектив\s+/i, 'Объектив'], [/^Вспышка\s+/i, 'Вспышка'],
  [/^Свет\s+/i, 'Свет'], [/^Микрофон\s+/i, 'Микрофон'], [/^Рекордер\s+/i, 'Рекордер'], [/^Карта памяти\s+/i, 'Карта памяти'],
  [/^Дрон\s+/i, 'Дрон'], [/^Очки\s+/i, 'Умные очки'], [/^Петлички\s+/i, 'Петлички'], [/^Рация\s+/i, 'Рация'],
  [/^Монитор-рекордер\s+/i, 'Монитор-рекордер'], [/^Монитор\s+/i, 'Монитор'], [/^Комплект\s+(?=Godox)/i, 'Комплект света'],
]
const KIND_DEFAULT: Record<CategoryId, string> = {
  kits: 'Набор', cameras: 'Камера', lenses: 'Объектив', light: 'Свет', sound: 'Звук', gimbals: 'Стабилизатор',
  batteries: 'Питание', drones: 'Дрон', memory: 'Накопитель', grip: 'Grip', monitors: 'Монитор', misc: 'Разное',
  softboxes: 'Софтбокс', filters: 'Фильтр', stands: 'Стойка', cables: 'Кабель',
}
const BRANDS: [RegExp, string][] = [
  // сначала сторонние производители: «Sigma … Canon», «Godox V860 Sony» — бренд по производителю
  [/sigma/i, 'Sigma'], [/tamron/i, 'Tamron'], [/samyang/i, 'Samyang'], [/sirui/i, 'Sirui'], [/godox/i, 'Godox'], [/tilta/i, 'Tilta'], [/smallrig/i, 'SmallRig'], [/k&f/i, 'K&F Concept'],
  [/sony|zeiss/i, 'Sony'], [/canon/i, 'Canon'], [/fuj/i, 'Fujifilm'], [/ronin|osmo|dji|\bmic\b/i, 'DJI'], [/blackmagic/i, 'Blackmagic'],
  [/go ?pro/i, 'GoPro'], [/sigma/i, 'Sigma'], [/tamron/i, 'Tamron'], [/samyang/i, 'Samyang'], [/laowa/i, 'Laowa'], [/sirui/i, 'Sirui'],
  [/aputure|amaran/i, 'Aputure'], [/godox/i, 'Godox'], [/nanlite/i, 'Nanlite'], [/hollyland/i, 'Hollyland'], [/rode/i, 'Rode'],
  [/sennheiser/i, 'Sennheiser'], [/zoom h/i, 'Zoom'], [/shure/i, 'Shure'], [/tilta/i, 'Tilta'], [/smallrig/i, 'SmallRig'],
  [/lexar/i, 'Lexar'], [/sandisk/i, 'SanDisk'], [/samsung/i, 'Samsung'], [/kingston/i, 'Kingston'], [/k&f/i, 'K&F Concept'],
  [/tiffen/i, 'Tiffen'], [/freewell/i, 'Freewell'], [/feelworld/i, 'Feelworld'], [/lilliput/i, 'Lilliput'], [/atomos/i, 'Atomos'],
  [/vaxis/i, 'Vaxis'], [/manfrotto/i, 'Manfrotto'], [/kupo/i, 'Kupo'], [/swit/i, 'SWIT'], [/panasonic/i, 'Panasonic'], [/\bgp\b/i, 'GP'],
  [/ulanzi/i, 'Ulanzi'], [/ray-ban/i, 'Ray-Ban'], [/e-image/i, 'E-Image'], [/boya/i, 'Boya'], [/luiton/i, 'Luiton'], [/ultrasonic/i, 'Ultrasonic'],
  [/avenger/i, 'Avenger'], [/meking/i, 'Meking'],
]

const SPECS: [RegExp, string[], string?][] = [
  [/sony fx3/i, ['Полный кадр, 12 МП', '4K до 120p, S-Log3, S-Cinetone', 'Двойной ISO 800 / 12 800', 'Байонет Sony E'], 'Компактная кинокамера Cinema Line. Главный выбор для клипов, рекламы и документалки: тянет темноту и пишет 10 бит.'],
  [/sony fx30/i, ['APS-C (Super 35), 26 МП', '4K до 120p, S-Log3', 'Двойной ISO 800 / 2500', 'Байонет Sony E'], 'Младшая сестра FX3 с кропнутой матрицей. Тот же кино-цвет за полцены.'],
  [/sony fx6/i, ['Полный кадр, 4K до 120p', 'Встроенный электронный ND', 'SDI, XLR, таймкод', 'Байонет Sony E'], 'Рабочая лошадка для продакшна: электронный ND, звук по XLR и стабильная картинка в любом свете.'],
  [/a7r v/i, ['Полный кадр, 61 МП', '8K 24p, 4K 60p', 'AI-автофокус', 'Байонет Sony E']],
  [/a7 iv/i, ['Полный кадр, 33 МП', '4K 60p (S35), 10 бит', 'S-Log3, S-Cinetone', 'Байонет Sony E'], 'Гибрид для фото и видео. Лучший универсал в парке.'],
  [/a7 iii/i, ['Полный кадр, 24 МП', '4K 30p', 'Стабилизация в матрице', 'Байонет Sony E']],
  [/a7c/i, ['Полный кадр, 24 МП', 'Компактный корпус', '4K 30p', 'Байонет Sony E']],
  [/a6600/i, ['APS-C, 24 МП', 'Стабилизация в матрице', '4K 30p', 'Байонет Sony E']],
  [/a6400/i, ['APS-C, 24 МП', '4K 30p', 'Поворотный экран', 'Байонет Sony E']],
  [/zv-e10/i, ['APS-C, 24 МП', '4K 30p', 'Поворотный экран для влогов', 'Байонет Sony E']],
  [/blackmagic 6k/i, ['Super 35, 6K', 'Blackmagic RAW и ProRes', 'Встроенный ND', 'Байонет Canon EF']],
  [/canon r7/i, ['APS-C, 32 МП', '4K 60p', 'Байонет Canon RF']],
  [/canon r$/i, ['Полный кадр, 30 МП', '4K 30p', 'Байонет Canon RF']],
  [/5d mark iv/i, ['Полный кадр, 30 МП', '4K 30p', 'Байонет Canon EF']],
  [/g7x mark iii/i, ['1", 20 МП', '4K 30p, вход для микрофона', 'Вертикальное видео']],
  [/g7x mark ii/i, ['1", 20 МП', 'Full HD 60p', 'Карманный формат']],
  [/x-?t4/i, ['APS-C, 26 МП', 'Стабилизация в матрице', '4K 60p, F-Log', 'Байонет Fujifilm X']],
  [/x-?t3/i, ['APS-C, 26 МП', '4K 60p, F-Log', 'Байонет Fujifilm X']],
  [/x-s20/i, ['APS-C, 26 МП', 'Стабилизация в матрице', '6.2K 30p, F-Log2', 'Байонет Fujifilm X']],
  [/x-m5/i, ['APS-C, 26 МП', '6.2K 30p', 'Самая компактная X', 'Байонет Fujifilm X']],
  [/x100vi/i, ['40 МП, фикс 23 мм f/2', 'Стабилизация, встроенный ND', 'Плёночные симуляции Fujifilm']],
  [/hero13/i, ['5.3K 60p', 'HyperSmooth', 'Водонепроницаемая до 10 м']],
  [/max 360/i, ['Съёмка 360°', '5.6K сферическое видео', 'Водонепроницаемая до 5 м']],
  [/action 5 pro/i, ['4K 120p', 'Матрица 1/1.3"', 'Водозащита до 20 м']],
  [/pocket 4p/i, ['Карманный стабилизатор с камерой', 'Vlog Combo: микрофон и аксессуары']],
  [/osmo 3 pocket|pocket 3/i, ['Матрица 1"', '4K 120p', '3-осевой стабилизатор']],
  [/mini 5 pro/i, ['Мини-дрон', 'Пульт DJI RC-N3 в комплекте', 'Сдаётся с фильтрами по запросу']],
  [/ray-ban/i, ['Камера 12 МП в оправе', 'Съёмка от первого лица', 'Открытые динамики']],
  [/mic 2 duo/i, ['2 передатчика + приёмник', 'Запись 32-бит float', 'До 250 м']],
  [/mic 3/i, ['2 передатчика + приёмник', 'Шумоподавление', 'Встроенная запись']],
  [/mkh 416/i, ['Микрофон-пушка, суперкардиоида', 'Фантомное питание 48 В', 'Стандарт кино-звука']],
  [/zoom h6/i, ['6 дорожек', '4 входа XLR/TRS', 'Сменные капсюли']],
  [/zoom h8/i, ['12 дорожек', 'До 6 входов XLR/TRS', 'Сенсорный экран']],
  [/sm7b/i, ['Динамический, кардиоида', 'Для подкастов и вокала', 'Нужен XLR и усилитель']],
  [/aputure 600x/i, ['600 Вт, би-колор 2700–6500K', 'Байонет Bowens', 'Управление через Sidus Link']],
  [/aputure 300x/i, ['350 Вт, би-колор 2700–6500K', 'Байонет Bowens']],
  [/300c/i, ['RGBWW, 2500–7500K', 'Байонет Bowens', 'Эффекты и гели в приложении']],
  [/ray 660c/i, ['RGBWW, мощный осветитель', 'Широкий угол заливки']],
  [/150c/i, ['RGBWW, 150 Вт', 'Байонет Bowens']],
  [/ronin rs 4|rs 4/i, ['Нагрузка до 3 кг', 'Вертикальный режим', 'Автобаланс']],
  [/rs 3 mini/i, ['Нагрузка до 2 кг', 'Только горизонтально', 'Компактный']],
  [/rs 2/i, ['Нагрузка до 4.5 кг', 'Карбоновый корпус']],
  [/\brs 3$/i, ['Нагрузка до 3 кг', 'Автоблокировка осей']],
  [/ninja v/i, ['5", 1000 нит', 'Запись ProRes / ProRes RAW']],
  [/shinobi 7/i, ['7", 2200 нит', 'HDMI и SDI']],
  [/mars 400s/i, ['Передача видео до 120 м', 'HDMI и SDI', 'Мониторинг на телефон']],
  [/solidcom/i, ['6 гарнитур', 'Беспроводная связь съёмочной группы', 'Full duplex']],
]

function lensSpecs(name: string): string[] {
  const s: string[] = []
  const f = name.match(/(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*mm/i)
  if (f) s.push(`Фокусное: ${f[2] ? `${f[1]}–${f[2]}` : f[1]} мм`)
  const a = name.match(/f\s*\/?\s*\.?\s*(\d+(?:[.,]\d)?)(?:\s*-\s*(\d+(?:[.,]\d)?))?/i)
  if (a) s.push(`Диафрагма: f/${a[1].replace(',', '.')}${a[2] ? '–' + a[2] : ''}`)
  if (/sony e|e-mount|\bsony\b|zeiss|\bfe\b/i.test(name) && !/canon|ef\b/i.test(name)) s.push('Байонет: Sony E')
  else if (/\brf\b/i.test(name)) s.push('Байонет: Canon RF')
  else if (/canon|\bef\b/i.test(name)) s.push('Байонет: Canon EF')
  else if (/fuj|xf/i.test(name)) s.push('Байонет: Fujifilm X')
  else if (/sigma/i.test(name)) s.push('Байонет: Sony E') // Sigma без указания системы в парке под Sony E
  if (/\bgm\b/i.test(name)) s.push('Серия G Master')
  if (/\bart\b/i.test(name)) s.push('Серия Sigma Art')
  if (/anamorphic/i.test(name)) s.push('Анаморфот 1.33×')
  if (/macro/i.test(name)) s.push('Макро')
  return s
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48)

export interface SeedProduct extends Product { _status: '1' | 's' | 'b' }

// id товара → ключ фото (название как на сайте)
const PHOTO_KEY = new Map<string, string>()
export function photoKeyById(id: string): string | undefined {
  if (!PHOTO_KEY.size) buildProducts()
  return PHOTO_KEY.get(id)
}

export function buildProducts(): SeedProduct[] {
  const out: SeedProduct[] = []
  const now = Date.now()
  const newSet = new Set(NEW_ITEMS.map(n => n.toLowerCase().replace('fujfilm', 'fujifilm').replace('go pro', 'gopro')))
  let order = 0
  for (const [cat, block] of Object.entries(RAW) as [CategoryId, string][]) {
    for (const line of block.trim().split('\n')) {
      const [rawName, priceS, st] = line.split('|')
      let name = rawName.replace(/Fujfilm/i, 'Fujifilm').replace(/Go ?Pro/i, 'GoPro').replace(/FUJIFILM/g, 'Fujifilm')
      let kind = KIND_DEFAULT[cat]
      for (const [re, k] of KIND_PREFIX) if (re.test(name)) { kind = k; name = name.replace(re, ''); break }
      if (cat === 'cameras' && kind === 'Камера') {
        if (/osmo|gopro|hero/i.test(name)) kind = /pocket/i.test(name) ? 'Карманная камера' : 'Экшн-камера'
        else if (/g7x/i.test(name)) kind = 'Компактная камера'
        else if (/a7r/i.test(name)) kind = 'Фотоаппарат'
      }
      const brand = BRANDS.find(([re]) => re.test(rawName))?.[1] ?? 'Pixel'
      const price = Number(priceS)
      let specs: string[] = []
      let description: string | undefined
      for (const [re, sp, d] of SPECS) if (re.test(name)) { specs = sp; description = d; break }
      if (cat === 'lenses' && !/переходник/i.test(name)) specs = lensSpecs(rawName)
      if (cat === 'kits') { specs = ['Петлички + пушка + рекордер', 'Удочка и ветрозащита', 'Кабели и питание'], description = 'Всё для чистого звука на интервью и в кадре: собранный комплект, ничего не надо докупать.' }
      const id = slug(`${cat}-${name}`)
      const deposit = price >= 2000 ? Math.round((price * 12) / 5000) * 5000 : 0
      const isNew = newSet.has(rawName.toLowerCase().replace('fujfilm', 'fujifilm').replace('go pro', 'gopro')) || NEW_ITEMS.includes(rawName)
      const tags: string[] = []
      if (/sony e|e-mount|\bfe\b/i.test(rawName) || (/^sony|^объектив sony/i.test(rawName) && cat === 'lenses')) tags.push('sony-e')
      PHOTO_KEY.set(id, rawName.toLowerCase().replace(/ё/g, 'е').replace(/fujfilm/g, 'fujifilm').replace(/go pro/g, 'gopro').replace(/[^0-9a-zа-я]+/g, ''))
      out.push({ id, name: name.trim(), kind, brand, category: cat, price, deposit, isNew, specs, description, tags, createdAt: now - (500 - order++) * 86400000 / 3, _status: st as any })
    }
  }
  return out
}

function phone(r: () => number) {
  const ops = ['701', '702', '705', '707', '708', '747', '771', '775', '777', '778']
  const d = () => Math.floor(r() * 10)
  return `+7 ${ops[Math.floor(r() * ops.length)]} ${d()}${d()}${d()} ${d()}${d()} ${d()}${d()}`
}

const CUSTOMER_NAMES = [
  'Айдана Сейткали', 'Дамир Ахметов', 'Алия Жумабекова', 'Руслан Ким', 'Мадина Оспанова', 'Санжар Нурланов', 'Дарья Ли', 'Ерасыл Бекмуханов',
  'Асель Тулегенова', 'Максим Пак', 'Жанна Абдрахманова', 'Нурлан Каиргельдин', 'Камила Исаева', 'Артём Волков', 'Томирис Есенова', 'Бекзат Омаров',
  'Анель Мусина', 'Ильяс Сарсенбаев', 'Алтынай Касымова', 'Даниял Рахимов', 'Виктория Цой', 'Арсен Серикбаев', 'Айгерим Нуртаева', 'Олжас Шаймерденов',
  'Диана Хан', 'Ерлан Жаксылыков', 'Сабина Кенжебаева', 'Тимур Галиев',
]
const COMPANIES = ['Northern Lights Production', 'Steppe Films', 'Kino Lab', 'Studio 7', 'Wedding Story KZ', 'Brand Media', undefined, undefined, undefined, undefined]

/** history: false — только каталог и справочники (когда данные приходят из Supabase) */
export function buildAll(opts: { history?: boolean } = {}) {
  const r = mulberry32(20261115)
  const now = Date.now()
  const day = 86400000
  const products = buildProducts()

  // единицы техники
  const units: Unit[] = []
  for (const p of products) {
    const h = hash(p.id)
    const count = p._status === 's' ? 2 + (h % 2) : 1
    for (let i = 0; i < count; i++) {
      const city: CityId = count === 1 ? (h % 5 === 0 ? 'astana' : 'almaty') : i === 1 ? 'astana' : 'almaty'
      const pre = p.brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PXL'
      const conds = ['new', 'good', 'good', 'good', 'worn'] as const
      units.push({ id: `${p.id}#${i + 1}`, productId: p.id, serial: `${pre}-${String((h % 90000) + 10000 + i * 7)}`, city, condition: p.name.includes('дефект') ? 'worn' : conds[(h + i) % 5], maintenance: false })
    }
  }

  const customers: Customer[] = CUSTOMER_NAMES.map((name, i) => ({
    id: `c${i + 1}`, name, phone: phone(r), company: COMPANIES[Math.floor(r() * COMPANIES.length)], verified: r() > 0.25, blacklisted: i === 13,
    createdAt: now - Math.floor(r() * 400) * day, tags: r() > 0.7 ? ['Постоянный'] : [], note: i === 13 ? 'Вернул камеру с поцарапанным экраном, ущерб не возмещён' : undefined,
  }))

  const roles: Role[] = [
    { id: 'owner', name: 'Владелец', color: '#FF962E', system: true, permissions: ['dashboard', 'bookings.view', 'bookings.edit', 'bookings.cancel', 'calendar', 'products.view', 'products.edit', 'pricing.edit', 'units.edit', 'leads', 'customers', 'customers.blacklist', 'verify', 'issue', 'issue.override', 'contracts.void', 'staff', 'settings', 'finance'] },
    { id: 'manager', name: 'Менеджер', color: '#5AB0FF', permissions: ['dashboard', 'bookings.view', 'bookings.edit', 'bookings.cancel', 'calendar', 'products.view', 'leads', 'customers', 'verify', 'issue', 'issue.override'] },
    { id: 'warehouse', name: 'Кладовщик', color: '#7EE08A', permissions: ['dashboard', 'bookings.view', 'calendar', 'products.view', 'units.edit', 'issue'] },
    { id: 'accountant', name: 'Бухгалтер', color: '#C9A7FF', permissions: ['dashboard', 'bookings.view', 'finance', 'customers'] },
  ]
  const staff: Staff[] = [
    { id: 's1', name: 'Арман Нургалиев', phone: '+7 701 000 00 01', roleId: 'owner', city: 'all', active: true, pin: '0000', createdAt: now - 700 * day },
    { id: 's2', name: 'Дана Смагулова', phone: '+7 701 000 00 02', roleId: 'manager', city: 'almaty', active: true, pin: '1111', createdAt: now - 300 * day },
    { id: 's3', name: 'Тимур Абенов', phone: '+7 701 000 00 03', roleId: 'manager', city: 'astana', active: true, pin: '2222', createdAt: now - 200 * day },
    { id: 's4', name: 'Ерлан Сапаров', phone: '+7 701 000 00 04', roleId: 'warehouse', city: 'almaty', active: true, pin: '3333', createdAt: now - 150 * day },
    { id: 's5', name: 'Гульнара Ибраева', phone: '+7 701 000 00 05', roleId: 'accountant', city: 'all', active: true, pin: '4444', createdAt: now - 90 * day },
  ]

  const settings: Settings = {
    tiers: [{ days: 3, percent: 10 }, { days: 7, percent: 20 }, { days: 14, percent: 30 }],
    promos: [{ code: 'PIXEL10', percent: 10, active: true, uses: 14, note: 'Для новых клиентов' }, { code: 'STUDENT', percent: 15, active: true, uses: 6, note: 'Студентам киношкол' }],
    deliveryFee: { almaty: 3000, astana: 3000 },
    depositForNew: true,
    nightFee: 0,
    minHours: 24,
    points: {
      almaty: { address: 'ул. Толе би, 176', hours: 'Круглосуточно', open: 0, close: 24, phone: '' },
      astana: { address: 'ул. Бокейхана, 6', hours: '09:00–21:00, без выходных', open: 9, close: 21, phone: '' },
    },
    contractTemplates: DEFAULT_TEMPLATES,
  }

  // брони
  if (opts.history === false) return { products: products.map(({ _status, ...p }) => p as Product), units, customers: [], roles, staff, settings, bookings: [] as Booking[], leads: [] as Lead[] }
  const bookings: Booking[] = []
  const unitBusy = new Map<string, [number, number][]>()
  const free = (u: Unit, s: number, e: number) => !(unitBusy.get(u.id) || []).some(([a, b]) => s < b && a < e)
  const reserve = (u: Unit, s: number, e: number) => { const l = unitBusy.get(u.id) || []; l.push([s, e]); unitBusy.set(u.id, l) }
  const byCat = (c: CategoryId) => products.filter(p => p.category === c)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const base = startOfToday.getTime()
  const sources: Source[] = ['app', 'app', 'app', 'phone', 'instagram', 'whatsapp', 'walk-in']
  const methods: PaymentMethod[] = ['kaspi', 'kaspi', 'kaspi', 'card', 'cash', 'invoice']
  let codeN = 1040

  const makeBooking = (startDay: number, len: number, forceProduct?: SeedProduct, hour?: number) => {
    const city: CityId = r() > 0.25 ? 'almaty' : 'astana'
    const hours = [10, 12, 14, 18, 20]
    const start = base + startDay * day + (hour ?? pick(hours)) * 3600000
    const end = len === 0 ? base + (16 + Math.floor(r() * 6)) * 3600000 : start + len * day
    if (len === 0) len = Math.max(1, Math.ceil((end - start) / day))
    const wish: SeedProduct[] = []
    if (forceProduct) wish.push(forceProduct)
    else {
      const main = pick([...byCat('cameras'), ...byCat('cameras'), ...byCat('light'), ...byCat('sound'), ...byCat('drones')])
      wish.push(main)
      const extras = Math.floor(r() * 4)
      for (let i = 0; i < extras; i++) wish.push(pick([...byCat('lenses'), ...byCat('batteries'), ...byCat('memory'), ...byCat('stands'), ...byCat('light'), ...byCat('sound'), ...byCat('grip')]))
    }
    const items: BookingItem[] = []
    for (const p of wish) {
      if (items.some(i => i.productId === p.id)) continue
      const u = units.find(u => u.productId === p.id && u.city === city && free(u, start, end)) || units.find(u => u.productId === p.id && free(u, start, end))
      if (!u) continue
      reserve(u, start, end)
      items.push({ productId: p.id, qty: 1, price: p.price, unitIds: [u.id] })
    }
    if (!items.length) return
    const cust = pick(customers.filter(c => !c.blacklisted))
    const pr = calcPrice(items.map(i => ({ price: i.price, qty: i.qty })), len, settings, undefined, 0)
    const isPast = end < now, isNow = start <= now && end > now
    let status: Booking['status'] = isPast ? (r() > 0.08 ? 'returned' : 'cancelled') : isNow ? 'issued' : r() > 0.35 ? 'confirmed' : 'new'
    const createdAt = Math.min(start - Math.floor(1 + r() * 6) * day, now - Math.floor(1 + r() * 40) * 3600000)
    const paymentMethod = pick(methods)
    const paid = status === 'returned' || status === 'issued' ? pr.total : status === 'confirmed' && r() > 0.5 ? Math.round(pr.total / 2) : 0
    const managerId = city === 'almaty' ? 's2' : 's3'
    const history = [{ at: createdAt, by: 'Клиент', text: 'Бронь создана' }]
    if (status !== 'new') history.push({ at: createdAt + 3600000, by: city === 'almaty' ? 'Дана' : 'Тимур', text: status === 'cancelled' ? 'Отменена: клиент перенёс съёмку' : 'Подтверждена' })
    if (status === 'issued' || status === 'returned') history.push({ at: start, by: 'Ерлан', text: 'Выдана клиенту' })
    if (status === 'returned') history.push({ at: end, by: 'Ерлан', text: 'Возвращена, проверено' })
    bookings.push({
      id: `b${codeN}`, code: `PX-${codeN++}`, customerId: cust.id, city, items, start, end, days: len,
      subtotal: pr.subtotal, discount: pr.discount, delivery: 0, total: pr.total, deposit: 0, paid,
      paymentStatus: paid >= pr.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid', paymentMethod, deliveryType: r() > 0.8 ? 'delivery' : 'pickup',
      address: undefined, status, source: pick(sources), managerId, createdAt, history,
    })
  }
  // история за год: сезонность (пик в декабре и весной/осенью, спад в январе и июле) и выходные
  const SEASON = [0.55, 0.7, 0.95, 1.1, 1.15, 0.95, 0.75, 0.8, 1.15, 1.2, 1.1, 1.45] // янв…дек
  const WEEKDAY = [1.35, 0.7, 0.75, 0.85, 1.0, 1.35, 1.5] // вс…сб
  for (let d = -365; d < 0; d++) {
    const dt = new Date(base + d * day)
    const lambda = 4 * SEASON[dt.getMonth()] * WEEKDAY[dt.getDay()] * (1 + (d + 365) / 900) // плюс рост бизнеса за год
    let n = Math.floor(lambda) + (r() < lambda % 1 ? 1 : 0)
    while (n-- > 0) makeBooking(d, 1 + Math.floor(r() * r() * 6))
  }
  // занятые прямо сейчас
  for (const p of products.filter(p => p._status === 'b')) makeBooking(-1, 3, p)
  // плотнее вокруг сегодняшнего дня: на руках, выдачи и возвраты сегодня
  for (let i = 0; i < 8; i++) makeBooking(-Math.floor(r() * 4), 2 + Math.floor(r() * 5))
  for (let i = 0; i < 6; i++) makeBooking(0, 1 + Math.floor(r() * 3), undefined, 15 + i)
  for (let i = 0; i < 5; i++) makeBooking(-1 - Math.floor(r() * 2), 0, undefined, 12)
  for (let i = 0; i < 25; i++) makeBooking(1 + Math.floor(r() * 10), 1 + Math.floor(r() * 4))
  bookings.sort((a, b) => b.createdAt - a.createdAt)

  const leads: Lead[] = [
    { id: 'l1', type: 'selection', name: 'Айжан', phone: phone(r), text: 'Снимаем рекламу кофейни, 2 дня. Нужна камера, свет и звук, бюджет до 60 000 ₸ в сутки.', city: 'almaty', status: 'new', createdAt: now - 2 * 3600000 },
    { id: 'l2', type: 'waitlist', name: 'Ринат', phone: phone(r), text: 'Сообщите, когда освободится', productId: products.find(p => /a7r v/i.test(p.name))?.id, city: 'almaty', status: 'new', createdAt: now - 5 * 3600000 },
    { id: 'l3', type: 'callback', name: 'Мария', phone: phone(r), text: 'Перезвоните по поводу долгосрочной аренды FX3 на месяц', city: 'almaty', status: 'in_progress', assigneeId: 's2', createdAt: now - day },
    { id: 'l4', type: 'production', name: 'Steppe Films', phone: phone(r), text: 'Полнометражный проект, 18 смен в декабре. Нужен КП на камеру, оптику, свет.', city: 'astana', status: 'in_progress', assigneeId: 's3', createdAt: now - 2 * day },
    { id: 'l5', type: 'question', name: 'Даурен', phone: phone(r), text: 'Можно ли взять дрон без опыта? Есть ли инструктаж?', city: 'almaty', status: 'done', assigneeId: 's2', createdAt: now - 3 * day },
    { id: 'l6', type: 'waitlist', name: 'Аружан', phone: phone(r), text: 'Жду DJI Mic 3 на выходные', productId: products.find(p => /mic 3/i.test(p.name))?.id, city: 'almaty', status: 'new', createdAt: now - 7 * 3600000 },
    { id: 'l7', type: 'selection', name: 'Игорь', phone: phone(r), text: 'Подкаст на двоих, нужен звук и 2 камеры', city: 'astana', status: 'new', createdAt: now - 26 * 3600000 },
    { id: 'l8', type: 'callback', name: 'Сауле', phone: phone(r), text: 'Хочу понять, какой свет взять для предметки', city: 'almaty', status: 'lost', assigneeId: 's2', createdAt: now - 6 * day },
    { id: 'l9', type: 'question', name: 'Азамат', phone: phone(r), text: 'Нужен ли залог, если я впервые?', city: 'almaty', status: 'done', assigneeId: 's2', createdAt: now - 4 * day },
  ]

  // заявки за год: часть стала бронями (done), часть потерялась
  const LT: Lead['type'][] = ['selection', 'callback', 'question', 'waitlist', 'production']
  const NAMES = ['Алия', 'Ерасыл', 'Динара', 'Тимур', 'Камила', 'Нурлан', 'Асель', 'Данияр', 'Жанель', 'Арман', 'Мадина', 'Олжас']
  for (let i = 0; i < 260; i++) {
    const at = now - Math.floor(2 + r() * 360) * day - Math.floor(r() * day)
    const x = r()
    leads.push({ id: `lh${i}`, type: pick(LT), name: pick(NAMES), phone: phone(r), text: 'Подбор техники под съёмку', city: r() > 0.25 ? 'almaty' : 'astana',
      status: x < 0.58 ? 'done' : x < 0.86 ? 'lost' : 'in_progress', assigneeId: 's2', createdAt: at })
  }
  bookings.sort((a, b) => b.createdAt - a.createdAt)

  return { products: products.map(({ _status, ...p }) => p as Product), units, customers, roles, staff, settings, bookings, leads }
}
