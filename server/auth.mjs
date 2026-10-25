/**
 * התחברות עם Google + עוגיית סשן חתומה (HMAC). ללא ספריות חיצוניות.
 * התפקידים נשלפים מחדש בכל בקשה - הסרת משתמש מנתקת אותו מיד.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "tb_session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 ימים, מתחדש בפעילות

export const sessionSecretIsSet = Boolean(process.env.SESSION_SECRET);
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => createHmac("sha256", SECRET).update(data).digest("base64url");

/** as = "כניסה כ..." - מזהה המשתמש שמנכ״ל/מתכנת צופים בתצוגה שלו */
export function createSessionCookie(email, secure, as = null) {
  const payload = b64(JSON.stringify({ email, iat: Math.floor(Date.now() / 1000), ...(as ? { as } : {}) }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** מחזיר { email, iat, as? } או null */
export function readSession(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.email || Date.now() / 1000 - data.iat > MAX_AGE) return null;
    return data;
  } catch {
    return null;
  }
}

/** האם לחדש את העוגייה (עברה יותר מיממה) */
export const shouldRenew = (s) => Date.now() / 1000 - s.iat > 24 * 60 * 60;

/** אימות טוקן Google Identity Services מול Google */
export async function verifyGoogleCredential(credential, clientId) {
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID לא הוגדר בשרת");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Error("טוקן Google לא תקין");
  const t = await res.json();
  if (t.aud !== clientId) throw new Error("הטוקן לא הונפק לאפליקציה הזו");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(t.iss)) throw new Error("מנפיק לא תקין");
  if (String(t.email_verified) !== "true") throw new Error("כתובת המייל לא מאומתת בגוגל");
  if (Number(t.exp) * 1000 < Date.now()) throw new Error("הטוקן פג תוקף");
  return { email: String(t.email).toLowerCase(), name: t.name || "", picture: t.picture || "", sub: t.sub };
}
