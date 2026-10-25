// Service Worker - התקנה כאפליקציה, עבודה בסיסית בלי קליטה (קבצי האתר נשמרים במכשיר) והתראות לטלפון.
// הנתונים עצמם (API) תמיד מהשרת, והדפים תמיד מהשרת כשיש חיבור - כך רואים תמיד את הגרסה העדכנית.
const CACHE = "tb-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// עבודה גם בלי קליטה: קבצי האתר נשמרים במכשיר; הנתונים (API) תמיד מהשרת
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/__shell", copy));
          return res;
        })
        .catch(async () => (await caches.match("/__shell")) || offlinePage()),
    );
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;text-align:center;padding:40px">אין חיבור לאינטרנט כרגע.<br>נסו שוב בעוד רגע.</body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

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
