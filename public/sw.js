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
