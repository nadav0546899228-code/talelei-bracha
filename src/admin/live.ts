/** עדכונים בזמן אמת: חיבור אחד לשרת, וכל מסך מאזין לאוספים שמעניינים אותו */
import { useEffect, useRef } from "react";

const EVT = "tb-live";

/** פותח את החיבור (פעם אחת, במעטפת הניהול) */
export function useLiveConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let fallback: number | undefined;
    const fire = (c: string) => window.dispatchEvent(new CustomEvent(EVT, { detail: c }));
    const open = () => {
      es = new EventSource("/api/events");
      es.onmessage = (e) => {
        try {
          fire((JSON.parse(e.data) as { c: string }).c);
        } catch {
          /* הודעה לא תקינה - מתעלמים */
        }
      };
      es.onopen = () => {
        window.clearInterval(fallback);
        fallback = undefined;
      };
      es.onerror = () => {
        // הדפדפן מתחבר מחדש לבד; בינתיים רענון כללי כל 30 שניות
        if (fallback === undefined) fallback = window.setInterval(() => fire("*"), 30_000);
      };
    };
    open();
    const onVis = () => document.visibilityState === "visible" && fire("*");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      es?.close();
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);
}

/** מריץ את cb כשאחד האוספים השתנה (מאוחד ל-0.4 שניות, בלי הבהובים) */
export function useLive(collections: string[], cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = collections.join(",");
  useEffect(() => {
    const cols = new Set(key.split(","));
    let t: number | undefined;
    const on = (e: Event) => {
      const c = (e as CustomEvent<string>).detail;
      if (c !== "*" && !cols.has(c)) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => ref.current(), 400);
    };
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener(EVT, on);
      window.clearTimeout(t);
    };
  }, [key]);
}
