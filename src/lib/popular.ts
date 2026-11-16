import type { Product } from '../data/types'

/** Порядок категорий для «Популярных», пока истории броней мало: сначала то, ради чего приходят */
const RANK: Record<string, number> = { cameras: 0, lenses: 1, light: 2, sound: 3, gimbals: 4, drones: 5, monitors: 6, kits: 7, softboxes: 8, stands: 9, grip: 10, filters: 11, batteries: 12, memory: 13, misc: 14, cables: 15 }

/** Сортировка «Популярные»: по числу броней, при равенстве — по важности категории, затем дороже выше */
export const byPopularity = (count: Map<string, number>) => (a: Product, b: Product) =>
  (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || (RANK[a.category] ?? 99) - (RANK[b.category] ?? 99) || b.price - a.price
