/**
 * כניסה בטלפון + קוד (לרכזי הכולל), כמו בנוסעים בן טובים:
 * - הקוד נשמר כגיבוב חד-כיווני (scrypt) ולא מוצג בשום מסך.
 * - 5 ניסיונות כושלים ← נעילה ל-15 דקות (נפתחת לבד).
 * - 5 נעילות כאלה בתוך 30 יום ← נעילה קבועה עד שחרור ידני של מי שאחראי.
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
export const MAX_LOCKS = 5;
const LOCK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

export const validPhone = (p) => /^0(5\d{8}|[23489]\d{7}|7\d{8})$/.test(p);
export const validCode = (c) => /^\d{4,8}$/.test(String(c || ""));

export function hashCode(code) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(code), salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function checkCode(code, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(String(code), salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const generateCode = () => String(randomInt(100000, 1000000));

/** מצב נעילה נוכחי */
export function lockState(u, now = Date.now()) {
  if (u.permanentLock) return { locked: true, permanent: true };
  if (u.lockedUntil && now < new Date(u.lockedUntil).getTime()) {
    return { locked: true, permanent: false, minutes: Math.ceil((new Date(u.lockedUntil).getTime() - now) / 60000) };
  }
  return { locked: false };
}

/** עדכון אחרי ניסיון כושל - מחזיר את המסמך המעודכן */
export function registerFail(u, now = Date.now()) {
  const next = { ...u, failedAttempts: (u.failedAttempts || 0) + 1 };
  if (next.failedAttempts >= MAX_FAILS) {
    const events = (u.lockEvents || []).filter((t) => now - new Date(t).getTime() < LOCK_WINDOW_MS);
    events.push(new Date(now).toISOString());
    next.lockEvents = events;
    next.failedAttempts = 0;
    if (events.length >= MAX_LOCKS) next.permanentLock = true;
    else next.lockedUntil = new Date(now + LOCK_MINUTES * 60000).toISOString();
  }
  return next;
}

export function registerSuccess(u) {
  return { ...u, failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() };
}

export function unlock(u) {
  return { ...u, failedAttempts: 0, lockedUntil: null, permanentLock: false, lockEvents: [] };
}
