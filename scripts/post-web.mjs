// После `vite build --mode web`: подставляем в sw.js версию сборки и список файлов для офлайна.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = resolve(root, 'dist-web')
const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
// ассеты, на которые ссылается index.html (стартовый JS/CSS), + оболочка PWA
const linked = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1])
const precache = ['/', '/offline.html', '/manifest.webmanifest', '/icon-192.png?v=2', '/icon-512.png?v=2', '/apple-touch-icon.png?v=2', '/favicon.svg', '/logo.svg', ...new Set(linked)]
const build = new Date().toISOString().replace(/\D/g, '').slice(0, 12)
const swPath = resolve(dist, 'sw.js')
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(precache)))
const assets = readdirSync(resolve(dist, 'assets'))
console.log(`sw.js: версия ${build}, в офлайн-кэше ${precache.length} файлов; ассетов в сборке: ${assets.length}`)
