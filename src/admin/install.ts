/** התקנה כאפליקציה: שומר את בקשת ההתקנה של הדפדפן ומציג כפתור "התקנה" */
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __tbInstall?: BIP | null;
  }
}

export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isSamsung = () => /SamsungBrowser/i.test(navigator.userAgent);

export function useInstall() {
  const [ready, setReady] = useState(Boolean(window.__tbInstall));
  const [installed, setInstalled] = useState(isStandalone());
  useEffect(() => {
    const onReady = () => setReady(Boolean(window.__tbInstall));
    const onDone = () => setInstalled(true);
    window.addEventListener("tb-install-ready", onReady);
    window.addEventListener("appinstalled", onDone);
    return () => {
      window.removeEventListener("tb-install-ready", onReady);
      window.removeEventListener("appinstalled", onDone);
    };
  }, []);
  const install = async (): Promise<"ok" | "manual"> => {
    const p = window.__tbInstall;
    if (!p) return "manual";
    try {
      await p.prompt();
      const r = await p.userChoice.catch(() => ({ outcome: "dismissed" }));
      window.__tbInstall = null;
      setReady(false);
      if (r.outcome === "accepted") {
        setInstalled(true);
        return "ok";
      }
      return "manual";
    } catch {
      window.__tbInstall = null;
      setReady(false);
      return "manual";
    }
  };
  const manualText = isIos()
    ? "באייפון: לוחצים על כפתור השיתוף (ריבוע עם חץ) ← \"הוספה למסך הבית\"."
    : isSamsung()
      ? "בדפדפן סמסונג: תפריט ☰ למטה ← \"הוסף דף אל\" ← \"מסך הבית\"."
      : "בכרום: לוחצים על ⋮ למעלה ← \"הוספה למסך הבית\" ← \"התקנה\".";
  return { ready, installed, install, manualText };
}
