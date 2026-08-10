// Web Push service worker — plain static JS, not part of the Next.js build.
// Must be served from the site root so its scope covers the whole app.

self.addEventListener("push", (event) => {
  let payload = { title: "Ганбат багш", body: "", url: "/profile" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above rather than dropping the push.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/profile";
  event.waitUntil(self.clients.openWindow(url));
});
