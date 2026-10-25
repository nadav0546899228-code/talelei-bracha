import { readFileSync as readFileSyncTB } from "node:fs";
/**
 * שרת האתר: מגיש את האתר הבנוי (dist), מקבל טפסים ומפעיל את מערכת הניהול.
 * ללא תלויות חיצוניות מלבד pg (רק כשיש DATABASE_URL).
 *
 * משתני סביבה (Secrets ב-Replit):
 *   GOOGLE_CLIENT_ID   - מזהה OAuth של Google לכניסת צוות (חובה לכניסה)
 *   SESSION_SECRET     - מחרוזת אקראית ארוכה לחתימת עוגיות (חובה באתר מפורסם)
 *   DATABASE_URL       - PostgreSQL של Replit (נוצר אוטומטית כשמוסיפים מסד)
 *   DEVELOPER_EMAILS / CEO_EMAILS - אופציונלי, לדריסת משתמשי היסוד
 *   PORT               - ברירת מחדל 5000
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearSessionCookie,
  createSessionCookie,
  readSession,
  sessionSecretIsSet,
  shouldRenew,
  verifyGoogleCredential,
} from "./auth.mjs";
import { BOOTSTRAP, FORM_VIEW, ROLES, ROLE_SCOPE, VIEW_LABELS, bootstrapRoles, grantableRoles, isPrivileged, normalizeRoles, viewsFor } from "./roles.mjs";
import { canAssignScope, cityScope, cleanScope, handleOrg, loadOrg } from "./org.mjs";
import { createStore } from "./store.mjs";
import * as phone from "./phoneAuth.mjs";
import { handleKollel } from "./kollel.mjs";
import { handleBroadcast } from "./broadcast.mjs";
import { yemotConfigured } from "./yemot.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || (() => { try { return readFileSyncTB("google-client-id.txt", "utf8"); } catch { return ""; } })()).trim();
const DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "1" && !IS_PROD; // לבדיקות מקומיות בלבד
const STARTED = Date.now();

const store = await createStore();

/* ------------------------------------------------------------------ עזרים */

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY, ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("גודל הבקשה חורג מהמותר"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("JSON לא תקין"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

const isSecure = (req) => req.headers["x-forwarded-proto"] === "https" || IS_PROD;
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

/** הגנת CSRF בסיסית: בקשות משנות-מצב חייבות להגיע מאותו מקור */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** הגבלת קצב פשוטה בזיכרון */
const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) ?? { n: 0, reset: now + windowMs };
  if (now > b.reset) {
    b.n = 0;
    b.reset = now + windowMs;
  }
  b.n++;
  buckets.set(key, b);
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();

const clean = (v, max = 2000) => String(v ?? "").slice(0, max);

/* ------------------------------------------------------------------ משתמשים */

async function resolveUser(sessionId) {
  // תצוגה לפי תפקיד (ל"כניסה כ..." בלבד): "role:<תפקיד>" או "role:<תפקיד>:<עיר/סניף>"
  if (String(sessionId).startsWith("role:")) {
    const [, role, unitId] = String(sessionId).split(":");
    if (!ROLES[role] || role === "developer") return null;
    const rs = ROLE_SCOPE[role];
    const scope = {};
    let unitName = "";
    if (rs) {
      const unit = unitId ? await store.get("orgUnits", unitId) : null;
      if (!unit || unit.domain !== rs.domain || unit.type !== rs.level) return null;
      scope[rs.domain] = rs.level === "city" ? { cityId: unit.id } : { branchId: unit.id };
      unitName = unit.name;
    }
    const roles = [role];
    const name = `${ROLES[role].label}${unitName ? ` · ${unitName}` : ""} (תצוגה לדוגמה)`;
    return { id: sessionId, kind: "virtual", email: "", phone: "", name, picture: "", roles, scope, views: viewsFor(roles), bootstrap: false };
  }
  // משתמש טלפון (רכזים ומנהלי סניפים): "phone:<id>"
  if (String(sessionId).startsWith("phone:")) {
    const pid = String(sessionId).slice(6);
    const doc = await store.get("phoneUsers", pid);
    if (!doc || doc.active === false || phone.lockState(doc).permanent) return null;
    const roles = normalizeRoles(doc.roles);
    if (!roles.length) return null;
    return { id: sessionId, kind: "phone", subId: pid, email: "", phone: doc.phone, name: doc.name || "", picture: "", roles, scope: doc.scope || {}, views: viewsFor(roles), bootstrap: false };
  }
  const e = String(sessionId).toLowerCase();
  const boot = bootstrapRoles(e);
  const doc = await store.get("users", e);
  if (doc && doc.active === false && !boot.length) return null;
  const roles = normalizeRoles([...boot, ...((doc?.active !== false && doc?.roles) || [])]);
  if (!roles.length) return null;
  return {
    id: e,
    kind: "google",
    email: e,
    name: doc?.name || "",
    picture: doc?.picture || "",
    phone: doc?.phone || "",
    roles,
    scope: doc?.scope || {},
    views: viewsFor(roles),
    bootstrap: boot.length > 0,
  };
}

/** כניסה כ... - רק מנכ״ל או מתכנת אמיתיים (לא בזמן כניסה כ...) */
const canImpersonate = (real) => isPrivileged(real.roles) && real.kind === "google";
/** מנכ״ל לא נכנס לתצוגה של מתכנת */
const impersonationAllowed = (real, target) => target.id !== real.id && (real.roles.includes("developer") || !target.roles.includes("developer"));

/** האם המשתמש אחראי על רכז/מנהל סניף מסוים (לפי עיר) */
function manages(user, org, doc) {
  const roles = normalizeRoles(doc.roles);
  for (const r of roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const cities = cityScope(user, rs.domain);
    if (cities === null) continue;
    if (rs.level === "city") return false;
    const branch = org.branches.find((b) => b.id === doc.scope?.[rs.domain]?.branchId);
    if (!branch || !cities.has(branch.parentId)) return false;
  }
  return true;
}

async function audit(user, action, target = "", details = {}) {
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const ident = (u) => u?.email || (u?.phone ? `${u.name || ""} ${u.phone}`.trim() : u?.name || "מערכת");
  // בכניסה כ... נרשמים שני הצדדים: מי ביצע בפועל, ובתצוגה של מי
  const who = user?.impersonatedBy ? `${ident(user.impersonatedBy)} ← בתור ${ident(user)}` : ident(user);
  await store.put("audit", id, { at: new Date().toISOString(), email: who, action, target, details });
}

/* ------------------------------------------------------------------ תוכן */

async function getContent() {
  return (await store.get("content", "site"))?.content ?? null;
}

/* ------------------------------------------------------------------ ניתוב API */

async function api(req, res, url) {
  const { pathname } = url;
  const method = req.method || "GET";

  if (method !== "GET" && !sameOrigin(req)) return json(res, 403, { error: "מקור הבקשה לא מורשה" });

  // ---- ציבורי
  if (pathname === "/api/public/bootstrap" && method === "GET") {
    return json(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID || null,
      env: IS_PROD ? "production" : "development",
      devLogin: DEV_LOGIN,
      content: await getContent(),
    });
  }

  // גרסת האתר הבנוי - לפי שם קובץ הסקריפט הראשי (משתנה בכל בנייה). משמש להודעת "יש גרסה חדשה"
  if (pathname === "/api/public/version" && method === "GET") {
    let v = "";
    try {
      const html = await readFile(join(ROOT, "index.html"), "utf8");
      v = (html.match(/src="(\/assets\/[^"]+\.js)"/) || [])[1] || "";
    } catch {
      v = "";
    }
    return json(res, 200, { v });
  }

  const formMatch = pathname.match(/^\/api\/forms\/([a-zA-Z]+)$/);
  if (formMatch && method === "POST") {
    const formId = formMatch[1];
    if (!FORM_VIEW[formId]) return json(res, 404, { error: "טופס לא קיים" });
    if (rateLimited(`form:${clientIp(req)}`, 8, 10 * 60_000)) return json(res, 429, { error: "נשלחו יותר מדי פניות. נסו שוב מאוחר יותר." });
    const body = await readBody(req, 32 * 1024);
    const data = body?.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length > 25) {
      return json(res, 400, { error: "נתונים לא תקינים" });
    }
    const cleanData = {};
    for (const [k, v] of Object.entries(data)) {
      const key = clean(k, 40);
      if (key === "website") continue; // שדה מלכודת
      if (typeof v === "boolean") cleanData[key] = v;
      else if (Array.isArray(v)) cleanData[key] = v.slice(0, 20).map((x) => clean(x, 200));
      else cleanData[key] = clean(v);
    }
    const id = randomUUID();
    await store.put("submissions", id, {
      form: formId,
      data: cleanData,
      status: "new",
      notes: [],
      assignedMentorId: null,
    });
    return json(res, 201, { ok: true });
  }

  // ---- התחברות
  if (pathname === "/api/auth/google" && method === "POST") {
    if (rateLimited(`login:${clientIp(req)}`, 20, 10 * 60_000)) return json(res, 429, { error: "יותר מדי ניסיונות" });
    const { credential } = await readBody(req);
    let g;
    try {
      g = await verifyGoogleCredential(String(credential || ""), GOOGLE_CLIENT_ID);
    } catch (e) {
      return json(res, 401, { error: e.message });
    }
    const user = await resolveUser(g.email);
    if (!user) {
      await audit({ email: g.email }, "ניסיון כניסה נדחה", g.email);
      return json(res, 403, { error: `לחשבון ${g.email} אין הרשאת גישה למערכת. יש לפנות למנכ״ל.` });
    }
    const prev = (await store.get("users", user.email)) || {};
    await store.put("users", user.email, {
      ...prev,
      name: prev.name || g.name,
      picture: g.picture,
      roles: prev.roles || [],
      active: prev.active !== false,
      googleSub: g.sub,
      lastLoginAt: new Date().toISOString(),
    });
    await audit(user, "כניסה למערכת");
    return json(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(user.email, isSecure(req)) });
  }

  if (pathname === "/api/auth/phone" && method === "POST") {
    if (rateLimited(`plogin:${clientIp(req)}`, 30, 10 * 60_000)) return json(res, 429, { error: "יותר מדי ניסיונות. נסו שוב מאוחר יותר." });
    const b = await readBody(req);
    const ph = phone.normalizePhone(b.phone);
    const code = String(b.code || "");
    const users = await store.list("phoneUsers");
    const doc = users.find((u) => u.phone === ph);
    const generic = { error: "מספר טלפון או קוד שגויים" };
    if (!doc || doc.active === false) return json(res, 401, generic);
    const lock = phone.lockState(doc);
    if (lock.locked) {
      return json(res, 423, {
        error: lock.permanent ? "החשבון נעול. יש לפנות לרכז העל או למנכ״ל לשחרור." : `החשבון נעול זמנית. נסו שוב בעוד ${lock.minutes} דקות.`,
      });
    }
    if (!phone.checkCode(code, doc.codeHash)) {
      const next = phone.registerFail(doc);
      await store.put("phoneUsers", doc.id, next);
      if (next.permanentLock) await audit({ name: doc.name, phone: doc.phone }, "נעילה קבועה אחרי ניסיונות כושלים", doc.phone);
      else if (next.lockedUntil && !doc.lockedUntil) await audit({ name: doc.name, phone: doc.phone }, "נעילה זמנית אחרי 5 ניסיונות", doc.phone);
      return json(res, 401, generic);
    }
    await store.put("phoneUsers", doc.id, phone.registerSuccess(doc));
    const u = await resolveUser(`phone:${doc.id}`);
    if (!u) return json(res, 403, { error: "אין הרשאה" });
    await audit(u, "כניסה בטלפון וקוד");
    return json(res, 200, { ok: true, mustChangeCode: Boolean(doc.mustChangeCode) }, { "Set-Cookie": createSessionCookie(`phone:${doc.id}`, isSecure(req)) });
  }

  if (pathname === "/api/auth/dev-login" && method === "POST") {
    if (!DEV_LOGIN) return json(res, 404, { error: "לא זמין" });
    const { email } = await readBody(req);
    const user = await resolveUser(String(email || ""));
    if (!user) return json(res, 403, { error: "אין הרשאה" });
    return json(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(user.id, false) });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(isSecure(req)) });
  }

  // ---- מכאן והלאה: נדרש משתמש מחובר
  const session = readSession(req);
  const real = session ? await resolveUser(session.email) : null;
  if (!real) return json(res, 401, { error: "נדרשת התחברות" }, session ? { "Set-Cookie": clearSessionCookie(isSecure(req)) } : {});
  let user = real;
  let asId = null;
  if (session.as && canImpersonate(real)) {
    const target = await resolveUser(session.as);
    if (target && impersonationAllowed(real, target)) {
      user = { ...target, impersonatedBy: { id: real.id, name: real.name, email: real.email, phone: real.phone || "" } };
      asId = session.as;
    }
  }
  const renew = shouldRenew(session) ? { "Set-Cookie": createSessionCookie(real.id, isSecure(req), asId) } : {};
  const can = (view) => user.views.includes(view);
  const send = (status, body) => json(res, status, body, renew);

  if (pathname === "/api/auth/me" && method === "GET") {
    return send(200, {
      user,
      roleLabels: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])),
      viewLabels: VIEW_LABELS,
      assignableRoles: grantableRoles(user.roles),
      mustChangeCode: user.kind === "phone" && !user.impersonatedBy ? Boolean((await store.get("phoneUsers", user.subId))?.mustChangeCode) : false,
      canImpersonate: canImpersonate(real),
    });
  }

  // ---- כניסה כ... (מנכ״ל ומתכנת בלבד - לפי המשתמש האמיתי)
  if (pathname === "/api/admin/impersonation-targets" && method === "GET") {
    if (!canImpersonate(real)) return send(403, { error: "אין הרשאה" });
    const people = [];
    const docs = await store.list("users");
    const emails = new Set([...docs.map((d) => d.id), ...BOOTSTRAP.developer, ...BOOTSTRAP.ceo]);
    for (const e of emails) {
      const t = await resolveUser(e);
      if (t && t.id !== real.id && impersonationAllowed(real, t)) people.push({ id: t.id, name: t.name, email: t.email, phone: "", kind: "google", roles: t.roles, scope: t.scope });
    }
    for (const d of await store.list("phoneUsers")) {
      const t = await resolveUser(`phone:${d.id}`);
      if (t && impersonationAllowed(real, t)) people.push({ id: t.id, name: t.name, email: "", phone: t.phone, kind: "phone", roles: t.roles, scope: t.scope });
    }
    const roles = Object.entries(ROLES)
      .filter(([k]) => k !== "developer")
      .map(([k, v]) => ({ id: k, label: v.label, scope: ROLE_SCOPE[k] || null }));
    return send(200, { people, roles, ...(await loadOrg(store)) });
  }
  if (pathname === "/api/auth/impersonate" && method === "POST") {
    if (!canImpersonate(real)) return send(403, { error: "אין הרשאה" });
    const { id } = await readBody(req);
    const target = await resolveUser(String(id || ""));
    if (!target || target.id === real.id || !impersonationAllowed(real, target)) return send(400, { error: "אי אפשר להיכנס לתצוגה הזו" });
    // מעבר לתצוגת תפקיד - לא נרשם. כניסה בשם אדם מסוים - נרשמת
    if (target.kind !== "virtual") await audit(real, "כניסה כ...", target.name || target.email || target.phone || target.id);
    return json(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(real.id, isSecure(req), target.id) });
  }
  if (pathname === "/api/auth/stop-impersonate" && method === "POST") {
    if (user.impersonatedBy && user.kind !== "virtual") await audit(real, "חזרה לחשבון שלי", user.name || user.email || user.phone || "");
    return json(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(real.id, isSecure(req)) });
  }

  // ---- החלפת קוד אישי (משתמשי טלפון)
  if (pathname === "/api/auth/change-code" && method === "POST") {
    if (user.kind !== "phone") return send(400, { error: "רלוונטי רק לכניסה בטלפון" });
    const b = await readBody(req);
    const doc = await store.get("phoneUsers", user.subId);
    if (!phone.checkCode(String(b.current || ""), doc.codeHash)) return send(400, { error: "הקוד הנוכחי שגוי" });
    if (!phone.validCode(b.next)) return send(400, { error: "הקוד החדש חייב להיות 4 עד 8 ספרות" });
    await store.put("phoneUsers", doc.id, { ...doc, codeHash: phone.hashCode(String(b.next)), mustChangeCode: false });
    await audit(user, "החלפת קוד אישי");
    return send(200, { ok: true });
  }

  // ---- משתמשי טלפון (רכזי כולל) - מנכ״ל/מתכנת לכל התפקידים, רכז על לרכזי משנה
  if (pathname === "/api/admin/phone-users") {
    const grant = grantableRoles(user.roles);
    if (!grant.length) return send(403, { error: "אין הרשאה" });
    const org = await loadOrg(store);
    if (method === "GET") {
      const rows = (await store.list("phoneUsers"))
        .map((u) => ({ ...u, roles: normalizeRoles(u.roles) }))
        .filter((u) => u.roles.every((r) => grant.includes(r)) && manages(user, org, u))
        .map(({ codeHash: _h, ...u }) => ({ ...u, lock: phone.lockState(u) }));
      return send(200, { users: rows });
    }
    if (method === "POST") {
      const b = await readBody(req);
      const ph = phone.normalizePhone(b.phone);
      if (!phone.validPhone(ph)) return send(400, { error: "מספר טלפון לא תקין" });
      const roles = (Array.isArray(b.roles) ? b.roles : []).filter((r) => grant.includes(r));
      if (!roles.length) return send(400, { error: "יש לבחור תפקיד" });
      const scope = cleanScope(roles, b.scope, org);
      const missing = roles.find((r) => ROLE_SCOPE[r] && !scope[ROLE_SCOPE[r].domain]?.[ROLE_SCOPE[r].level === "city" ? "cityId" : "branchId"]);
      if (missing) return send(400, { error: `יש לבחור ${ROLE_SCOPE[missing].level === "city" ? "עיר" : "סניף"} עבור ${ROLES[missing].label}` });
      if (!canAssignScope(user, org, roles, scope)) return send(403, { error: "אפשר לשייך רק לסניפים שבאחריותך" });
      const all = await store.list("phoneUsers");
      const dup = all.find((u) => u.phone === ph && u.id !== b.id);
      if (dup) return send(400, { error: "המספר כבר רשום" });
      const prev = b.id ? all.find((u) => u.id === b.id) : null;
      if (prev && !(normalizeRoles(prev.roles).every((r) => grant.includes(r)) && manages(user, org, prev))) return send(403, { error: "אין הרשאה" });
      const id = prev?.id || randomUUID();
      let code = null;
      const doc = { ...(prev || {}), name: clean(b.name, 80).trim(), phone: ph, roles, scope, active: b.active !== false };
      if (!prev) {
        code = phone.generateCode();
        doc.codeHash = phone.hashCode(code);
        doc.mustChangeCode = true;
        doc.createdBy = user.id;
      }
      await store.put("phoneUsers", id, doc);
      await audit(user, prev ? "עדכון משתמש טלפון" : "הוספת משתמש טלפון", `${doc.name} ${ph}`, { roles, scope });
      return send(200, { ok: true, id, code });
    }
  }
  const puMatch = pathname.match(/^\/api\/admin\/phone-users\/([\w-]+)\/(reset-code|unlock)$/);
  const puDel = pathname.match(/^\/api\/admin\/phone-users\/([\w-]+)$/);
  if ((puMatch && method === "POST") || (puDel && method === "DELETE")) {
    const grant = grantableRoles(user.roles);
    const doc = await store.get("phoneUsers", (puMatch || puDel)[1]);
    const org = await loadOrg(store);
    if (!doc || !grant.length || !normalizeRoles(doc.roles).every((r) => grant.includes(r)) || !manages(user, org, doc)) return send(404, { error: "לא נמצא" });
    if (puDel) {
      await store.del("phoneUsers", doc.id);
      await audit(user, "מחיקת משתמש טלפון", `${doc.name} ${doc.phone}`);
      return send(200, { ok: true });
    }
    if (puMatch[2] === "unlock") {
      await store.put("phoneUsers", doc.id, phone.unlock(doc));
      await audit(user, "שחרור נעילה", `${doc.name} ${doc.phone}`);
      return send(200, { ok: true });
    }
    const code = phone.generateCode();
    await store.put("phoneUsers", doc.id, { ...phone.unlock(doc), codeHash: phone.hashCode(code), mustChangeCode: true });
    await audit(user, "איפוס קוד", `${doc.name} ${doc.phone}`);
    return send(200, { ok: true, code });
  }

  // ---- מודולים
  const ctx = { user, send, store, readBody, audit, clean };
  if (await handleOrg(req, res, url, ctx)) return;
  if (await handleKollel(req, res, url, ctx)) return;
  if (await handleBroadcast(req, res, url, ctx)) return;

  // ---- פניות
  if (pathname === "/api/admin/submissions" && method === "GET") {
    const allowed = Object.entries(FORM_VIEW).filter(([, v]) => can(v)).map(([f]) => f);
    const rows = (await store.list("submissions")).filter((s) => allowed.includes(s.form));
    return send(200, { submissions: rows, forms: allowed });
  }

  const subMatch = pathname.match(/^\/api\/admin\/submissions\/([\w-]+)$/);
  if (subMatch) {
    const sub = await store.get("submissions", subMatch[1]);
    if (!sub || !can(FORM_VIEW[sub.form])) return send(404, { error: "לא נמצא" });
    if (method === "PATCH") {
      const body = await readBody(req);
      const next = { ...sub };
      const changes = {};
      if (body.status && ["new", "in_progress", "done", "archived", "approved", "rejected"].includes(body.status)) {
        next.status = body.status;
        changes.status = body.status;
      }
      if (typeof body.note === "string" && body.note.trim()) {
        next.notes = [...(sub.notes || []), { at: new Date().toISOString(), by: user.email, text: clean(body.note, 1000) }];
        changes.note = true;
      }
      if ("assignedMentorId" in body && sub.form === "ishaRequest") {
        if (body.assignedMentorId) {
          const mentor = await store.get("submissions", String(body.assignedMentorId));
          if (!mentor || mentor.form !== "ishaMentor" || mentor.status !== "approved") return send(400, { error: "ניתן לשבץ רק מלווה מאושרת" });
        }
        next.assignedMentorId = body.assignedMentorId || null;
        changes.assignedMentorId = next.assignedMentorId;
      }
      await store.put("submissions", sub.id, next);
      await audit(user, "עדכון פנייה", `${sub.form}:${sub.id.slice(0, 8)}`, changes);
      return send(200, { submission: await store.get("submissions", sub.id) });
    }
    if (method === "DELETE") {
      if (!isPrivileged(user.roles)) return send(403, { error: "מחיקה מותרת למנכ״ל ולמתכנת בלבד" });
      await store.del("submissions", sub.id);
      await audit(user, "מחיקת פנייה", `${sub.form}:${sub.id.slice(0, 8)}`);
      return send(200, { ok: true });
    }
  }

  // ---- תוכן האתר
  if (pathname === "/api/admin/content") {
    if (!can("content")) return send(403, { error: "אין הרשאה" });
    if (method === "GET") return send(200, { content: await getContent() });
    if (method === "PUT") {
      const body = await readBody(req, 1024 * 1024);
      if (!body.content || typeof body.content !== "object") return send(400, { error: "תוכן לא תקין" });
      await store.put("content", "site", { content: body.content, by: user.email });
      await audit(user, "עדכון תוכן האתר", body.section || "");
      return send(200, { ok: true });
    }
  }

  // ---- משתמשים
  if (pathname === "/api/admin/users") {
    if (!can("users")) return send(403, { error: "אין הרשאה" });
    if (method === "GET") {
      const docs = await store.list("users");
      const emails = new Set([...docs.map((d) => d.id), ...BOOTSTRAP.developer, ...BOOTSTRAP.ceo]);
      const users = [];
      for (const e of emails) {
        const d = docs.find((x) => x.id === e);
        const boot = bootstrapRoles(e);
        users.push({
          email: e,
          name: d?.name || "",
          picture: d?.picture || "",
          roles: normalizeRoles([...boot, ...(d?.roles || [])]),
          scope: d?.scope || {},
          phone: d?.phone || "",
          active: boot.length ? true : d?.active !== false,
          bootstrap: boot.length > 0,
          lastLoginAt: d?.lastLoginAt || null,
        });
      }
      const isDev = user.roles.includes("developer");
      return send(200, { users: isDev ? users : users.filter((u) => !u.roles.includes("developer")) });
    }
    if (method === "POST") {
      const body = await readBody(req);
      const email = clean(body.email, 120).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(400, { error: "כתובת מייל לא תקינה" });
      const allowed = grantableRoles(user.roles);
      const roles = (Array.isArray(body.roles) ? body.roles : []).filter((r) => allowed.includes(r));
      if (!roles.length) return send(400, { error: "יש לבחור לפחות תפקיד אחד" });
      if (bootstrapRoles(email).length) return send(400, { error: "משתמש יסוד - לא ניתן לשנות" });
      const org = await loadOrg(store);
      const scope = cleanScope(roles, body.scope, org);
      const missing = roles.find((r) => ROLE_SCOPE[r] && !scope[ROLE_SCOPE[r].domain]?.[ROLE_SCOPE[r].level === "city" ? "cityId" : "branchId"]);
      if (missing) return send(400, { error: `יש לבחור ${ROLE_SCOPE[missing].level === "city" ? "עיר" : "סניף"} עבור ${ROLES[missing].label}` });
      if (!canAssignScope(user, org, roles, scope)) return send(403, { error: "אפשר לשייך רק לסניפים שבאחריותך" });
      const prev = (await store.get("users", email)) || {};
      if (prev.roles?.includes("developer") && !user.roles.includes("developer")) return send(403, { error: "אין הרשאה" });
      const ph = body.phone ? phone.normalizePhone(body.phone) : "";
      await store.put("users", email, { ...prev, name: clean(body.name, 80) || prev.name || "", phone: ph, roles, scope, active: body.active !== false });
      await audit(user, prev.roles ? "עדכון משתמש" : "הוספת משתמש", email, { roles, scope, active: body.active !== false });
      return send(200, { ok: true });
    }
  }
  const userMatch = pathname.match(/^\/api\/admin\/users\/(.+)$/);
  if (userMatch && method === "DELETE") {
    if (!can("users")) return send(403, { error: "אין הרשאה" });
    const email = decodeURIComponent(userMatch[1]).toLowerCase();
    if (bootstrapRoles(email).length) return send(400, { error: "משתמש יסוד - לא ניתן למחוק" });
    const prev = await store.get("users", email);
    if (prev?.roles?.includes("developer") && !user.roles.includes("developer")) return send(403, { error: "אין הרשאה" });
    await store.del("users", email);
    await audit(user, "מחיקת משתמש", email);
    return send(200, { ok: true });
  }

  // ---- יומן
  if (pathname === "/api/admin/audit" && method === "GET") {
    if (!can("audit")) return send(403, { error: "אין הרשאה" });
    return send(200, { entries: await store.list("audit", 500) });
  }

  // ---- מתכנת
  if (pathname === "/api/admin/system" && method === "GET") {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    const content = await getContent();
    return send(200, {
      env: IS_PROD ? "production" : "development",
      node: process.version,
      uptimeSec: Math.round((Date.now() - STARTED) / 1000),
      storage: store.kind,
      counts: await store.counts(),
      checks: [
        { key: "GOOGLE_CLIENT_ID", ok: Boolean(GOOGLE_CLIENT_ID), note: "כניסת צוות עם Google" },
        { key: "SESSION_SECRET", ok: sessionSecretIsSet, note: "בלי זה הכניסות מתאפסות בכל הפעלה מחדש" },
        { key: "DATABASE_URL", ok: store.kind === "postgres", note: "בלי מסד - הנתונים נשמרים בקובץ שאינו קבוע באתר מפורסם" },
        { key: "YEMOT_TOKEN", ok: yemotConfigured(), note: "ימות המשיח - הודעות קוליות, צינתוקים ו-SMS" },
        { key: "קישור תרומה", ok: Boolean(content?.donation?.generalUrl), note: "תוכן האתר ← תרומות" },
        { key: "פרטי קשר", ok: Boolean(content?.contact?.phone || content?.contact?.email), note: "תוכן האתר ← פרטי קשר" },
      ],
      bootstrap: BOOTSTRAP,
      roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, { label: v.label, views: v.views }])),
    });
  }

  if (pathname === "/api/admin/export" && method === "GET") {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    const out = {};
    for (const c of ["users", "phoneUsers", "submissions", "content", "avrechim", "kollelEntries", "kollelMonths", "kollelSettings", "contacts", "broadcasts", "settings", "audit"]) out[c] = await store.list(c, 100000);
    out.phoneUsers = out.phoneUsers.map(({ codeHash: _h, ...u }) => u);
    await audit(user, "ייצוא גיבוי מלא");
    return json(res, 200, { exportedAt: new Date().toISOString(), ...out }, {
      "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }

  return send(404, { error: "לא נמצא" });
}

/* ------------------------------------------------------------------ קבצים סטטיים */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function serveStatic(req, res, url) {
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, safe);
  if (!file.startsWith(ROOT) || !(await isFile(file))) {
    if (extname(safe)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY });
      return res.end("לא נמצא");
    }
    file = join(ROOT, "index.html"); // ניתוב SPA
  }
  // באתר הפיתוח: שם נפרד לאפליקציה המותקנת
  if (!IS_PROD && url.pathname === "/manifest.webmanifest") {
    try {
      const m = JSON.parse(await readFile(join(ROOT, "manifest.webmanifest"), "utf8"));
      m.name = `${m.name} - אתר פיתוח`;
      m.short_name = "טללי ברכה - פיתוח";
      m.theme_color = "#FFD23F";
      res.writeHead(200, { "Content-Type": TYPES[".webmanifest"], "Cache-Control": "no-cache", ...SECURITY });
      return res.end(JSON.stringify(m));
    } catch {
      /* ממשיכים לקובץ הרגיל */
    }
  }
  // באתר הפיתוח: אייקונים בגרסת "אתר פיתוח"
  if (!IS_PROD && /\/brand\/icon-(\d+)\.png$/.test(file)) {
    const dev = file.replace(/icon-(\d+)\.png$/, "icon-dev-$1.png");
    if (await isFile(dev)) file = dev;
  }
  const ext = extname(file);
  const cache = file.includes(join(ROOT, "assets")) ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=3600";
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": cache, ...SECURITY };
  if (url.pathname.startsWith("/admin") || !IS_PROD) headers["X-Robots-Tag"] = "noindex, nofollow";
  res.writeHead(200, headers);
  res.end(await readFile(file));
}

/* ------------------------------------------------------------------ הפעלה */

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) {
    const status = e?.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? "שגיאת שרת" : e.message });
    else res.end();
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`האתר רץ על פורט ${PORT} · אחסון: ${store.kind} · סביבה: ${IS_PROD ? "ייצור" : "פיתוח"}`);
  if (IS_PROD && store.kind === "file") console.warn("אזהרה: אין DATABASE_URL - הנתונים לא יישמרו לאורך זמן באתר המפורסם!");
  if (IS_PROD && !sessionSecretIsSet) console.warn("אזהרה: SESSION_SECRET לא הוגדר");
});
