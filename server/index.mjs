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
import { dispatch, handleBroadcast, runScheduled } from "./broadcast.mjs";
import { yemotConfigured } from "./yemot.mjs";
import { handleMessages } from "./messages.mjs";
import { handleBnot } from "./bnot.mjs";
import { challahReminders, handleMitch, publicChallah, publicMitchShare } from "./mitch.mjs";
import { handleActivityCenter } from "./activityCenter.mjs";
import { handleSmart, publicImpact, runSmartAutomationSweep, smartSearch } from "./smart.mjs";
import * as push from "./webpush.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || (() => { try { return readFileSyncTB("google-client-id.txt", "utf8"); } catch { return ""; } })()).trim();
const DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "1" && !IS_PROD; // לבדיקות מקומיות בלבד
const STARTED = Date.now();

/* ---- אתר הפיתוח עובד על נתוני דמה מבודדים; האתר המפורסם - על המסד האמיתי בלבד */
const DEMO = !IS_PROD && process.env.DEV_REAL_DATA !== "1";
if (DEMO) {
  process.env.DATABASE_URL = "";
  process.env.DATA_FILE = process.env.DATA_FILE || join(process.cwd(), "data", "demo.json");
}
const store = await createStore();
/* באתר המפורסם: נתוני דמה נטענים פעם אחת אוטומטית (לבקשת נדב, עד שינקה אותם במסך מתכנת).
   אחרי "ניקוי" הם לא חוזרים. לכיבוי: SEED_DEMO_ONCE = false */
const SEED_DEMO_ONCE = true;
const DEMO_VERSION = 3; // גרסת דמו ארצית: 1000+ אנשים, סניפים ופעילות ללוח הארצי
if (!DEMO && SEED_DEMO_ONCE) {
  const st = await store.get("settings", "demoState");
  if (!st || (st.state === "seeded" && (st.v || 1) < DEMO_VERSION)) {
    const { seedDemo } = await import("./demoSeed.mjs");
    await seedDemo(store);
    await store.put("settings", "demoState", { state: "seeded", v: DEMO_VERSION, at: new Date().toISOString() });
    console.log("נתוני דמה נטענו");
  }
}
if (DEMO && !(await store.list("avrechim", 1)).length) {
  const { seedDemo } = await import("./demoSeed.mjs");
  await seedDemo(store);
  console.log("נתוני דמה נטענו לאתר הפיתוח");
}

/* ---- עדכונים בזמן אמת (Server-Sent Events): כל שינוי נתונים מודיע לכל המחוברים איזה אוסף השתנה */
const liveClients = new Set();
const QUIET = new Set(["audit"]); // לא מודיעים על רישומי יומן
function notifyChange(collection) {
  if (QUIET.has(collection)) return;
  const msg = `data: ${JSON.stringify({ c: collection })}\n\n`;
  for (const c of liveClients) {
    try {
      c.write(msg);
    } catch {
      liveClients.delete(c);
    }
  }
}
for (const fn of ["put", "del"]) {
  const orig = store[fn].bind(store);
  store[fn] = async (collection, ...rest) => {
    const r = await orig(collection, ...rest);
    notifyChange(collection);
    return r;
  };
}
setInterval(() => {
  for (const c of liveClients) {
    try {
      c.write(": ping\n\n");
    } catch {
      liveClients.delete(c);
    }
  }
}, 25_000).unref();

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
const isLocalRequest = (req) => {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

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

/** שליחת התראת Push לכל מי שעומד בתנאי (ברקע, לא מעכב את הבקשה) */
const notify = (filter, data) => {
  push.notify(store, resolveUser, filter, data);
};
const BOOT_EMAILS = [...BOOTSTRAP.developer, ...BOOTSTRAP.ceo];
const ROLE_LABELS = Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label]));

