/** הרשמה להתראות לטלפון */
import { api, post } from "./api";

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function pushState(): Promise<"on" | "off" | "blocked" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("ההתראות לא אושרו בדפדפן");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("/api/push/key");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  await post("/api/push/subscribe", { subscription: sub.toJSON() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
}
