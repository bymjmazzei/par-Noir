/* par Noir push handlers. Served as /pn-notify-sw.js: registered directly or pulled in with importScripts. */
(function (sw) {
  // Copy is fixed here too, so a push can never put message text on a locked screen.
  var COPY = {
    messages: 'You have a new message',
    social: 'You have new notifications',
    security: 'Security alert. Unlock to review.'
  };

  function readCategory(event) {
    try {
      var data = event.data ? event.data.json() : null;
      var category = data && data.data && data.data.category;
      return Object.prototype.hasOwnProperty.call(COPY, category) ? category : null;
    } catch (e) {
      return null;
    }
  }

  function hasFocusedClient() {
    return sw.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        return list.some(function (c) {
          return c.focused && c.visibilityState === 'visible';
        });
      });
  }

  function handlePush(event) {
    var category = readCategory(event);
    var body = category ? COPY[category] : 'Something new is waiting. Unlock to see it.';
    var tag = 'pn-' + (category || 'general');
    event.waitUntil(
      hasFocusedClient().then(function (focused) {
        if (focused) return undefined;
        return sw.registration.showNotification('par Noir', {
          body: body,
          tag: tag,
          renotify: true,
          icon: '/icon-192.png',
          data: { category: category, url: '/' }
        });
      })
    );
  }

  function handleNotificationClick(event) {
    event.notification.close();
    var home = new URL('/', sw.location.origin).href;
    event.waitUntil(
      sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          // An open tab may hold an unsaved draft; focus it rather than navigating it away.
          if (new URL(c.url).origin === sw.location.origin && 'focus' in c) return c.focus();
        }
        return sw.clients.openWindow(home);
      })
    );
  }

  sw.addEventListener('push', handlePush);
  sw.addEventListener('notificationclick', handleNotificationClick);
})(self);
