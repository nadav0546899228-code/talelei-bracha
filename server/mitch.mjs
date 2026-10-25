/**
 * מתחזקים ומתחזקות + אירועי הפרשת חלה.
 * בנים: כל מתחזק משויך לאברך (חברותא בכולל הערב). הנוכחות שלו נרשמת במפגש הערב יחד עם האברך.
 * בנות: הפרשת חלה עם הרשמה ← משתתפת הופכת למתחזקת ← קשר מתמשך (יומן קשר + מעקב הבא).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isPrivileged } from "./roles.mjs";
import { branchScope, loadOrg } from "./org.mjs";
import { normalizePhone, validPhone } from "./phoneAuth.mjs";
import {
  DEFAULT_STAGES,
  enrichMitchRows,
  loadMitchConfig,
  monthStats,
  normalizeMitchConfig,
  summarizeAttention,
} from "./mitchWorkflow.mjs";

export const STAGES = DEFAULT_STAGES;
const CONTACT_TYPES = ["שיחה", "פגישה", "הודעה", "שיעור", "אירוע"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const tokenHash = (token) => createHash("sha256").update(String(token || "")).digest("hex");
const imageDataOk = (value) => /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ""));

export async function handleMitch(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/mitch") && !pathname.startsWith("/api/challah")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";
  const org = await loadOrg(store);
  const scopeOf = (domain) => branchScope(user, org, domain);
  const can = (domain) => user.views.includes(domain === "kollel" ? "kollel" : "bnot");
  const inScope = (domain, branchId) => {
    const s = scopeOf(domain);
    return s === null || s.has(branchId);
  };
  const canManageWorkflow = (domain) =>
    isPrivileged(user.roles) ||
    user.roles.includes("chief_coordinator") ||
    user.roles.includes(`${domain}_region`) ||
    user.roles.includes(`${domain}_city`);

  /* ---------------- מתחזקים / מתחזקות */
  if (pathname === "/api/mitch" && method === "GET") {
    const domain = url.searchParams.get("domain") === "bnot" ? "bnot" : "kollel";
    if (!can(domain)) return send(403, { error: "אין הרשאה" }), true;
    const config = await loadMitchConfig(store, domain);
    const baseRows = (await store.list("mitchazkim", 20000)).filter((m) => m.domain === domain && inScope(domain, m.branchId));
    const rows = await enrichMitchRows(store, baseRows, domain, config);
    const rowIds = new Set(rows.map((m) => m.id));
    const pendingByMitch = {};
    for (const u of await store.list("mitchUpdates", 5000)) {
      if (u.status === "pending" && rowIds.has(u.mitchId)) pendingByMitch[u.mitchId] = (pendingByMitch[u.mitchId] || 0) + 1;
    }
    const branches = org.branches.filter((b) => b.domain === domain && inScope(domain, b.id));
    const cities = org.cities.filter((c) => c.domain === domain && branches.some((b) => b.parentId === c.id));
    let avrechim = [];
    if (domain === "kollel") avrechim = (await store.list("avrechim", 20000)).filter((a) => a.active !== false && inScope("kollel", a.branchId)).map((a) => ({ id: a.id, name: a.name, branchId: a.branchId }));
    return send(200, {
      mitch: rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "he")),
      branches,
      cities,
      avrechim,
      stages: config.stages,
      workflow: config,
      canManageWorkflow: canManageWorkflow(domain),
      attentionSummary: summarizeAttention(rows),
      monthStats: monthStats(rows),
      contactTypes: CONTACT_TYPES,
      today: today(),
      pendingByMitch,
    }), true;
  }

  if (pathname === "/api/mitch/settings" && method === "PUT") {
    const domain = url.searchParams.get("domain") === "bnot" ? "bnot" : "kollel";
    if (!can(domain) || !canManageWorkflow(domain)) return send(403, { error: "אין הרשאה לשנות הגדרות מעקב" }), true;
    const body = await readBody(req);
    const next = normalizeMitchConfig(domain, body);
    await store.put("settings", `mitchWorkflow:${domain}`, next);
    await audit(user, "עדכון הגדרות מעקב מתחזקים", domain === "bnot" ? "בנות צילה" : "כולל ערב");
    return send(200, { ok: true, workflow: next }), true;
  }

  // היסטוריית העברה בין אברכים - מתכנת בלבד. אין endpoint מקביל למשתמשים אחרים.
  if (pathname === "/api/mitch/transfers" && method === "GET") {
    if (!user.roles.includes("developer")) return send(403, { error: "מתכנת בלבד" }), true;
    const mitchId = String(url.searchParams.get("mitchId") || "");
    const rows = (await store.list("mitchTransfers", 5000))
      .filter((x) => !mitchId || x.mitchId === mitchId)
      .sort((a, b) => String(b.at || b.createdAt || "").localeCompare(String(a.at || a.createdAt || "")));
    return send(200, { transfers: rows }), true;
  }

  // קישור אישי לכתיבת עדכונים: יצירת קישור חדש מבטלת קישורים קודמים לאותו מתחזק/ת.
  const accessMatch = pathname.match(/^\/api\/mitch\/([\w-]+)\/access-link$/);
  if (accessMatch && method === "POST") {
    const m = await store.get("mitchazkim", accessMatch[1]);
    if (!m || !can(m.domain) || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    const token = randomBytes(32).toString("base64url");
    const hash = tokenHash(token);
    for (const old of await store.list("mitchAccess", 20000)) {
      if (old.mitchId === m.id) await store.del("mitchAccess", old.id);
    }
    await store.put("mitchAccess", hash, {
      mitchId: m.id,
      domain: m.domain,
      branchId: m.branchId,
      active: true,
      expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
    await audit(user, "יצירת קישור אישי למתחזק", m.name);
    return send(200, { ok: true, token }), true;
  }
  if (accessMatch && method === "DELETE") {
    const m = await store.get("mitchazkim", accessMatch[1]);
    if (!m || !can(m.domain) || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    for (const old of await store.list("mitchAccess", 20000)) {
      if (old.mitchId === m.id) await store.del("mitchAccess", old.id);
    }
    await audit(user, "ביטול קישור אישי למתחזק", m.name);
    return send(200, { ok: true }), true;
  }

  // עדכונים שנשלחו מהקישור האישי - מוצגים רק למי שרואה את הסניף.
  const updatesMatch = pathname.match(/^\/api\/mitch\/([\w-]+)\/updates$/);
  if (updatesMatch && method === "GET") {
    const m = await store.get("mitchazkim", updatesMatch[1]);
    if (!m || !can(m.domain) || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    const updates = (await store.list("mitchUpdates", 5000))
      .filter((u) => u.mitchId === m.id)
      .sort((a, b) => String(b.submittedAt || b.createdAt || "").localeCompare(String(a.submittedAt || a.createdAt || "")))
      .slice(0, 60);
    return send(200, { updates }), true;
  }

  const reviewMatch = pathname.match(/^\/api\/mitch\/updates\/([\w-]+)\/(approve|reject)$/);
  if (reviewMatch && method === "POST") {
    const update = await store.get("mitchUpdates", reviewMatch[1]);
    if (!update || !can(update.domain) || !inScope(update.domain, update.branchId)) return send(404, { error: "לא נמצא" }), true;
    if (update.status !== "pending") return send(400, { error: "העדכון כבר טופל" }), true;
    const reviewer = user.name || user.email || user.phone || "רכז/ת";
    const reviewedAt = new Date().toISOString();
    if (reviewMatch[2] === "approve") {
      const m = await store.get("mitchazkim", update.mitchId);
      if (!m) return send(404, { error: "המתחזק/ת לא נמצא/ה" }), true;
      const entry = {
        id: randomUUID().slice(0, 8),
        date: String(update.submittedAt || reviewedAt).slice(0, 10),
        type: "דיווח עצמי",
        note: update.text || (update.photos?.length ? `צורפו ${update.photos.length} תמונות` : ""),
        by: `אושר ע״י ${reviewer}`,
        updateId: update.id,
      };
      await store.put("mitchazkim", m.id, { ...m, log: [entry, ...(m.log || [])].slice(0, 300), lastContact: entry.date });
      await store.put("mitchUpdates", update.id, { ...update, status: "approved", reviewedAt, reviewedBy: reviewer });
      await audit(user, "אישור עדכון מתחזק", m.name);
    } else {
      await store.put("mitchUpdates", update.id, { ...update, status: "rejected", reviewedAt, reviewedBy: reviewer });
      await audit(user, "דחיית עדכון מתחזק", update.mitchName || update.mitchId);
    }
    return send(200, { ok: true }), true;
  }

  if (pathname === "/api/mitch" && method === "POST") {
    const b = await readBody(req);
    const domain = b.domain === "bnot" ? "bnot" : "kollel";
    if (!can(domain)) return send(403, { error: "אין הרשאה" }), true;
    const name = clean(b.name, 80).trim();
    if (!name) return send(400, { error: "חסר שם" }), true;
    const branchId = String(b.branchId || "");
    if (!org.branches.some((x) => x.id === branchId && x.domain === domain) || !inScope(domain, branchId)) return send(400, { error: "יש לבחור סניף שבאחריותך" }), true;
    const id = b.id ? String(b.id) : randomUUID();
    const prev = await store.get("mitchazkim", id);
    if (prev && !inScope(prev.domain, prev.branchId)) return send(403, { error: "אין הרשאה" }), true;
    const config = await loadMitchConfig(store, domain);
    let avrechId = null;
    if (domain === "kollel" && b.avrechId) {
      const av = await store.get("avrechim", String(b.avrechId));
      if (av && av.branchId === branchId) avrechId = av.id;
    }
    const now = new Date().toISOString();
    const stage = config.stages.includes(b.stage) ? b.stage : prev?.stage || config.stages[0];
    const stageChanged = Boolean(prev && prev.stage !== stage);
    const stageEntry = stageChanged
      ? { id: randomUUID().slice(0, 8), date: today(), type: "שינוי שלב", note: `${prev.stage || "ללא שלב"} → ${stage}`, by: user.name || user.email || user.phone || "" }
      : null;
    const stageHistory = stageChanged
      ? [{ stage, at: now, by: user.name || user.email || user.phone || "" }, ...(prev?.stageHistory || [])].slice(0, 100)
      : prev?.stageHistory || (!prev ? [{ stage, at: now, by: user.name || user.email || user.phone || "" }] : []);
    const doc = {
      ...(prev || { log: [], domain }),
      domain,
      name,
      phone: normalizePhone(b.phone),
      branchId,
      avrechId,
      mentor: clean(b.mentor, 80),
      stage,
      stageChangedAt: stageChanged ? now : prev?.stageChangedAt || prev?.startDate || now,
      stageHistory,
      log: stageEntry ? [stageEntry, ...(prev?.log || [])].slice(0, 300) : prev?.log || [],
      status: ["active", "paused", "left"].includes(b.status) ? b.status : "active",
      nextFollowUp: /^\d{4}-\d{2}-\d{2}$/.test(String(b.nextFollowUp || "")) ? b.nextFollowUp : null,
      source: clean(b.source, 120) || prev?.source || "",
      notes: clean(b.notes, 1000),
      startDate: prev?.startDate || today(),
    };
    await store.put("mitchazkim", id, doc);

    if (domain === "kollel" && prev && (prev.avrechId || null) !== (avrechId || null)) {
      const [fromAvrech, toAvrech] = await Promise.all([
        prev.avrechId ? store.get("avrechim", prev.avrechId) : null,
        avrechId ? store.get("avrechim", avrechId) : null,
      ]);
      await store.put("mitchTransfers", randomUUID(), {
        mitchId: id,
        mitchName: name,
        branchId,
        fromAvrechId: prev.avrechId || null,
        fromAvrechName: fromAvrech?.name || "",
        toAvrechId: avrechId || null,
        toAvrechName: toAvrech?.name || "",
        reason: clean(b.transferReason, 300),
        at: now,
        by: user.id,
        byName: user.name || user.email || user.phone || "",
      });
    }

    await audit(user, prev ? "עדכון מתחזק" : "הוספת מתחזק", `${domain === "bnot" ? "בנות צילה" : "כולל"} · ${name}`);
    return send(200, { ok: true, id }), true;
  }

  const logMatch = pathname.match(/^\/api\/mitch\/([\w-]+)\/log$/);
  if (logMatch && method === "POST") {
    const m = await store.get("mitchazkim", logMatch[1]);
    if (!m || !can(m.domain) || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    const b = await readBody(req);
    const entry = {
      id: randomUUID().slice(0, 8),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : today(),
      type: CONTACT_TYPES.includes(b.type) ? b.type : "שיחה",
      note: clean(b.note, 500),
      by: user.name || user.email || user.phone,
    };
    const next = /^\d{4}-\d{2}-\d{2}$/.test(String(b.nextFollowUp || "")) ? b.nextFollowUp : m.nextFollowUp;
    const config = await loadMitchConfig(store, m.domain);
    const stage = config.stages.includes(b.stage) ? b.stage : m.stage;
    const stageChanged = stage !== m.stage;
    const now = new Date().toISOString();
    const stageEntry = stageChanged
      ? { id: randomUUID().slice(0, 8), date: today(), type: "שינוי שלב", note: `${m.stage || "ללא שלב"} → ${stage}`, by: user.name || user.email || user.phone || "" }
      : null;
    const nextLog = [entry, ...(stageEntry ? [stageEntry] : []), ...(m.log || [])].slice(0, 300);
    await store.put("mitchazkim", m.id, {
      ...m,
      log: nextLog,
      lastContact: entry.date,
      nextFollowUp: next,
      stage,
      stageChangedAt: stageChanged ? now : m.stageChangedAt || m.startDate || now,
      stageHistory: stageChanged
        ? [{ stage, at: now, by: user.name || user.email || user.phone || "" }, ...(m.stageHistory || [])].slice(0, 100)
        : m.stageHistory || [],
    });
    return send(200, { ok: true }), true;
  }

  const delMatch = pathname.match(/^\/api\/mitch\/([\w-]+)$/);
  if (delMatch && method === "DELETE") {
    const m = await store.get("mitchazkim", delMatch[1]);
    if (!m || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    if (!isPrivileged(user.roles) && !user.roles.includes("chief_coordinator")) {
      await store.put("mitchazkim", m.id, { ...m, status: "left" });
    } else await store.del("mitchazkim", m.id);
    await audit(user, "הסרת מתחזק", m.name);
    return send(200, { ok: true }), true;
  }

  /* ---------------- אירועי הפרשת חלה */
  if (pathname === "/api/challah" && method === "GET") {
    if (!can("bnot")) return send(403, { error: "אין הרשאה" }), true;
    const rows = (await store.list("challahEvents", 2000)).filter((e) => inScope("bnot", e.branchId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const branches = org.branches.filter((b) => b.domain === "bnot" && inScope("bnot", b.id));
    return send(200, { events: rows, branches, cities: org.cities.filter((c) => c.domain === "bnot") }), true;
  }
  if (pathname === "/api/challah" && method === "POST") {
    if (!can("bnot")) return send(403, { error: "אין הרשאה" }), true;
    const b = await readBody(req, 128 * 1024);
    const branchId = String(b.branchId || "");
    if (!org.branches.some((x) => x.id === branchId && x.domain === "bnot") || !inScope("bnot", branchId)) return send(400, { error: "יש לבחור סניף" }), true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return send(400, { error: "חסר תאריך" }), true;
    const id = b.id ? String(b.id) : randomUUID();
    const prev = await store.get("challahEvents", id);
    if (prev && !inScope("bnot", prev.branchId)) return send(403, { error: "אין הרשאה" }), true;
    const regs = (Array.isArray(b.registrations) ? b.registrations : prev?.registrations || []).slice(0, 500).map((r) => ({
      id: String(r.id || randomUUID().slice(0, 8)),
      name: clean(r.name, 80),
      phone: normalizePhone(r.phone),
      arrived: Boolean(r.arrived),
      at: r.at || new Date().toISOString(),
      mitchId: r.mitchId || null,
    }));
    await store.put("challahEvents", id, {
      title: clean(b.title, 120) || "הפרשת חלה",
      date: b.date,
      time: clean(b.time, 5),
      place: clean(b.place, 160),
      branchId,
      capacity: Math.max(0, Number(b.capacity) || 0),
      notes: clean(b.notes, 1000),
      summary: clean(b.summary, 2000),
      open: b.open !== false,
      registrations: regs,
      reminderSent: prev?.reminderSent || false,
    });
    if (!prev) await audit(user, "אירוע הפרשת חלה חדש", `${b.date} · ${clean(b.title, 60)}`);
    return send(200, { ok: true, id }), true;
  }
  // הוספת המשתתפות שהגיעו לרשימת המתחזקות למעקב
  const toMitch = pathname.match(/^\/api\/challah\/([\w-]+)\/to-mitch$/);
  if (toMitch && method === "POST") {
    const ev = await store.get("challahEvents", toMitch[1]);
    if (!ev || !inScope("bnot", ev.branchId)) return send(404, { error: "לא נמצא" }), true;
    const existing = await store.list("mitchazkim", 20000);
    const bnotConfig = await loadMitchConfig(store, "bnot");
    let added = 0;
    const regs = [];
    for (const r of ev.registrations || []) {
      if (!r.arrived || r.mitchId) {
        regs.push(r);
        continue;
      }
      const same = existing.find((m) => m.domain === "bnot" && r.phone && m.phone === r.phone);
      let mid = same?.id;
      if (!same) {
        mid = randomUUID();
        await store.put("mitchazkim", mid, {
          domain: "bnot", name: r.name, phone: r.phone, branchId: ev.branchId, avrechId: null, mentor: "", stage: bnotConfig.stages[0], stageChangedAt: new Date().toISOString(), status: "active",
          nextFollowUp: null, source: `${ev.title} ${ev.date}`, notes: "", startDate: ev.date,
          log: [{ id: randomUUID().slice(0, 8), date: ev.date, type: "אירוע", note: ev.title, by: user.name || user.email || "" }], lastContact: ev.date,
        });
        added++;
      }
      regs.push({ ...r, mitchId: mid });
    }
    await store.put("challahEvents", ev.id, { ...ev, registrations: regs });
    await audit(user, "העברת משתתפות למעקב", `${ev.title} · ${added}`);
    return send(200, { ok: true, added }), true;
  }
  const evDel = pathname.match(/^\/api\/challah\/([\w-]+)$/);
  if (evDel && method === "DELETE") {
    const ev = await store.get("challahEvents", evDel[1]);
    if (!ev || !inScope("bnot", ev.branchId)) return send(404, { error: "לא נמצא" }), true;
    await store.del("challahEvents", ev.id);
    await audit(user, "מחיקת אירוע הפרשת חלה", ev.title);
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}

/** הרשמה ציבורית לאירוע (מהאתר / מקישור בוואטסאפ) */
export async function publicChallah(req, res, url, { store, json, readBody, clean, rateLimited, clientIp, notify }) {
  const m = url.pathname.match(/^\/api\/public\/challah\/([\w-]+)$/);
  if (!m) return false;
  const ev = await store.get("challahEvents", m[1]);
  if (!ev || !ev.open) return json(res, 404, { error: "האירוע לא נמצא או שההרשמה נסגרה" }), true;
  const org = await loadOrg(store);
  const branch = org.branches.find((b) => b.id === ev.branchId);
  const city = org.cities.find((c) => c.id === branch?.parentId);
  const count = (ev.registrations || []).length;
  const full = ev.capacity > 0 && count >= ev.capacity;
  if (req.method === "GET") {
    return json(res, 200, { title: ev.title, date: ev.date, time: ev.time, place: ev.place, branch: branch?.name || "", city: city?.name || "", full }), true;
  }
  if (req.method === "POST") {
    if (rateLimited(`chreg:${clientIp(req)}`, 10, 10 * 60_000)) return json(res, 429, { error: "יותר מדי ניסיונות" }), true;
    if (full) return json(res, 400, { error: "האירוע מלא" }), true;
    const b = await readBody(req, 8 * 1024);
    const name = clean(b.name, 80).trim();
    const phone = normalizePhone(b.phone);
    if (!name || !validPhone(phone)) return json(res, 400, { error: "יש למלא שם וטלפון תקין" }), true;
    if (b.website) return json(res, 200, { ok: true }), true; // מלכודת
    const regs = ev.registrations || [];
    if (!regs.some((r) => r.phone === phone)) regs.push({ id: randomUUID().slice(0, 8), name, phone, arrived: false, at: new Date().toISOString(), mitchId: null });
    await store.put("challahEvents", ev.id, { ...ev, registrations: regs });
    notify?.((u) => u.views.includes("bnot"), { title: "נרשמה להפרשת חלה", body: `${name} · ${ev.title}`, url: "/admin?v=bnot&t=challah" });
    return json(res, 200, { ok: true }), true;
  }
  return false;
}

/** עדכון אישי של מתחזק/ת דרך קישור אישי מוואטסאפ. אין כניסה למערכת ואין הקלטות - רק טקסט ותמונות. */
export async function publicMitchShare(req, res, url, { store, json, readBody, clean, rateLimited, clientIp, notify }) {
  if (url.pathname !== "/api/public/mitch-share") return false;
  const method = req.method || "GET";
  let token = url.searchParams.get("t") || "";
  let body = null;
  if (method === "POST") {
    body = await readBody(req, 6 * 1024 * 1024);
    token = String(body?.token || "");
  }
  if (token.length < 30 || token.length > 100) return json(res, 404, { error: "הקישור אינו תקין" }), true;
  const hash = tokenHash(token);
  const access = await store.get("mitchAccess", hash);
  if (!access || access.active === false || (access.expiresAt && Date.now() > new Date(access.expiresAt).getTime())) {
    return json(res, 404, { error: "הקישור אינו פעיל. יש לבקש קישור חדש מהרכז/ת." }), true;
  }
  const m = await store.get("mitchazkim", access.mitchId);
  if (!m || m.status === "left") return json(res, 404, { error: "הקישור אינו פעיל" }), true;
  const org = await loadOrg(store);
  const branch = org.branches.find((b) => b.id === m.branchId);
  const city = org.cities.find((c) => c.id === branch?.parentId);

  if (method === "GET") {
    const pending = (await store.list("mitchUpdates", 2000)).filter((u) => u.mitchId === m.id && u.status === "pending").length;
    return json(res, 200, {
      name: m.name,
      domain: m.domain,
      branch: branch?.name || "",
      city: city?.name || "",
      pending,
    }), true;
  }

  if (method === "POST") {
    if (rateLimited(`mshare:${hash}:${clientIp(req)}`, 8, 30 * 60_000)) return json(res, 429, { error: "נשלחו יותר מדי עדכונים. נסו שוב מאוחר יותר." }), true;
    const text = clean(body?.text, 4000).trim();
    const rawPhotos = Array.isArray(body?.photos) ? body.photos.slice(0, 4) : [];
    const photos = [];
    let total = 0;
    for (const p of rawPhotos) {
      const value = String(p || "");
      if (!imageDataOk(value)) return json(res, 400, { error: "ניתן לצרף תמונות JPG, PNG או WebP בלבד" }), true;
      const approx = Math.ceil(value.length * 0.75);
      if (approx > 1_100_000) return json(res, 400, { error: "אחת התמונות גדולה מדי" }), true;
      total += approx;
      photos.push(value);
    }
    if (total > 4_000_000) return json(res, 400, { error: "סך התמונות גדול מדי" }), true;
    if (!text && !photos.length) return json(res, 400, { error: "יש לכתוב עדכון או לצרף תמונה" }), true;

    const id = randomUUID();
    const submittedAt = new Date().toISOString();
    await store.put("mitchUpdates", id, {
      mitchId: m.id,
      mitchName: m.name,
      domain: m.domain,
      branchId: m.branchId,
      text,
      rawText: text,
      cleanText: null,
      aiStatus: "not_processed",
      photos,
      status: "pending",
      submittedAt,
    });

    notify?.((u) => {
      if (!u.views.includes(m.domain === "kollel" ? "kollel" : "bnot")) return false;
      const scope = branchScope(u, org, m.domain);
      return scope === null || scope.has(m.branchId);
    }, {
      title: `עדכון חדש מ${m.name}`,
      body: text ? text.slice(0, 90) : `${photos.length} תמונות ממתינות לאישור`,
      url: m.domain === "bnot" ? `/admin?v=bnot&t=mitch:q:${encodeURIComponent(m.name)}` : `/admin?v=kollel&t=mitch:q:${encodeURIComponent(m.name)}`,
    });
    return json(res, 201, { ok: true, message: "העדכון נשלח לרכז/ת לאישור" }), true;
  }

  return json(res, 405, { error: "פעולה לא נתמכת" }), true;
}

/** תזכורת יום לפני לנרשמות (נקרא מהשרת כל דקה; שולח פעם אחת בשעה 18:00) */
export async function challahReminders(store, sendSms) {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(new Date());
  if (hour !== "18") return;
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86400_000));
  for (const ev of await store.list("challahEvents", 2000)) {
    if (ev.date !== tomorrow || ev.reminderSent) continue;
    const phones = (ev.registrations || []).filter((r) => validPhone(r.phone)).map((r) => ({ name: r.name, phone: r.phone }));
    await store.put("challahEvents", ev.id, { ...ev, reminderSent: true });
    if (!phones.length) continue;
    const text = `תזכורת: מחר ${ev.title}${ev.time ? ` בשעה ${ev.time}` : ""}${ev.place ? ` ב${ev.place}` : ""}. מחכות לך!`;
    await sendSms(text, phones).catch(() => undefined);
  }
}
