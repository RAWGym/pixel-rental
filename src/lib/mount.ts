import type { Product } from '../data/types'

/** Байонет из характеристик («Байонет: Sony E», «Байонет Canon RF»); переходники — отдельно */
export const ADAPTER = 'Переходники', UNKNOWN = 'Другие'
const NAMES: [RegExp, string][] = [
  [/sony\s*e|\bfe\b|e-?mount/i, 'Sony E'], [/canon\s*rf|\brf\b/i, 'Canon RF'], [/canon\s*ef|\bef\b/i, 'Canon EF'], [/fuji\w*\s*x|\bx-?mount/i, 'Fujifilm X'],
  [/l-?mount|\bleica\s*l\b/i, 'L-Mount'], [/nikon\s*z|\bz-?mount/i, 'Nikon Z'], [/m4\/3|mft|micro/i, 'MFT'], [/\bpl\b/i, 'PL'],
]
export function mountOf(p: Pick<Product, 'name' | 'kind' | 'specs'>): string {
  if (/переходник|адаптер|adapter/i.test(p.name + ' ' + p.kind)) return ADAPTER
  const s = p.specs.find(x => /^байонет/i.test(x))
  if (!s) return UNKNOWN
  const v = s.replace(/^байонет:?\s*/i, '')
  return NAMES.find(([re]) => re.test(v))?.[1] ?? v
}
export const mountSlug = (m: string) => m.toLowerCase().replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '')
