/**
 * תמונות נשמרות כרשומה נפרדת (אוסף photos) ולא בתוך הרשומה שמצרפת אותן.
 * הרשומה עצמה מחזיקה רק כתובת קצרה (/api/photo/<id>), כך שרשימות, גיבויים ועדכונים חיים נשארים קלים,
 * והדפדפן טוען כל תמונה רק כשהיא מוצגת (ושומר אותה במטמון).
 */
import { randomUUID } from "node:crypto";

export const PHOTO_PREFIX = "/api/photo/";
const DATA_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i;

/** שומר תמונה (data URL) ומחזיר את הכתובת שלה. meta: domain, branchId, owner */
export async function savePhoto(store, dataUrl, meta = {}) {
  const m = DATA_RE.exec(String(dataUrl || ""));
  if (!m) return null;
  const id = randomUUID().replace(/-/g, "");
  await store.put("photos", id, { mime: m[1].toLowerCase(), b64: m[2], domain: meta.domain || null, branchId: meta.branchId || null, owner: meta.owner || null });
  return PHOTO_PREFIX + id;
}

/** ממיר רשימת תמונות: data URL נשמר בנפרד, כתובת קיימת נשארת */
export async function storePhotos(store, list, meta) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    const s = String(p || "");
    if (s.startsWith(PHOTO_PREFIX)) out.push(s);
    else {
      const url = await savePhoto(store, s, meta);
      if (url) out.push(url);
    }
  }
  return out;
}

export async function deletePhotos(store, list) {
  for (const p of Array.isArray(list) ? list : []) {
    const s = String(p || "");
    if (s.startsWith(PHOTO_PREFIX)) await store.del("photos", s.slice(PHOTO_PREFIX.length));
  }
}

/** העברה חד-פעמית של תמונות ישנות שנשמרו בתוך הרשומות */
export async function migrateInlinePhotos(store) {
  let moved = 0;
  for (const [col, ownerKey] of [["mitchUpdates", "mitchUpdate"], ["activityWall", "activityWall"]]) {
    for (const doc of await store.list(col, 100000)) {
      if (!Array.isArray(doc.photos) || !doc.photos.some((p) => String(p).startsWith("data:"))) continue;
      const photos = await storePhotos(store, doc.photos, { domain: doc.domain, branchId: doc.branchId, owner: `${ownerKey}:${doc.id}` });
      await store.put(col, doc.id, { ...doc, photos });
      moved += photos.length;
    }
  }
  return moved;
}

/** הגשת תמונה למשתמש מחובר שמורשה לסניף שלה */
export async function servePhoto(res, store, id, canSee) {
  const p = await store.get("photos", id);
  if (!p || !canSee(p)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("לא נמצא");
  }
  const buf = Buffer.from(p.b64, "base64");
  res.writeHead(200, {
    "Content-Type": p.mime || "image/jpeg",
    "Content-Length": buf.length,
    // הכתובת של כל תמונה ייחודית ולא משתנה - הדפדפן שומר אותה לתמיד
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(buf);
}
