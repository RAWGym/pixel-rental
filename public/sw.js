// Pixel Rental — сервис-воркер сайта (PWA).
// Версия кэша подставляется при сборке (scripts/post-web.mjs): новый релиз = новый кэш, старый удаляется.
const VERSION = '__BUILD__'
const SHELL = `px-shell-${VERSION}`
const STATIC = 'px-static-v1' // /assets и /photos — имена с хэшем, не меняются
const IMAGES = 'px-images-v1' // фото с pixelrental.kz
const PRECACHE = __PRECACHE__

self.addEventListener('install', e => {
  // новая версия ждёт, пока пользователь нажмёт «Обновить» (баннер в приложении), — без внезапной перезагрузки
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('px-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting() })

const trim = async (name, max) => { const c = await caches.open(name); const ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]) }

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // страницы: сначала сеть (свежая версия), без сети — кэш, иначе офлайн-страница
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return r })
      .catch(async () => (await caches.match('/')) || (await caches.match('/offline.html'))))
    return
  }
  // свои статические файлы с хэшем: из кэша навсегда
  if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/photos/'))) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(STATIC).then(c => c.put(req, copy)) } return r })))
    return
  }
  // большие фото товаров с сайта: показываем из кэша, обновляем в фоне
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMAGES).then(async c => {
      const hit = await c.match(req)
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); trim(IMAGES, 300) } return r }).catch(() => hit)
      return hit || net
    }))
    return
  }
  // остальное (manifest, иконки): кэш, затем сеть
  if (url.origin === location.origin) e.respondWith(caches.match(req).then(hit => hit || fetch(req)))
})
