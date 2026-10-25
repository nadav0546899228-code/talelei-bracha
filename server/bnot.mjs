/**
 * בנות צילה - משתתפות ופעילויות לפי סניף.
 * מנהלת סניף - הסניף שלה. רכזת עיר - כל סניפי העיר. רכז ראשי / מנכ״ל / מתכנת - הכל.
 */
import { randomUUID } from "node:crypto";
import { branchScope, loadOrg } from "./org.mjs";
import { normalizePhone } from "./phoneAuth.mjs";

export async function handleBnot(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/bnot/")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";
  if (!user.views.includes("bnot")) return send(403, { error: "אין הרשאה" }), true;

  const org = await loadOrg(store);
  const scope = branchScope(user, org, "bnot");
  const branches = org.branches.filter((b) => b.domain === "bnot" && (scope === null || scope.has(b.id)));
  const ids = new Set(branches.map((b) => b.id));
  const cities = org.cities.filter((c) => c.domain === "bnot" && (scope === null || branches.some((b) => b.parentId === c.id)));
  const inScope = (x) => ids.has(x.branchId);

  if (pathname === "/api/bnot/overview" && method === "GET") {
    const members = (await store.list("bnotMembers", 20000)).filter(inScope).sort((a, b) => String(a.name).localeCompare(String(b.name), "he"));
    const activities = (await store.list("bnotActivities", 2000)).filter(inScope).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return send(200, { cities, branches, members, activities }), true;
  }

  if (pathname === "/api/bnot/members" && method === "POST") {
    const b = await readBody(req);
    const name = clean(b.name, 80).trim();
    if (!name) return send(400, { error: "חסר שם" }), true;
    const branchId = String(b.branchId || "");
    if (!ids.has(branchId)) return send(400, { error: "יש לבחור סניף" }), true;
    const id = b.id ? String(b.id) : randomUUID();
    const prev = await store.get("bnotMembers", id);
    if (prev && !inScope(prev)) return send(403, { error: "אין הרשאה" }), true;
    await store.put("bnotMembers", id, { name, phone: normalizePhone(b.phone), branchId, active: b.active !== false, notes: clean(b.notes, 500) });
    await audit(user, prev ? "עדכון משתתפת" : "הוספת משתתפת", name);
    return send(200, { ok: true, id }), true;
  }

  if (pathname === "/api/bnot/activities" && method === "POST") {
    const b = await readBody(req, 64 * 1024);
    const branchId = String(b.branchId || "");
    if (!ids.has(branchId)) return send(400, { error: "יש לבחור סניף" }), true;
    const date = String(b.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(400, { error: "תאריך לא תקין" }), true;
    const id = b.id ? String(b.id) : randomUUID();
    const prev = await store.get("bnotActivities", id);
    if (prev && !inScope(prev)) return send(403, { error: "אין הרשאה" }), true;
    const members = new Set((await store.list("bnotMembers", 20000)).filter((m) => m.branchId === branchId).map((m) => m.id));
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time || "")) ? String(b.time) : "";
    await store.put("bnotActivities", id, {
      branchId,
      date,
      time,
      place: clean(b.place, 120),
      address: clean(b.address, 180),
      title: clean(b.title, 120).trim() || "פעילות",
      present: (Array.isArray(b.present) ? b.present : []).map(String).filter((x) => members.has(x)),
      by: user.id,
      byName: user.name || user.email || user.phone,
    });
    if (!prev) await audit(user, "הוספת פעילות - בנות צילה", `${date} · ${clean(b.title, 60)}`);
    return send(200, { ok: true, id }), true;
  }

  const m = pathname.match(/^\/api\/bnot\/(members|activities)\/([\w-]+)$/);
  if (m && method === "DELETE") {
    const col = m[1] === "members" ? "bnotMembers" : "bnotActivities";
    const doc = await store.get(col, m[2]);
    if (!doc || !inScope(doc)) return send(404, { error: "לא נמצא" }), true;
    if (col === "bnotMembers") await store.put(col, doc.id, { ...doc, active: false });
    else await store.del(col, doc.id);
    await audit(user, col === "bnotMembers" ? "העברת משתתפת ללא פעילה" : "מחיקת פעילות", doc.name || doc.title || "");
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}
