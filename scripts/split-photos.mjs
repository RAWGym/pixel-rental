// Для сайта (Vercel): фото товаров из src/data/photoData.ts (base64 внутри JS, ~4,4 МБ)
// раскладываются в отдельные файлы public/photos/*.webp, а в бандл попадает только индекс с путями.
// Expo по-прежнему использует photoData.ts (всё в одном файле, работает офлайн).
// Запуск: node scripts/split-photos.mjs  (вызывается из npm run build:web)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = readFileSync(resolve(root, 'src/data/photoData.ts'), 'utf8')
const grab = name => {
  const m = src.match(new RegExp(`export const ${name}[^=]*= (\\{.*?\\})\\s*$`, 'm'))
  if (!m) throw new Error(`не нашёл ${name}`)
  return JSON.parse(m[1])
}
const data = grab('PHOTO_DATA'), alias = grab('PHOTO_ALIAS')
const dir = resolve(root, 'public/photos')
mkdirSync(dir, { recursive: true })
const out = {}
let bytes = 0, files = 0
const save = (dataUrl, tag) => {
  // полноразмерные фото уже ссылаются на pixelrental.kz — оставляем ссылку как есть
  if (!dataUrl.startsWith('data:')) return dataUrl
  const [, mime, b64] = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]
  const buf = Buffer.from(b64, 'base64')
  const name = `${createHash('sha1').update(buf).digest('hex').slice(0, 12)}-${tag}.${ext}`
  const path = resolve(dir, name)
  if (!existsSync(path)) { writeFileSync(path, buf); files++; bytes += buf.length }
  return `/photos/${name}`
}
for (const [key, [thumb, full, box]] of Object.entries(data)) out[key] = [save(thumb, 't'), save(full, 'f'), box]
writeFileSync(resolve(root, 'src/data/photoIndex.ts'),
  `// Сгенерировано scripts/split-photos.mjs — пути к фото в public/photos (для сайта)\n` +
  `export const PHOTO_DATA: Record<string, [thumb: string, full: string, box: [x0: number, y0: number, x1: number, y1: number, aspect: number]]> = ${JSON.stringify(out)}\n` +
  `export const PHOTO_ALIAS: Record<string, string> = ${JSON.stringify(alias)}\n`)
console.log(`photos: ${Object.keys(out).length} товаров, новых файлов ${files} (${(bytes / 1024).toFixed(0)} КБ)`)
