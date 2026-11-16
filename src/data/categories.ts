import type { CategoryId } from './types'

export interface CategoryMeta { id: CategoryId; name: string; short: string; hint: string }

export const CATEGORIES: CategoryMeta[] = [
  { id: 'cameras', name: 'Камеры', short: 'Камеры', hint: 'Кино, фото, экшн' },
  { id: 'lenses', name: 'Объективы', short: 'Оптика', hint: 'E, RF, EF, X' },
  { id: 'light', name: 'Свет', short: 'Свет', hint: 'LED, RGB, вспышки' },
  { id: 'sound', name: 'Звук', short: 'Звук', hint: 'Петлички, пушки, рекордеры' },
  { id: 'gimbals', name: 'Стабилизаторы', short: 'Стабы', hint: 'Ronin, слайдеры' },
  { id: 'batteries', name: 'Аккумуляторы', short: 'АКБ', hint: 'V-mount, NP, зарядки' },
  { id: 'drones', name: 'Дроны', short: 'Дроны', hint: 'DJI' },
  { id: 'memory', name: 'Карты памяти', short: 'Карты', hint: 'SD, CFexpress, SSD' },
  { id: 'grip', name: 'Grip', short: 'Grip', hint: 'Клетки, крепления, эплбоксы' },
  { id: 'monitors', name: 'Мониторы', short: 'Мониторы', hint: 'Накамерные, сендеры' },
  { id: 'softboxes', name: 'Софтбоксы', short: 'Софтбоксы', hint: 'Dome, Lantern' },
  { id: 'filters', name: 'Фильтры', short: 'Фильтры', hint: 'ND, Mist, поляр' },
  { id: 'stands', name: 'Штативы и стойки', short: 'Стойки', hint: 'C-stand, штативы' },
  { id: 'cables', name: 'Шнуры', short: 'Шнуры', hint: 'XLR, HDMI, D-Tap' },
  { id: 'misc', name: 'Разное', short: 'Разное', hint: 'Суфлёр, дым, хромакей' },
  { id: 'kits', name: 'Наборы', short: 'Наборы', hint: 'Готовые комплекты' },
]

export const catName = (id: CategoryId) => CATEGORIES.find(c => c.id === id)?.name ?? id
