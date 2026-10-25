/** הודעת "יש גרסה חדשה" - בודקת מול השרת ולא מרעננת לבד. רענון רק בלחיצה. */
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const loaded = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src") || "";

export function UpdateBanner() {
  const [next, setNext] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);

  useEffect(() => {
    const mine = loaded();
    if (!mine) return; // מצב פיתוח מקומי - אין גרסה בנויה
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/public/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (v && v !== mine) setNext(v);
      } catch {
        /* אין חיבור - ננסה שוב */
      }
    };
    const id = window.setInterval(check, 60_000);
    const onVis = () => check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    check();
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  if (!next || hidden === next) return null;
  return (
    <div className="update-banner" role="status">
      <span>יש גרסה חדשה</span>
      <button type="button" className="update-banner__go" onClick={() => window.location.reload()}>
        <Icon name="refresh" /> עדכון
      </button>
      <button type="button" className="update-banner__x" aria-label="סגירה" onClick={() => setHidden(next)}>
        <Icon name="close" />
      </button>
    </div>
  );
}