/* ---- גיבוי יומי אוטומטי (נשמרים 14 אחרונים) */
const BACKUP_COLLECTIONS = [
  "users", "phoneUsers", "submissions", "content", "avrechim", "kollelEntries", "kollelMonths", "kollelSettings", "kollelAttendance",
  "orgUnits", "contacts", "broadcasts", "settings", "messages", "bnotMembers", "bnotActivities", "pushSubs",
  "kollelMonthStatus", "bcTemplates", "bcScheduled", "donations", "avrechFiles", "mitchazkim", "challahEvents", "mitchAccess", "mitchUpdates",
  "smartTasks", "callerAssignments",
];
async function makeBackup(reason, byName = "מערכת") {
  const data = {};
  let count = 0;
  for (const c of BACKUP_COLLECTIONS) {
    data[c] = await store.list(c, 100000);
    count += data[c].length;
  }
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await store.put("backups", id, { at: new Date().toISOString(), reason, byName, count, data });
  const all = await store.list("backups", 1000);
  for (const old of all.slice(14)) await store.del("backups", old.id);
  return id;
}
async function backupIfDue() {
  try {
    const last = (await store.list("backups", 1))[0];
    if (!last || Date.now() - new Date(last.at || last.createdAt).getTime() > 23.5 * 3600 * 1000) await makeBackup("גיבוי יומי אוטומטי");
  } catch (e) {
    console.error("backup", e?.message);
  }
}
/* ---- משימות כל דקה: תפוצות מתוזמנות ותזכורת נוכחות */
async function everyMinute() {
  try {
    await runScheduled(store, audit);
  } catch (e) {
    console.error("scheduled", e?.message);
  }
  try {
    const settings = (await store.get("settings", "broadcast")) || {};
    if (yemotConfigured()) await challahReminders(store, (text, phones) => dispatch("sms", text, null, settings, phones));
  } catch (e) {
    console.error("challah", e?.message);
  }
  try {
    await runSmartAutomationSweep(store, notify);
  } catch (e) {
    console.error("smart automation", e?.message);
  }
  try {
    const rem = await store.get("settings", "kollelReminder");
    if (!rem?.enabled) return;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const today = israelDate();
    if (`${parts.hour}:${parts.minute}` !== rem.time || !(rem.days || []).includes(day) || rem.lastSent === today) return;
    await store.put("settings", "kollelReminder", { ...rem, lastSent: today });
    const sessions = new Set((await store.list("kollelAttendance", 50000)).filter((x) => x.date === today).map((x) => x.branchId));
    const branches = (await store.list("orgUnits")).filter((u) => u.type === "branch" && u.domain === "kollel" && !sessions.has(u.id));
    if (!branches.length) return;
    const ids = new Set(branches.map((b) => b.id));
    const people = [...(await store.list("phoneUsers")), ...(await store.list("users")).filter((u) => u.phone)]
      .filter((u) => u.active !== false && normalizeRoles(u.roles).includes("kollel_branch") && ids.has(u.scope?.kollel?.branchId));
    const phones = people.map((u) => ({ name: u.name || "", phone: u.phone })).filter((r) => phone.validPhone(r.phone));
    if (!phones.length) return;
    const settings = (await store.get("settings", "broadcast")) || {};
    const result = await dispatch(rem.channel, rem.text, settings.templateId, settings, phones).catch((e) => ({ error: e.message }));
    await store.put("broadcasts", randomUUID(), {
      channel: rem.channel, channelLabel: rem.channel === "tzintuk" ? "צינתוק" : "SMS", text: rem.text, groups: ["תזכורת נוכחות אוטומטית"],
      count: phones.length, test: false, by: "system", byName: "תזכורת אוטומטית", status: result?.error ? "error" : "sent", result,
    });
    await audit({ name: "מערכת" }, "תזכורת נוכחות נשלחה", `${phones.length} מנהלי סניפים`);
  } catch (e) {
    console.error("reminder", e?.message);
  }
}
setInterval(everyMinute, 60_000).unref();

