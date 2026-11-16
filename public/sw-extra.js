// Acrescentado ao service worker: tocar na notificação abre o chamado.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = (evento.notification.data && evento.notification.data.url) || '/interno';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ('focus' in janela) {
          janela.navigate(url);
          return janela.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
