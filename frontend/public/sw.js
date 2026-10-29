/* SINDARIS: service worker — push-уведомления (почта сайта) и переход по клику. */
self.addEventListener("push", (event) => {
  let data = { title: "SINDARIS", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/api/v1/assets/brand/clan-logo.png",
      badge: "/api/v1/assets/brand/clan-logo.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if ("focus" in tab) {
          tab.navigate(url);
          return tab.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
