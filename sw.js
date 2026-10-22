// Mithai Mitra service worker — only for Garam Jalebi push notifications.
// (No offline caching, so the shop always shows live stock and prices.)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Mithai Mitra', body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || '🔥 Garam batch aa raha hai!', {
    body: data.body || 'Kadhai se seedhi garam mithai — jaldi aao!',
    icon: data.icon || 'assets/icon-192.png',
    badge: data.icon || 'assets/icon-192.png',
    tag: `hot-${data.hot_batch_id || 'batch'}`,
    data: { url: data.url || './#/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './#/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
