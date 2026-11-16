// Генерирует supabase/seed/catalog.sql: 241 товар, единицы техники по городам, промокоды.
// Источник — те же данные, что у демо (src/data/seed.ts). Фото: миниатюра — путь сайта /photos/…, оригинал — ссылка pixelrental.kz.
// Запуск: node scripts/gen-seed-sql.mjs
import { build } from 'esbuild'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = resolve(tmpdir(), `px-seed-${Date.now()}.mjs`)
await build({
  stdin: { contents: `export { buildAll } from './src/data/seed'; export { photoFor } from './src/data/photos'`, resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error',
  plugins: [{ name: 'photo-index', setup(b) { b.onResolve({ filter: /\/photoData$|^\.\/photoData$/ }, a => ({ path: resolve(a.resolveDir, 'photoIndex.ts') })) } }],
})
const { buildAll, photoFor } = await import(pathToFileURL(tmp).href)
rmSync(tmp)
const db = buildAll()

const q = v => v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`
const arr = a => `array[${(a ?? []).map(q).join(',')}]::text[]`
const rows = (table, cols, list) => list.length ? `insert into public.${table} (${cols.join(', ')}) values\n${list.map(r => `  (${r.join(', ')})`).join(',\n')}\non conflict (${cols[0]}) do nothing;\n` : ''

const products = db.products.map(p => { const ph = photoFor(p); return [q(p.id), q(p.name), q(p.kind), q(p.brand), q(p.category), q(p.price), q(p.deposit), q(p.isNew), q(!!p.hidden), arr(p.specs), arr(p.includes), q(ph?.thumb ?? null), q(ph?.full ?? null), q(p.description ?? null), arr(p.tags), `to_timestamp(${Math.floor(p.createdAt / 1000)})`] })
const units = db.units.map(u => [q(u.id), q(u.productId), q(u.serial), q(u.city), q(u.condition), q(u.maintenance), q(u.note ?? null)])
const promos = (db.settings.promos ?? []).map(p => [q(p.code), q(p.percent), q(p.active), q(p.uses ?? 0), q(p.note ?? null)])

const sql = `-- Сгенерировано scripts/gen-seed-sql.mjs — каталог Pixel Rental
-- ${db.products.length} товаров, ${db.units.length} единиц техники, ${promos.length} промокодов
begin;
${rows('products', ['id', 'name', 'kind', 'brand', 'category_id', 'price', 'deposit', 'is_new', 'hidden', 'specs', 'includes', 'photo_thumb', 'photo_full', 'description', 'tags', 'created_at'], products)}
${rows('product_units', ['id', 'product_id', 'serial', 'city', 'condition', 'maintenance', 'note'], units)}
${rows('promos', ['code', 'percent', 'active', 'uses', 'note'], promos)}
update public.settings set tiers = '${JSON.stringify(db.settings.tiers)}'::jsonb, delivery_fee = '${JSON.stringify(db.settings.deliveryFee)}'::jsonb where id = 1;
commit;
`
mkdirSync(resolve(root, 'supabase/seed'), { recursive: true })
writeFileSync(resolve(root, 'supabase/seed/catalog.sql'), sql)
console.log(`catalog.sql: ${db.products.length} товаров, ${db.units.length} единиц, ${promos.length} промокодов, ${(sql.length / 1024).toFixed(0)} КБ`)
