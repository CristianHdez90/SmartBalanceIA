/* Push only: no financial pages or API responses are cached. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || typeof payload.body !== 'string') return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients)client.postMessage({type:'balance-push-received',tag:typeof payload.tag==='string'?payload.tag:'balance-reminder'});}));
  event.waitUntil(self.registration.showNotification('SmartBalanceIA', {
    body: payload.body, icon: '/push-icon.png', badge: '/push-icon.png',
    tag: typeof payload.tag === 'string' ? payload.tag : 'balance-reminder',
    data: { url: '/?section=notifications' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/?section=notifications', self.location.origin).href;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target); await client.focus(); return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
