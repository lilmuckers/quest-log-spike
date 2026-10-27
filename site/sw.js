// Spike service worker: log every push first (iOS may stop the worker once the notification is
// shown), then show it (iOS revokes the subscription if a push shows nothing), and open the
// page on click.
const VERSION = '3';
importScripts('log-store.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
  // On iOS the open page doesn't see this worker's IndexedDB writes until it restarts, so the
  // page asks the worker, which reads its own store.
  if (event.data === 'log')
    event.waitUntil(
      self.spikeLog.all().then(
        (log) => event.source?.postMessage({ log }),
        (e) => event.source?.postMessage({ log: [], error: e.message }),
      ),
    );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const sent = data.sentAt ? Date.parse(data.sentAt) : NaN;
  const delay = Number.isNaN(sent) ? null : Math.round((Date.now() - sent) / 1000);
  const entry = { at: new Date().toISOString(), title: data.title, delay, sw: VERSION };
  event.waitUntil(
    (async () => {
      const errors = [];
      await self.spikeLog.add(entry).catch((e) => errors.push(`idb: ${e.message}`));
      await caches
        .open('spike-log')
        .then((c) => c.put(`log/${Date.now()}`, new Response(JSON.stringify(entry))))
        .catch((e) => errors.push(`cache: ${e.message}`));
      if (errors.length) await self.spikeLog.add({ ...entry, title: `log error: ${errors.join('; ')}` }).catch(() => {});
      await self.registration.showNotification(data.title || 'Quest Log spike', {
        body: data.body || '',
        tag: data.tag,
        icon: 'icon-192.png',
        data: { url: data.url || './' },
      });
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
