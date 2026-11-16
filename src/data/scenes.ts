import type { Product } from './types'

/** «Что снимаем?» — готовые комплекты под задачу в трёх уровнях */
export type Tier = 'budget' | 'optimal' | 'pro'
export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: 'budget', label: 'Бюджетно', hint: 'Всё нужное, без лишнего' },
  { id: 'optimal', label: 'Оптимально', hint: 'Лучшее соотношение цены и картинки' },
  { id: 'pro', label: 'Про', hint: 'Кино-уровень, максимум возможностей' },
]

type Item = [match: RegExp, qty?: number]
export interface Scene { id: string; title: string; subtitle: string; tags: string; kits: Record<Tier, Item[]> }

export const SCENES: Scene[] = [
  { id: 'interview', title: 'Интервью', subtitle: 'Две камеры, чистый голос, мягкий свет', tags: 'YouTube · бизнес · подкаст-видео', kits: {
    budget: [[/^sony a6400$/i], [/sony 16-50mm/i], [/dji mic mini duo/i], [/amaran p60c/i], [/стойка godox 213b/i], [/^sony np-fw50$/i, 2], [/sandisk 64/i]],
    optimal: [[/^sony a7 iv$/i], [/^sony a6600$/i], [/sony 24-70mm gm f2\.8/i], [/sigma 16mm f1\.4/i], [/dji mic 2 duo/i], [/aputure 300x/i], [/light dome ii/i], [/стойка godox 380/i], [/^sony np-fz100$/i, 3], [/sandisk 128/i, 2]],
    pro: [[/^sony fx3$/i], [/^sony fx30$/i], [/24-70mm gm ii/i], [/sony 85mm gm/i], [/mkh 416/i], [/zoom h6/i], [/aputure 600x/i], [/light dome 150/i], [/c-stand k2/i], [/ninja v/i], [/smallrig v-mount/i, 2], [/tough cfexpress/i, 2]],
  } },
  { id: 'vlog', title: 'Влог и Reels', subtitle: 'Лёгкий сетап, который поместится в рюкзак', tags: 'соло · путешествия · соцсети', kits: {
    budget: [[/^sony zv-e10$/i], [/sony 16-50mm/i], [/dji mic mini 2/i], [/^sony np-fw50$/i, 2], [/sandisk 64/i]],
    optimal: [[/osmo pocket 4p/i], [/dji mic 2 duo/i], [/osmo mobile 6/i], [/samsung evo plus/i]],
    pro: [[/^sony a7 iv$/i], [/sony 14mm gm/i], [/sony 20mm g/i], [/dji mic 3/i], [/ronin rs 3 mini/i], [/gopro hero13/i], [/^sony np-fz100$/i, 3], [/sony 256/i]],
  } },
  { id: 'podcast', title: 'Подкаст', subtitle: 'Два голоса, две камеры, свет на стол', tags: 'студия · разговорный формат', kits: {
    budget: [[/^sony a6400$/i], [/sony 16-50mm/i], [/dji mic mini duo/i], [/godox tl60/i, 2], [/штатив алюминиевый/i]],
    optimal: [[/shure sm7b/i, 2], [/zoom h6/i], [/rode psa1/i, 2], [/^sony a7 iii$/i], [/^sony a6400$/i], [/amaran 150c/i], [/xlr – xlr 3/i, 2]],
    pro: [[/shure sm7b/i, 2], [/zoom h8/i], [/rode psa1/i, 2], [/^sony fx3$/i], [/^sony fx30$/i], [/24-70mm gm ii/i], [/sigma art 16-28/i], [/amaran 300c/i], [/accent b7c/i], [/xlr – xlr 3/i, 2], [/shinobi/i]],
  } },
  { id: 'clip', title: 'Клип', subtitle: 'Кинокамера, светосила, цветной свет и дым', tags: 'музыка · арт · fashion', kits: {
    budget: [[/^sony a7 iii$/i], [/^sony 50mm f1\.8$/i], [/^dji rs 3$/i], [/amaran 150c/i], [/aputure mc rgbw/i, 2], [/tiffen mist/i], [/^sony np-fz100$/i, 3]],
    optimal: [[/^sony fx30$/i], [/tilta advanced kit fx3/i], [/sony 35mm gm/i], [/ronin rs 4/i], [/amaran 300c/i], [/forza 60c/i], [/ninja v/i], [/tiffen mist/i], [/smallrig v-mount/i, 2]],
    pro: [[/^sony fx3$/i], [/tilta advanced kit fx3/i], [/sony 35mm gm/i], [/sony 85mm gm/i], [/ronin rs 4/i], [/aputure 600x/i], [/nova p300 kit/i], [/amaran f22c/i], [/дым-машина/i], [/ninja v/i], [/smallrig v-mount/i, 2]],
  } },
  { id: 'product', title: 'Предметка', subtitle: 'Стол, ровный свет, макро и цветовая шкала', tags: 'маркетплейсы · каталоги · еда', kits: {
    budget: [[/^sony a6400$/i], [/sigma 30mm f1\.4/i], [/панельки/i, 2], [/штатив алюминиевый/i]],
    optimal: [[/^sony a7r v$/i], [/sigma 70mm f2\.8 dg macro/i], [/панельки/i, 2], [/godox 60×60/i, 2], [/color checker/i], [/штатив e-image/i]],
    pro: [[/^sony a7r v$/i], [/laowa 24mm/i], [/sigma 70mm f2\.8 dg macro/i], [/aputure 300x/i], [/octadome 120/i], [/godox 60×60/i, 2], [/color checker/i], [/c-stand k2/i], [/штатив e-image/i]],
  } },
  { id: 'aerial', title: 'Съёмка с воздуха', subtitle: 'Дрон, фильтры и экшн-камера', tags: 'outdoor · недвижимость · тревел', kits: {
    budget: [[/osmo action 5 pro/i], [/монопод для dji action/i], [/зарядный хаб dji/i]],
    optimal: [[/mini 5 pro \(dji/i], [/набор фильтров dji mini 5/i], [/samsung evo plus/i]],
    pro: [[/mini 5 pro \(dji/i], [/набор фильтров dji mini 5/i], [/osmo action 5 pro/i], [/gopro max 360/i], [/ssd samsung t7/i]],
  } },
  { id: 'wedding', title: 'Свадьба', subtitle: 'Две камеры, портретная оптика, вспышка и звук клятв', tags: 'репортаж · love story', kits: {
    budget: [[/^sony a7 iii$/i], [/sony 28-70mm/i], [/^sony 50mm f1\.8$/i], [/godox v860 iii sony/i], [/^sony np-fz100$/i, 3], [/sandisk 128/i, 2]],
    optimal: [[/^sony a7 iv$/i], [/^sony a7 iii$/i], [/sony 24-70mm gm f2\.8/i], [/sony 85mm gm/i], [/^godox v1$/i], [/dji mic 2 duo/i], [/ronin rs 3 mini/i], [/^sony np-fz100$/i, 4], [/sony 256/i, 2]],
    pro: [[/^sony fx3$/i], [/^sony a7 iv$/i], [/24-70mm gm ii/i], [/70-200 mm gm ii/i], [/sony 50mm gm/i], [/ronin rs 4/i], [/dji mic 3/i], [/^godox v1$/i], [/godox x pro/i], [/tough cfexpress/i, 2], [/^sony np-fz100$/i, 4]],
  } },
  { id: 'ads', title: 'Реклама', subtitle: 'Площадка: кино-камера, большой свет, мониторинг', tags: 'бренды · продакшн', kits: {
    budget: [[/^sony fx30$/i], [/sony 18-105mm/i], [/amaran 300c/i], [/aputure mc rgbw/i, 2], [/стойка godox 380/i], [/feelworld lut7/i]],
    optimal: [[/^sony fx3$/i], [/tilta advanced kit fx3/i], [/24-70mm gm ii/i], [/aputure 600x/i], [/light dome 150/i], [/amaran f22c/i], [/ninja v/i], [/mars 400s/i], [/swit v-mount 220/i, 2], [/c-stand k2/i, 2]],
    pro: [[/^sony fx6$/i], [/tilta advanced fx6/i], [/24-70mm gm ii/i], [/sony 85mm gm/i], [/sigma 135mm/i], [/ray 660c/i], [/aputure 600x/i], [/nova p300 kit/i], [/octadome 120/i], [/режиссёрский монитор/i], [/mars 400s/i], [/solidcom/i], [/c-stand k2/i, 3]],
  } },
]

export function resolveKit(items: Item[], products: Product[]) {
  return items.map(([m, qty = 1]) => ({ product: products.find(p => !p.hidden && m.test(p.name)), qty }))
    .filter((x): x is { product: Product; qty: number } => !!x.product)
}
