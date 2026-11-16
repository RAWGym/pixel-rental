import { PHOTO_DATA, PHOTO_ALIAS } from './photoData'
import { photoKeyById } from './seed'

export const photoNorm = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/fujfilm/g, 'fujifilm').replace(/go pro/g, 'gopro').replace(/[^0-9a-zа-я]+/g, '')

export interface Photo { thumb: string; full: string; box: [x0: number, y0: number, x1: number, y1: number, aspect: number] }

/** Фото товара с сайта pixelrental.kz (если нашлось). */
export function photoFor(p: { id: string; name: string }): Photo | null {
  const key = photoKeyById(p.id) ?? photoNorm(p.name)
  const d = PHOTO_DATA[key] ?? PHOTO_DATA[PHOTO_ALIAS[key]]
  return d ? { thumb: d[0], full: d[1], box: d[2] } : null
}
