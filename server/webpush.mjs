/**
 * התראות לטלפון (Web Push) בלי ספריות: הצפנה לפי RFC 8291 (aes128gcm) וחתימת VAPID (ES256).
 * מפתחות VAPID נוצרים פעם אחת ונשמרים במסד.
 */
import { createECDH, createHash, createHmac, createCipheriv, createPrivateKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s), "base64url");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** מחזיר { publicKey (base64url, 65 בתים), privateJwk } - יוצר ושומר אם אין */
export async function vapidKeys(store) {
  const saved = await store.get("settings", "vapid");
  if (saved?.publicKey && saved?.privateJwk) return saved;
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  const doc = { publicKey: b64u(pub), privateJwk: privateKey.export({ format: "jwk" }) };
  await store.put("settings", "vapid", doc);
  return doc;
}

function vapidHeader(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = createPrivateKey({ key: keys.privateJwk, format: "jwk" });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** הצפנת תוכן לפי RFC 8291 */
export function encrypt(payload, p256dh, auth) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const salt = randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** שליחה למנוי אחד. מחזיר "gone" כשהמנוי כבר לא בתוקף */
export async function sendPush(sub, data, keys, subject = "mailto:nadav0546899228@gmail.com") {
  const body = encrypt(JSON.stringify(data), sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
      Authorization: vapidHeader(sub.endpoint, keys, subject),
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return "gone";
  return res.ok ? "ok" : `error ${res.status}`;
}

export const subId = (endpoint) => createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);

/**
 * שליחת התראה לכל המנויים שהמשתמש שלהם עומד בתנאי.
 * resolveUser - פונקציה שמחזירה את המשתמש העדכני (הרשאות נבדקות מחדש בכל שליחה).
 */
export async function notify(store, resolveUser, filter, data) {
  try {
    const subs = await store.list("pushSubs", 5000);
    if (!subs.length) return;
    const keys = await vapidKeys(store);
    const cache = new Map();
    for (const s of subs) {
      if (!cache.has(s.userId)) cache.set(s.userId, await resolveUser(s.userId).catch(() => null));
      const u = cache.get(s.userId);
      if (!u || !filter(u)) continue;
      const r = await sendPush(s.sub, data, keys).catch(() => "error");
      if (r === "gone") await store.del("pushSubs", s.id);
    }
  } catch (e) {
    console.error("push", e?.message);
  }
}
