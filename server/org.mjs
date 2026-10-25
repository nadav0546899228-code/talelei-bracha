/**
 * מבנה ארגוני: ערים וסניפים בשני תחומים (כולל ערב / בנות צילה), והיקף ההרשאה של כל רכז.
 */
import { randomUUID } from "node:crypto";
import { isPrivileged, normalizeRoles, ROLE_SCOPE } from "./roles.mjs";

export const DOMAINS = { kollel: "כולל ערב", bnot: "בנות צילה" };

export async function loadOrg(store) {
  const units = await store.list("orgUnits");
  const sort = (a, b) => String(a.name).localeCompare(String(b.name), "he");
  return {
    cities: units.filter((u) => u.type === "city").sort(sort),
    branches: units.filter((u) => u.type === "branch").sort(sort),
  };
}

const seesAll = (user) => isPrivileged(user.roles) || user.roles.includes("chief_coordinator");

/**
 * הסניפים שהמשתמש אחראי עליהם בתחום מסוים.
 * null = הכל (מנכ״ל / מתכנת / רכז ראשי). Set ריק = כלום.
 */
export function branchScope(user, org, domain) {
  if (seesAll(user)) return null;
  const set = new Set();
  const s = user.scope?.[domain] || {};
  if (user.roles.some((r) => ROLE_SCOPE[r]?.domain === domain && ROLE_SCOPE[r]?.level === "city") && s.cityId) {
    for (const b of org.branches) if (b.domain === domain && b.parentId === s.cityId) set.add(b.id);
  }
  if (user.roles.some((r) => ROLE_SCOPE[r]?.domain === domain && ROLE_SCOPE[r]?.level === "branch") && s.branchId) set.add(s.branchId);
  return set;
}

/** הערים שהמשתמש אחראי עליהן (לניהול סניפים) */
export function cityScope(user, domain) {
  if (seesAll(user)) return null;
  const s = user.scope?.[domain] || {};
  return new Set(user.roles.includes(`${domain}_city`) && s.cityId ? [s.cityId] : []);
}

/** בדיקה שמי שמעניק תפקיד רשאי לשייך אותו לעיר/לסניף שנבחרו */
export function canAssignScope(grantor, org, roles, scope) {
  if (seesAll(grantor)) return true;
  for (const r of roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const target = scope?.[rs.domain] || {};
    const cities = cityScope(grantor, rs.domain);
    if (rs.level === "city") return false; // רק רכז ראשי ומעלה ממנים רכזי עיר
    const branch = org.branches.find((b) => b.id === target.branchId);
    if (!branch || !cities.has(branch.parentId)) return false;
  }
  return true;
}

/** ניקוי היקף שהגיע מהממשק */
export function cleanScope(roles, scope, org) {
  const out = {};
  for (const r of roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const s = scope?.[rs.domain] || {};
    out[rs.domain] = out[rs.domain] || {};
    if (rs.level === "city" && org.cities.some((c) => c.id === s.cityId && c.domain === rs.domain)) out[rs.domain].cityId = s.cityId;
    if (rs.level === "branch" && org.branches.some((b) => b.id === s.branchId && b.domain === rs.domain)) out[rs.domain].branchId = s.branchId;
  }
  return out;
}

export async function handleOrg(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/org")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";
  const allowed = ["kollel", "org", "isha", "broadcast", "users"].some((v) => user.views.includes(v));
  if (!allowed) return send(403, { error: "אין הרשאה" }), true;
  const org = await loadOrg(store);

  if (pathname === "/api/org" && method === "GET") {
    // אנשים בתפקידי רכזות/ניהול סניפים - לתצוגת המבנה
    const people = [];
    const push = (id, d, kind) => {
      const roles = normalizeRoles(d.roles).filter((r) => ROLE_SCOPE[r] || r === "chief_coordinator");
      if (!roles.length || d.active === false) return;
      people.push({ id, kind, name: d.name || "", phone: d.phone || "", email: kind === "google" ? id : "", roles, scope: d.scope || {} });
    };
    for (const d of await store.list("users")) push(d.id, d, "google");
    for (const d of await store.list("phoneUsers")) push(`phone:${d.id}`, d, "phone");
    if (seesAll(user)) return send(200, { ...org, people, domains: DOMAINS }), true;
    // רכז עיר - רק העיר שלו, הסניפים שבה והאנשים שבה
    const cities = org.cities.filter((c) => cityScope(user, c.domain).has(c.id));
    const branches = org.branches.filter((b) => cityScope(user, b.domain).has(b.parentId));
    const cIds = new Set(cities.map((c) => c.id));
    const bIds = new Set(branches.map((b) => b.id));
    const mine = people.filter((p) => Object.values(p.scope || {}).some((s) => cIds.has(s?.cityId) || bIds.has(s?.branchId)));
    return send(200, { cities, branches, people: mine, domains: DOMAINS }), true;
  }

  if (pathname === "/api/org/units" && method === "POST") {
    const b = await readBody(req);
    const type = b.type === "city" ? "city" : "branch";
    const domain = DOMAINS[b.domain] ? b.domain : "kollel";
    const name = clean(b.name, 80).trim();
    if (!name) return send(400, { error: "חסר שם" }), true;
    let parentId = null;
    let region = null;
    if (type === "branch") {
      const city = org.cities.find((c) => c.id === b.parentId && c.domain === domain);
      if (!city) return send(400, { error: "יש לבחור עיר" }), true;
      parentId = city.id;
      region = ["north", "center", "south"].includes(String(b.region)) ? String(b.region) : null;
    }
    const cities = cityScope(user, domain);
    if (cities !== null && (type === "city" || !cities.has(parentId))) return send(403, { error: "אפשר להוסיף סניפים רק בעיר שלך" }), true;
    const id = b.id ? String(b.id) : randomUUID();
    const prev = await store.get("orgUnits", id);
    if (prev && cities !== null && !(prev.type === "branch" && cities.has(prev.parentId))) return send(403, { error: "אין הרשאה" }), true;
    await store.put("orgUnits", id, { type, domain, name, parentId, ...(type === "branch" ? { region } : {}) });
    await audit(user, prev ? "עדכון יחידה במבנה" : type === "city" ? "הוספת עיר" : "הוספת סניף", `${DOMAINS[domain]} · ${name}`);
    return send(200, { ok: true, id }), true;
  }

  const del = pathname.match(/^\/api\/org\/units\/([\w-]+)$/);
  if (del && method === "DELETE") {
    if (!seesAll(user)) return send(403, { error: "מחיקה - רכז ראשי, מנכ״ל או מתכנת בלבד" }), true;
    const unit = await store.get("orgUnits", del[1]);
    if (!unit) return send(404, { error: "לא נמצא" }), true;
    if (unit.type === "city" && org.branches.some((b) => b.parentId === unit.id)) return send(400, { error: "יש בעיר סניפים. יש למחוק או להעביר אותם קודם." }), true;
    if (unit.type === "branch" && (await store.list("avrechim")).some((a) => a.branchId === unit.id && a.active !== false)) {
      return send(400, { error: "יש בסניף אברכים פעילים. יש להעביר אותם לסניף אחר קודם." }), true;
    }
    await store.del("orgUnits", unit.id);
    await audit(user, unit.type === "city" ? "מחיקת עיר" : "מחיקת סניף", unit.name);
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}
