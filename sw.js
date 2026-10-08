/* =========================================================
   BolisIO · service worker
   IMPORTANTE: al cambiar cualquier archivo de la app, sube VERSION
   (por ejemplo 'bolisio-v1.0.1'). Así los usuarios reciben la nueva versión.
   ========================================================= */
const VERSION = 'bolisio-v1.0.1';

// Archivos necesarios para abrir la app sin conexión. Rutas relativas (GitHub Pages).
const ESTATICOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  // Eliminar cachés de versiones anteriores
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Estrategia: caché primero; si no está, red y se guarda la copia.
// Sin conexión, se sirve la página principal.
self.addEventListener('fetch', evento => {
  if(evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request).then(enCache => {
      if(enCache) return enCache;
      return fetch(evento.request).then(respuesta => {
        if(respuesta && respuesta.ok){
          const copia = respuesta.clone();
          caches.open(VERSION).then(cache => cache.put(evento.request, copia));
        }
        return respuesta;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