setTimeout(backupIfDue, 60_000).unref();
setInterval(backupIfDue, 60 * 60_000).unref();

/** תאריך היום לפי שעון ישראל YYYY-MM-DD */
const israelDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/* ------------------------------------------------------------------ תוכן */

async function getContent() {
  return (await store.get("content", "site"))?.content ?? null;
}
async function getFeatureFlags() {
  const saved = (await store.get("settings", "features")) || {};
  return { donations: saved.donations === true };
}

/* ------------------------------------------------------------------ ניתוב API */

async function api(req, res, url) {
  const { pathname } = url;
  const method = req.method || "GET";

  // כתובות שמקבלות הודעות משירותים חיצוניים (מוגנות במפתח סודי) - פטורות מבדיקת מקור
  const external = pathname === "/api/donations/callback" || pathname === "/api/yemot/attendance";
  if (method !== "GET" && !external && !sameOrigin(req)) return json(res, 403, { error: "מקור הבקשה לא מורשה" });

  // ---- ציבורי
  if (pathname === "/api/public/bootstrap" && method === "GET") {
    return json(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID || null,
      env: IS_PROD ? "production" : "development",
      devLogin: DEV_LOGIN && isLocalRequest(req),
      demo: DEMO,
      featureFlags: await getFeatureFlags(),
      content: await getContent(),
    });
  }

  // נדרים פלוס (או כל סליקה): כתובת שמקבלת הודעה על כל תרומה ושומרת אותה ברשימת התרומות
  if (pathname === "/api/donations/callback" && (method === "POST" || method === "GET")) {
    if (!(await getFeatureFlags()).donations) return json(res, 404, { error: "לא נמצא" });
    const hook = await store.get("settings", "donationHook");
    if (!hook?.key || url.searchParams.get("key") !== hook.key) return json(res, 403, { error: "אין הרשאה" });
    if (rateLimited(`don:${clientIp(req)}`, 120, 60_000)) return json(res, 429, { error: "יותר מדי" });
    let raw = {};
    if (method === "POST") {
      const txt = await new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c, d.length > 64 * 1024 && req.destroy()));
        req.on("end", () => resolve(d));
      });
      try {
        raw = JSON.parse(txt);
      } catch {
        raw = Object.fromEntries(new URLSearchParams(txt));
      }
    } else raw = Object.fromEntries(url.searchParams);
    delete raw.key;
    const pick = (...ks) => { for (const k of ks) if (raw[k] !== undefined && raw[k] !== "") return String(raw[k]); return ""; };
    const txId = pick("TransactionId", "transactionId", "Confirmation", "id") || randomUUID();
    const doc = {
      amount: Number(pick("Amount", "amount", "Sum", "sum")) || 0,
      name: clean(pick("ClientName", "Name", "name", "FullName"), 120),
      phone: phone.normalizePhone(pick("Phone", "phone", "Tel")),
      email: clean(pick("Mail", "Email", "email"), 120),
      installments: Number(pick("Tashloumim", "Payments", "installments")) || 1,
      comments: clean(pick("Comments", "Comment", "comments", "Dedication"), 300),
      txId: clean(txId, 60),
      source: "callback",
      raw: Object.fromEntries(Object.entries(raw).slice(0, 40).map(([k, v]) => [clean(k, 40), clean(v, 300)])),
    };
    await store.put("donations", `d-${clean(txId, 60).replace(/[^\w-]/g, "")}`, doc);
    notify((u) => u.views.includes("donations"), { title: "תרומה חדשה", body: `${doc.name || "תורם"} · ${doc.amount} ₪`, url: "/admin?v=donations" });
    return json(res, 200, { ok: true });
  }

  // ימות המשיח: אברך מתקשר מהטלפון והנוכחות נרשמת לפי מספר המתקשר (שלוחת API בימות)
  if (pathname === "/api/yemot/attendance") {
    const say = (t) => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(`id_list_message=t-${String(t).replace(/[.,&=]/g, " ")}&go_to_folder=hangup`);
    };
    const hook = await store.get("settings", "yemotHook");
    if (!hook?.key || url.searchParams.get("key") !== hook.key) return say("אין הרשאה");
    if (rateLimited(`yemot:${clientIp(req)}`, 300, 60_000)) return say("נסו שוב בעוד דקה");
    const caller = phone.normalizePhone(url.searchParams.get("ApiPhone") || "");
    if (url.searchParams.get("hangup") === "yes") return say("");
    const av = (await store.list("avrechim", 20000)).find((a) => a.active !== false && a.phone && a.phone === caller);
    if (!av) return say("המספר שממנו התקשרת אינו רשום בכולל");
    if (!av.branchId) return say(`שלום ${av.name} לא הוגדר לך סניף`);
    const month = (await store.list("kollelMonths")).filter((m) => !m.locked).sort((a, b) => (b.order || 0) - (a.order || 0))[0];
    if (!month) return say("אין כרגע חודש פתוח לדיווח");
    const date = israelDate();
    const id = `${av.branchId}_${date}`;
    const prev = await store.get("kollelAttendance", id);
    if (prev?.present?.includes(av.id)) return say(`שלום ${av.name} הנוכחות שלך היום כבר רשומה`);
    await store.put("kollelAttendance", id, {
      branchId: av.branchId,
      date,
      month: prev?.month || month.id,
      present: [...(prev?.present || []), av.id],
      by: prev?.by || "yemot",
      byName: prev?.byName || "ימות המשיח",
    });
    return say(`שלום ${av.name} הנוכחות שלך נרשמה תודה`);
  }

  // הרשמה ציבורית להפרשת חלה
  if (pathname.startsWith("/api/public/challah/")) {
    if (await publicChallah(req, res, url, { store, json, readBody, clean, rateLimited, clientIp, notify })) return;
  }

  // עדכון אישי של מתחזק/ת דרך קישור מאובטח מוואטסאפ
  if (pathname === "/api/public/mitch-share") {
    if (await publicMitchShare(req, res, url, { store, json, readBody, clean, rateLimited, clientIp, notify })) return;
  }

  if (pathname === "/api/public/live-impact" && method === "GET") {
    return json(res, 200, await publicImpact(store));
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
    const FORM_TITLES = { ishaRequest: "בקשת שיחה חדשה", ishaMentor: "מלווה חדשה נרשמה", contact: "פנייה חדשה מהאתר", volunteer: "התנדבות חדשה", updates: "הרשמה לעדכונים", assistance: "בקשת סיוע חדשה" };
    notify((u) => u.views.includes(FORM_VIEW[formId]), { title: FORM_TITLES[formId] || "פנייה חדשה", body: String(cleanData.fullName || cleanData.name || ""), url: `/admin?v=${FORM_VIEW[formId]}` });
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
    if (!DEV_LOGIN || !isLocalRequest(req)) return json(res, 404, { error: "לא זמין" });
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
  const rawOrgScope = req.headers["x-tb-org-scope"];
  if (typeof rawOrgScope === "string" && rawOrgScope.length < 1500) {
    try {
      const parsed = JSON.parse(rawOrgScope);
      const activeOrgScope = {};
      for (const domain of ["kollel", "bnot"]) {
        const x = parsed?.[domain];
        if (x && ["region", "city", "branch"].includes(String(x.level)) && /^[\w-]{1,120}$/.test(String(x.id || ""))) {
          activeOrgScope[domain] = { level: String(x.level), id: String(x.id) };
        }
      }
      user = { ...user, activeOrgScope };
    } catch {
      // בחירה מקומית פגומה לא משפיעה על ההרשאות או על הכניסה.
    }
  }
  const featureFlags = await getFeatureFlags();
  if (!featureFlags.donations && user.views.includes("donations")) {
    user = { ...user, views: user.views.filter((v) => v !== "donations") };
  }
  const renew = shouldRenew(session) ? { "Set-Cookie": createSessionCookie(real.id, isSecure(req), asId) } : {};
  const can = (view) => user.views.includes(view);
  const send = (status, body) => json(res, status, body, renew);

  if (pathname === "/api/events" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 5000\n\n");
    liveClients.add(res);
    req.on("close", () => liveClients.delete(res));
    return;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    return send(200, {
      user,
      account: real,
      roleLabels: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])),
      viewLabels: VIEW_LABELS,
      assignableRoles: grantableRoles(user.roles),
      mustChangeCode: user.kind === "phone" && !user.impersonatedBy ? Boolean((await store.get("phoneUsers", user.subId))?.mustChangeCode) : false,
      canImpersonate: canImpersonate(real),
      featureFlags,
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

  // ---- הפרופיל שלי: תמיד מעדכן את החשבון האמיתי, גם בזמן צפייה בתצוגה אחרת
  if (pathname === "/api/auth/profile" && method === "POST") {
    const b = await readBody(req);
    const name = clean(b.name, 80).trim();
    const ph = b.phone ? phone.normalizePhone(b.phone) : "";
    if (ph && !phone.validPhone(ph)) return send(400, { error: "מספר טלפון לא תקין" });
    if (real.kind === "phone") {
      if (!ph) return send(400, { error: "חובה טלפון - זה שם המשתמש שלך" });
      const all = await store.list("phoneUsers");
      if (all.some((u) => u.phone === ph && u.id !== real.subId)) return send(400, { error: "המספר כבר רשום אצל משתמש אחר" });
      const doc = all.find((u) => u.id === real.subId);
      await store.put("phoneUsers", doc.id, { ...doc, phone: ph, name: name || doc.name });
    } else {
      const prev = (await store.get("users", real.email)) || { roles: [] };
      await store.put("users", real.email, { ...prev, phone: ph, name: name || prev.name || "" });
    }
    await audit(real, "עדכון פרופיל אישי", name || real.name || "");
    return send(200, { ok: true });
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
  const ctx = { user, send, store, readBody, audit, clean, resolveUser, bootstrapEmails: BOOT_EMAILS, notify, roleLabels: ROLE_LABELS };
  if (await handleOrg(req, res, url, ctx)) return;
  if (await handleMessages(req, res, url, ctx)) return;
  if (await handleBnot(req, res, url, ctx)) return;
  if (await handleMitch(req, res, url, ctx)) return;

  // ---- התראות לטלפון
  if (pathname === "/api/push/key" && method === "GET") {
    return send(200, { key: (await push.vapidKeys(store)).publicKey });
  }
  if (pathname === "/api/push/subscribe" && method === "POST") {
    if (user.impersonatedBy) return send(400, { error: "בתצוגה של משתמש אחר אי אפשר" });
    const { subscription } = await readBody(req);
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return send(400, { error: "מנוי לא תקין" });
    const sub = { endpoint: String(subscription.endpoint).slice(0, 1000), keys: { p256dh: String(subscription.keys.p256dh).slice(0, 200), auth: String(subscription.keys.auth).slice(0, 100) } };
    await store.put("pushSubs", push.subId(sub.endpoint), { userId: user.id, sub, ua: clean(req.headers["user-agent"], 200) });
    return send(200, { ok: true });
  }
  if (pathname === "/api/push/unsubscribe" && method === "POST") {
    const { endpoint } = await readBody(req);
    await store.del("pushSubs", push.subId(endpoint));
    return send(200, { ok: true });
  }
  if (pathname === "/api/push/test" && method === "POST") {
    const keys = await push.vapidKeys(store);
    const mine = (await store.list("pushSubs")).filter((x) => x.userId === user.id);
    if (!mine.length) return send(400, { error: "המכשיר עוד לא נרשם להתראות" });
    const results = await Promise.all(mine.map((x) => push.sendPush(x.sub, { title: "קרן טללי ברכה", body: "ההתראות פועלות ✓", url: "/admin" }, keys).catch((e) => e.message)));
    return send(200, { ok: true, results });
  }

  // ---- חיפוש כללי (לפי ההרשאות של המשתמש)
  if (pathname === "/api/search" && method === "GET") {
    const q = clean(url.searchParams.get("q"), 60).trim();
    if (q.length < 2) return send(200, { results: [] });
    const has = (...xs) => xs.some((x) => String(x || "").includes(q));
    const out = [];
    const org = await loadOrg(store);
    if (can("kollel")) {
      const { branchScope } = await import("./org.mjs");
      const sc = branchScope(user, org, "kollel");
      for (const a of await store.list("avrechim", 20000)) {
        if (sc !== null && !sc.has(a.branchId)) continue;
        if (has(a.name, a.phone)) out.push({ kind: "avrech", id: a.id, title: a.name, sub: [a.phone, org.branches.find((b) => b.id === a.branchId)?.name].filter(Boolean).join(" · "), view: "kollel", tab: `avrechim:q:${a.name}` });
      }
    }
    if (can("bnot")) {
      const { branchScope } = await import("./org.mjs");
      const sc = branchScope(user, org, "bnot");
      for (const m of await store.list("bnotMembers", 20000)) {
        if (sc !== null && !sc.has(m.branchId)) continue;
        if (has(m.name, m.phone)) out.push({ kind: "member", id: m.id, title: m.name, sub: m.phone, view: "bnot", tab: `members:q:${m.name}` });
      }
    }
    for (const m of await store.list("mitchazkim", 20000)) {
      const dom = m.domain === "bnot" ? "bnot" : "kollel";
      if (!can(dom === "kollel" ? "kollel" : "bnot")) continue;
      const { branchScope } = await import("./org.mjs");
      const sc = branchScope(user, org, dom);
      if (sc !== null && !sc.has(m.branchId)) continue;
      if (has(m.name, m.phone)) out.push({ kind: "mitch", id: m.id, title: m.name, sub: [m.phone, m.stage].filter(Boolean).join(" · "), view: dom === "kollel" ? "kollel" : "bnot", tab: `mitch:q:${m.name}` });
    }
    const forms = Object.entries(FORM_VIEW).filter(([, v]) => can(v)).map(([f]) => f);
    for (const s2 of await store.list("submissions", 5000)) {
      if (!forms.includes(s2.form)) continue;
      const d = s2.data || {};
      if (has(d.name, d.fullName, d.phone, d.email)) out.push({ kind: "submission", id: s2.id, title: String(d.fullName || d.name || "פנייה"), sub: String(d.phone || d.email || ""), view: FORM_VIEW[s2.form], tab: FORM_VIEW[s2.form] === "isha" ? s2.form : undefined });
    }
    if (can("users") || can("org")) {
      for (const u of await store.list("phoneUsers")) if (has(u.name, u.phone)) out.push({ kind: "staff", id: u.id, title: u.name, sub: u.phone, view: can("users") ? "users" : "org" });
    }
    if (can("broadcast") && (isPrivileged(user.roles) || user.roles.includes("office"))) {
      for (const c of await store.list("contacts", 20000)) if (has(c.name, c.phone, c.email)) out.push({ kind: "contact", id: c.id, title: c.name, sub: c.phone, view: "broadcast", tab: "contacts" });
    }
    if (can("donations")) {
      for (const d of await store.list("donations", 20000)) if (has(d.name, d.phone, d.email)) out.push({ kind: "donation", id: d.id, title: d.name || "תרומה", sub: `${d.amount} ₪`, view: "donations" });
    }
    const smart = user.views.includes("smart") ? await smartSearch(user, store, q) : [];
    return send(200, { results: [...smart, ...out].slice(0, 60) });
  }

  // ---- תרומות
  if (pathname === "/api/donations" && method === "GET") {
    if (!can("donations")) return send(403, { error: "אין הרשאה" });
    const rows = (await store.list("donations", 20000)).map(({ raw: _r, ...d }) => d);
    return send(200, { donations: rows });
  }
  if (pathname === "/api/donations" && method === "POST") {
    if (!can("donations")) return send(403, { error: "אין הרשאה" });
    const b = await readBody(req);
    const amount = Number(b.amount);
    if (!amount) return send(400, { error: "חסר סכום" });
    const id = b.id ? String(b.id) : `m-${randomUUID()}`;
    await store.put("donations", id, { amount, name: clean(b.name, 120), phone: phone.normalizePhone(b.phone), email: clean(b.email, 120), comments: clean(b.comments, 300), method: clean(b.method, 40), date: clean(b.date, 10), source: "manual", byName: user.name || user.email });
    await audit(user, "רישום תרומה", `${clean(b.name, 60)} · ${amount}`);
    return send(200, { ok: true, id });
  }
  const donDel = pathname.match(/^\/api\/donations\/([\w-]+)$/);
  if (donDel && method === "DELETE") {
    if (!featureFlags.donations) return send(404, { error: "לא נמצא" });
    if (!isPrivileged(user.roles)) return send(403, { error: "מחיקה - מנכ״ל או מתכנת" });
    await store.del("donations", donDel[1]);
    await audit(user, "מחיקת תרומה", donDel[1]);
    return send(200, { ok: true });
  }
  if (pathname === "/api/admin/donation-hook" && method === "GET") {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    if (!featureFlags.donations) return send(404, { error: "מודול התרומות כבוי" });
    let hook = await store.get("settings", "donationHook");
    if (!hook?.key) {
      hook = { key: randomUUID().replace(/-/g, "") };
      await store.put("settings", "donationHook", hook);
    }
    const origin = `${isSecure(req) ? "https" : "http"}://${req.headers.host}`;
    return send(200, { url: `${origin}/api/donations/callback?key=${hook.key}` });
  }

  // ---- גיבויים (מתכנת)
  if (pathname === "/api/admin/backups" && (method === "GET" || method === "POST")) {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    if (method === "POST") {
      const id = await makeBackup("גיבוי ידני", user.name || user.email);
      await audit(user, "גיבוי ידני");
      return send(200, { ok: true, id });
    }
    const rows = (await store.list("backups", 100)).map(({ data: _d, ...b }) => b);
    return send(200, { backups: rows });
  }
  const bkMatch = pathname.match(/^\/api\/admin\/backups\/([\w-]+)(\/restore)?$/);
  if (bkMatch) {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    const bk = await store.get("backups", bkMatch[1]);
    if (!bk) return send(404, { error: "לא נמצא" });
    if (!bkMatch[2] && method === "GET") {
      const data = { ...bk.data, phoneUsers: (bk.data.phoneUsers || []).map(({ codeHash: _h, ...u }) => u), settings: (bk.data.settings || []).filter((x) => x.id !== "vapid") };
      return json(res, 200, { exportedAt: bk.at, reason: bk.reason, ...data }, { "Content-Disposition": `attachment; filename="backup-${bk.id}.json"` });
    }
    if (bkMatch[2] && method === "POST") {
      const { confirm } = await readBody(req);
      if (confirm !== "שחזור") return send(400, { error: "יש לאשר את השחזור" });
      await makeBackup("לפני שחזור", user.name || user.email);
      for (const c of BACKUP_COLLECTIONS) {
        if (!bk.data[c]) continue;
        const keep = new Set(bk.data[c].map((d) => d.id));
        for (const d of await store.list(c, 100000)) if (!keep.has(d.id)) await store.del(c, d.id);
        for (const d of bk.data[c]) await store.put(c, d.id, d);
      }
      await audit(user, "שחזור מגיבוי", bk.reason + " · " + bk.at);
      return send(200, { ok: true });
    }
  }

  // ---- נתוני דמה גם באתר המפורסם (מתכנת בלבד): הוספה וניקוי. רק רשומות demo- נוגעות
  if ((pathname === "/api/admin/demo/seed" || pathname === "/api/admin/demo/clear") && method === "POST") {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    const { seedDemo, clearDemo } = await import("./demoSeed.mjs");
    if (pathname.endsWith("seed")) {
      await seedDemo(store);
      await store.put("settings", "demoState", { state: "seeded", v: DEMO_VERSION, at: new Date().toISOString() });
      await audit(user, "הוספת נתוני דמה");
      return send(200, { ok: true });
    }
    const n = await clearDemo(store, BACKUP_COLLECTIONS);
    await store.put("settings", "demoState", { state: "cleared", at: new Date().toISOString() });
    await audit(user, "ניקוי נתוני דמה", `${n} רשומות`);
    return send(200, { ok: true, removed: n });
  }

  // ---- איפוס נתוני הדמה (אתר פיתוח בלבד)
  if (pathname === "/api/admin/demo/reset" && method === "POST") {
    if (!DEMO || !can("developer")) return send(403, { error: "זמין רק באתר הפיתוח" });
    for (const c of [...BACKUP_COLLECTIONS, "backups", "audit"]) for (const d of await store.list(c, 100000)) await store.del(c, d.id);
    const { seedDemo } = await import("./demoSeed.mjs");
    await seedDemo(store);
    return send(200, { ok: true });
  }

  // ---- כתובת לשלוחת ימות המשיח (מתכנת)
  if (pathname === "/api/admin/yemot-hook" && method === "GET") {
    if (!can("developer")) return send(403, { error: "אין הרשאה" });
    let hook = await store.get("settings", "yemotHook");
    if (!hook?.key) {
      hook = { key: randomUUID().replace(/-/g, "") };
      await store.put("settings", "yemotHook", hook);
    }
    const origin = `${isSecure(req) ? "https" : "http"}://${req.headers.host}`;
    return send(200, { url: `${origin}/api/yemot/attendance?key=${hook.key}` });
  }
  if (await handleSmart(req, res, url, ctx)) return;
  if (await handleActivityCenter(req, res, url, ctx)) return;
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
          next.assignedMentorId = String(body.assignedMentorId);
          next.assignedAt = new Date().toISOString();
          if (next.status === "new") next.status = "in_progress";
        } else {
          next.assignedMentorId = null;
          next.assignedAt = null;
        }
        changes.assignedMentorId = next.assignedMentorId;
        changes.status = next.status;
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

  // ---- מתכנת: הפעלה/כיבוי של מודולים אופציונליים
  if (pathname === "/api/admin/features" && method === "GET") {
    if (!real.roles.includes("developer")) return send(403, { error: "מתכנת בלבד" });
    return send(200, { features: await getFeatureFlags() });
  }
  if (pathname === "/api/admin/features" && method === "POST") {
    if (!real.roles.includes("developer")) return send(403, { error: "מתכנת בלבד" });
    const b = await readBody(req);
    const next = { ...(await getFeatureFlags()), donations: b.donations === true };
    await store.put("settings", "features", next);
    await audit(real, next.donations ? "הפעלת מודול תרומות" : "כיבוי מודול תרומות");
    return send(200, { ok: true, features: next });
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
    for (const c of [...BACKUP_COLLECTIONS.filter((x) => x !== "pushSubs"), "audit"]) out[c] = await store.list(c, 100000);
    out.phoneUsers = out.phoneUsers.map(({ codeHash: _h, ...u }) => u);
    out.settings = out.settings.filter((x) => x.id !== "vapid");
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
