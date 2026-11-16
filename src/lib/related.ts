import type { Product } from '../data/types'

const mountOf = (p: Product) => p.specs.find(s => /Байонет/i.test(s))?.replace(/^Байонет:?\s*/i, '')
const BATT: [RegExp, RegExp][] = [
  [/fx3|fx30|a7 iv|a7 iii|a7c|a6600|a7r v/i, /^sony np-fz100$/i], [/zv-e10|a6400/i, /^sony np-fw50$/i], [/fx6/i, /np-f970/i],
  [/x-?t4|x-s20/i, /^fujifilm np-w235$/i], [/x-?t3|x-m5/i, /np-w126/i], [/canon r$|canon r7|5d mark/i, /lp-e6nh/i], [/blackmagic/i, /sony bp 99|v-mount 99/i],
  [/action 5/i, /зарядный хаб dji/i], [/hero13|max 360/i, /монопод gopro/i],
]
const CAGE: [RegExp, RegExp][] = [
  [/fx6/i, /tilta advanced fx6/i], [/fx3|fx30/i, /tilta advanced kit fx3/i], [/blackmagic/i, /tilta advanced kit blackmagic/i], [/a7c/i, /клетка для sony a7c/i],
  [/a6600/i, /клетка для sony a6600/i], [/a7 iii/i, /клетка для sony a7 iii/i], [/a7 iv/i, /клетка для sony a7 iv/i], [/a6400/i, /клетка для sony a6400/i], [/x-?t[34]/i, /x-t4\/x-t3/i],
]

export function related(p: Product, all: Product[]): Product[] {
  const vis = all.filter(x => !x.hidden && x.id !== p.id)
  const out: Product[] = []
  const add = (x?: Product) => { if (x && !out.includes(x)) out.push(x) }
  const by = (re: RegExp) => vis.find(x => re.test(x.name))
  const m = mountOf(p)
  if (p.category === 'cameras') {
    for (const [c, b] of BATT) if (c.test(p.name)) add(by(b))
    for (const [c, b] of CAGE) if (c.test(p.name)) add(by(b))
    if (m) vis.filter(x => x.category === 'lenses' && mountOf(x) === m).sort((a, b) => b.price - a.price).slice(0, 4).forEach(add)
    add(by(/dji mic 2 duo/i)); add(by(/sandisk 128/i)); add(by(/ronin rs 4/i))
  } else if (p.category === 'lenses') {
    if (m) vis.filter(x => x.category === 'cameras' && mountOf(x) === m).sort((a, b) => b.price - a.price).slice(0, 4).forEach(add)
    add(by(/^nd k&f 82/i)); add(by(/tiffen/i))
  } else if (p.category === 'light') {
    add(by(/light dome ii/i)); add(by(/lantern 90/i)); add(by(/godox 380/i)); add(by(/c-stand 40/i)); add(by(/v-mount 98/i)); add(by(/sandbag/i))
  } else if (p.category === 'sound') {
    add(by(/zoom h6/i)); add(by(/xlr – xlr 3/i)); add(by(/удочка/i)); add(by(/blimp/i)); add(by(/eneloop/i))
  } else if (p.category === 'gimbals') {
    add(by(/^sony fx3$/i)); add(by(/^sony a7 iv$/i)); add(by(/рукоятка tilta/i)); add(by(/vaxis/i))
  } else if (p.category === 'drones') {
    add(by(/набор фильтров dji mini/i)); add(by(/samsung evo plus/i))
  } else if (p.category === 'softboxes' || p.category === 'stands') {
    vis.filter(x => x.category === 'light').slice(0, 4).forEach(add)
  }
  if (out.length < 4) vis.filter(x => x.category === p.category).sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price)).slice(0, 6 - out.length).forEach(add)
  return out.slice(0, 8)
}
