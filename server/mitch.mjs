/**
 * מתחזקים ומתחזקות + אירועי הפרשת חלה.
 * בנים: כל מתחזק משויך לאברך (חברותא בכולל הערב). הנוכחות שלו נרשמת במפגש הערב יחד עם האברך.
 * בנות: הפרשת חלה עם הרשמה ← משתתפת הופכת למתחזקת ← קשר מתמשך (יומן קשר + מעקב הבא).
 */
import { randomUUID } from "node:crypto";
import { isPrivileged } from "./roles.mjs";
import { branchScope, loadOrg } from "./org.mjs";
import { normalizePhone, validPhone } from "./phoneAuth.mjs";

export const STAGES = {
  kollel: ["היכרות", "לומד בחברותא", "לומד בקביעות", "מתקדם", "שומר תו״מ"],
  bnot: ["השתתפה בהפרשת חלה", "בקשר", "משתתפת בפעילות", "בקשר קבוע", "שומרת תו״מ"],
};
const CONTACT_TYPES = ["שיחה", "פגישה", "הודעה", "שיעור", "אירוע"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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

  /* ---------------- מתחזקים / מתחזקות */
  if (pathname === "/api/mitch" && method === "GET") {
    const domain = url.searchParams.get("domain") === "bnot" ? "bnot" : "kollel";
    if (!can(domain)) return send(403, { error: "אין הרשאה" }), true;
    const rows = (await store.list("mitchazkim", 20000)).filter((m) => m.domain === domain && inScope(domain, m.branchId));
    const branches = org.branches.filter((b) => b.domain === domain && inScope(domain, b.id));
    const cities = org.cities.filter((c) => c.domain === domain && branches.some((b) => b.parentId === c.id));
    let avrechim = [];
    if (domain === "kollel") avrechim = (await store.list("avrechim", 20000)).filter((a) => a.active !== false && inScope("kollel", a.branchId)).map((a) => ({ id: a.id, name: a.name, branchId: a.branchId }));
    return send(200, { mitch: rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "he")), branches, cities, avrechim, stages: STAGES[domain], contactTypes: CONTACT_TYPES, today: today() }), true;
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
    let avrechId = null;
    if (domain === "kollel" && b.avrechId) {
      const av = await store.get("avrechim", String(b.avrechId));
      if (av && av.branchId === branchId) avrechId = av.id;
    }
    const doc = {
      ...(prev || { log: [], domain }),
      domain,
      name,
      phone: normalizePhone(b.phone),
      branchId,
      avrechId,
      mentor: clean(b.mentor, 80),
      stage: STAGES[domain].includes(b.stage) ? b.stage : prev?.stage || STAGES[domain][0],
      status: ["active", "paused", "left"].includes(b.status) ? b.status : "active",
      nextFollowUp: /^\d{4}-\d{2}-\d{2}$/.test(String(b.nextFollowUp || "")) ? b.nextFollowUp : null,
      source: clean(b.source, 120) || prev?.source || "",
      notes: clean(b.notes, 1000),
      startDate: prev?.startDate || today(),
    };
    await store.put("mitchazkim", id, doc);
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
    await store.put("mitchazkim", m.id, { ...m, log: [entry, ...(m.log || [])].slice(0, 300), lastContact: entry.date, nextFollowUp: next, stage: STAGES[m.domain].includes(b.stage) ? b.stage : m.stage });
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
          domain: "bnot", name: r.name, phone: r.phone, branchId: ev.branchId, avrechId: null, mentor: "", stage: STAGES.bnot[0], status: "active",
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
