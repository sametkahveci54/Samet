self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Jarvis · Bitcoin', {
    body:data.body || 'Ein neuer Bericht liegt bereit.', tag:data.tag || 'bitcoin',
    icon:'/bitcoin-icon.svg', data:{url:'/bitcoin'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL('/bitcoin', self.location.origin).href));
});
