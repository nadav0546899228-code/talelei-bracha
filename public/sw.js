// Service Worker מינימלי - מאפשר התקנה כאפליקציה בפלאפון.
// לא שומר עותקים של האתר: כל בקשה הולכת לשרת, כך שתמיד רואים את הגרסה העדכנית.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;text-align:center;padding:40px">אין חיבור לאינטרנט כרגע.<br>נסו שוב בעוד רגע.</body></html>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});

// התראות לטלפון
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "קרן טללי ברכה", {
      body: d.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      dir: "rtl",
      lang: "he",
      data: { url: d.url || "/admin" },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
