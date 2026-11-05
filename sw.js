// Service worker de Fulbo: permite instalar la página como app y muestra las
// notificaciones (alguien se bajó, faltan jugadores, partido suspendido).
// Los mensajes llegan de api/avisar.js por Firebase Cloud Messaging, solo con datos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data?.json()?.data || {}; } catch {}
  if (!d.titulo) return;
  e.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.texto || '',
    icon: 'icono-192.png',
    badge: 'icono-192.png',
    tag: d.tag || 'fulbo',
    renotify: true,
    data: { link: d.link || './' },
  }));
});

// Al tocar la notificación: si la app ya está abierta la trae al frente; si no, la abre.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const abierta = ws.find(w => w.url.startsWith(self.registration.scope));
    return abierta ? abierta.focus() : self.clients.openWindow(link);
  }));
});

// Sin caché: siempre se usa la versión publicada (la app necesita internet igual).
self.addEventListener('fetch', () => {});
