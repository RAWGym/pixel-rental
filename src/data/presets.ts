import type { Product } from './types'

export interface Preset { id: string; title: string; subtitle: string; tag: string; items: { match: RegExp; qty?: number }[] }

export const PRESETS: Preset[] = [
  { id: 'interview', title: 'Интервью', subtitle: 'Две камеры, чистый звук, мягкий свет', tag: '2 камеры', items: [
    { match: /^sony a7 iv$/i }, { match: /^sony fx30$/i }, { match: /sony 24-70mm gm ii/i }, { match: /sigma art 16-28/i }, { match: /dji mic 2 duo/i },
    { match: /aputure 300x/i }, { match: /light dome ii/i }, { match: /godox 380/i }, { match: /np-fz100$/i, qty: 4 }, { match: /sandisk 128/i, qty: 1 } ] },
  { id: 'vlog', title: 'Влог и Reels', subtitle: 'Лёгкий сетап, который поместится в рюкзак', tag: 'Соло', items: [
    { match: /^sony zv-e10$/i }, { match: /sigma 16mm f1\.4/i }, { match: /dji mic mini 2/i }, { match: /ronin rs 3 mini/i }, { match: /np-fw50$/i, qty: 2 } ] },
  { id: 'podcast', title: 'Подкаст', subtitle: 'Два голоса, две камеры, свет на стол', tag: 'Студия', items: [
    { match: /shure sm7b/i, qty: 2 }, { match: /zoom h6/i }, { match: /rode psa1/i, qty: 2 }, { match: /^sony a7 iii$/i }, { match: /^sony a6400$/i }, { match: /amaran 150c/i }, { match: /xlr – xlr 3/i, qty: 2 } ] },
  { id: 'clip', title: 'Клип / реклама', subtitle: 'Кино-камера, светосильная оптика, мощный свет', tag: 'Кино', items: [
    { match: /^sony fx3$/i }, { match: /tilta advanced kit fx3/i }, { match: /sony 35mm gm/i }, { match: /sony 85mm gm/i }, { match: /ronin rs 4/i },
    { match: /aputure 600x/i }, { match: /nova p300 kit/i }, { match: /atomos ninja v/i }, { match: /smallrig v-mount/i, qty: 2 }, { match: /tiffen mist/i } ] },
  { id: 'product', title: 'Предметка', subtitle: 'Стол, свет, макро и цветовая шкала', tag: 'Фото', items: [
    { match: /^sony a7r v$/i }, { match: /sigma 70mm f2\.8 dg macro/i }, { match: /панельки/i, qty: 2 }, { match: /godox 60×60/i, qty: 2 }, { match: /color checker/i }, { match: /штатив e-image/i } ] },
  { id: 'aerial', title: 'Съёмка с воздуха', subtitle: 'Дрон, фильтры и экшн-камера в подвес', tag: 'Outdoor', items: [
    { match: /mini 5 pro \(dji/i }, { match: /набор фильтров dji mini 5/i }, { match: /osmo action 5 pro/i }, { match: /монопод для dji action/i } ] },
]

export function resolvePreset(p: Preset, products: Product[]) {
  return p.items.map(i => ({ product: products.find(x => i.match.test(x.name)), qty: i.qty ?? 1 })).filter(x => x.product) as { product: Product; qty: number }[]
}
