/* AtelierPro — réception des notifications push (chargé par le service worker principal). */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'AtelierPro', {
    body: d.body || 'Vous avez une nouvelle notification',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        try { await w.navigate(url); } catch (e) { /* page d'une autre origine */ }
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
