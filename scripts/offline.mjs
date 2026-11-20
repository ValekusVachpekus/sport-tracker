import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const directory = 'dist'
const files = ['index.html', ...(await readdir(join(directory, 'assets'))).map(name => 'assets/' + name)]
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(join(directory, file)))
const version = hash.digest('hex').slice(0, 16)
await writeFile(join(directory, 'sw.js'), `
const prefix = 'sport-tracker:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const assets = ${JSON.stringify(files)}.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === self.location.origin &&
    (url.pathname === new URL(self.registration.scope).pathname || url.pathname === new URL(assets[0]).pathname)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(assets[0])).then(cached => cached || fetch(request)));
  } else if (assets.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(request)).then(cached => cached || fetch(request)));
  }
});
`)
