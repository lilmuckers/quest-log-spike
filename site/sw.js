// Spike service worker: show every push (iOS revokes the subscription if a push shows nothing),
// log its arrival delay for the page, and open the page on click.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const sent = data.sentAt ? Date.parse(data.sentAt) : NaN;
  const delay = Number.isNaN(sent) ? null : Math.round((Date.now() - sent) / 1000);
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Quest Log spike', {
        body: data.body || '',
        tag: data.tag,
        icon: 'icon-192.png',
        data: { url: data.url || './' },
      });
      const cache = await caches.open('spike-log');
      await cache.put(`log/${Date.now()}`, new Response(JSON.stringify({ at: new Date().toISOString(), title: data.title, delay })));
      for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage('pushed');
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope);
  url.searchParams.set('from', 'notification');
  event.waitUntil(
    (async () => {
      for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        if (client.url.startsWith(self.registration.scope) && 'navigate' in client) {
          await client.focus();
          return client.navigate(url.href);
        }
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
