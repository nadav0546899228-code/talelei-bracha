/**
 * כולל ערב: אברכים לפי ערים וסניפים, נסיעות והוצאות, חודשי משכורת.
 * מנהל סניף - רואה ומדווח רק לאברכי הסניף שלו (נסיעות והוצאות). הדיווח שלו הוא גם האישור.
 * רכז עיר - כמו מנהל סניף לכל סניפי העיר, ובנוסף מוסיף ומעדכן אברכים בעיר שלו.
 * רכז ראשי / מנכ״ל / מתכנת - רואים הכל ומנהלים את המשכורות.
 */
import { randomUUID } from "node:crypto";
import { isKollelManager, isPrivileged } from "./roles.mjs";
import { normalizePhone } from "./phoneAuth.mjs";
import { branchScope, loadOrg } from "./org.mjs";

const SUB_TYPES = ["travel", "expense"];
const ALL_TYPES = ["travel", "expense", "bonus", "grant", "deduction"];

export const DEFAULT_SETTINGS = {
  fullBase: 1500,
  simchaRates: { bat: 10, ben: 30, barmitzva: 50 },
  absenceRate: 0, // הורדה ליום היעדרות - 0 = בלי הורדה
};

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : d;
};

export async function handleKollel(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/kollel/")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";

  if (!user.views.includes("kollel") && !user.views.includes("payroll")) return send(403, { error: "אין הרשאה" }), true;
  const manager = isKollelManager(user.roles);
  const org = await loadOrg(store);
  const scope = branchScope(user, org, "kollel"); // null = הכל
  const legacySub = user.kind === "phone" ? user.subId : null; // תאימות לגרסה קודמת
  const inScope = (a) => manager || scope === null || (a.branchId && scope.has(a.branchId)) || (legacySub && a.subId === legacySub);
  const canEditAvrechim = manager || user.roles.includes("kollel_city");
  const myBranches = org.branches.filter((b) => b.domain === "kollel" && (scope === null || scope.has(b.id)));
  const myCities = org.cities.filter((c) => c.domain === "kollel" && (scope === null || myBranches.some((b) => b.parentId === c.id)));

  const allAvrechim = async () => (await store.list("avrechim")).sort((a, b) => String(a.name).localeCompare(String(b.name), "he"));
  const myAvrechim = async () => (await allAvrechim()).filter(inScope);
  const settings = async () => ({ ...DEFAULT_SETTINGS, ...((await store.get("kollelSettings", "main")) || {}) });
  const monthDoc = async (key) => (await store.get("kollelMonths", key)) || null;

  // ---- סקירה
  if (pathname === "/api/kollel/overview" && method === "GET") {
    const months = (await store.list("kollelMonths")).map((m) => ({ id: m.id, label: m.label, locked: Boolean(m.locked), order: m.order || 0 }));
    const avs = await myAvrechim();
    return (
      send(200, {
        me: { manager, canEditAvrechim, canPayroll: user.views.includes("payroll") },
        avrechim: canEditAvrechim ? avs : avs.map(({ notes: _n, ...a }) => a),
        cities: myCities,
        branches: myBranches,
        settings: await settings(),
        months: months.sort((a, b) => b.order - a.order),
      }),
      true
    );
  }

  // ---- אברכים (רכז ראשי ומעלה - הכל; רכז עיר - בעיר שלו)
  if (pathname === "/api/kollel/avrechim" && method === "POST") {
    if (!canEditAvrechim) return send(403, { error: "הוספה ועדכון אברכים - רכז עיר ומעלה" }), true;
    const b = await readBody(req);
    const id = b.id ? String(b.id) : randomUUID();
    const prev = (await store.get("avrechim", id)) || {};
    if (prev.name && !inScope(prev)) return send(403, { error: "האברך אינו בעיר שלך" }), true;
    const name = clean(b.name, 80).trim();
    if (!name) return send(400, { error: "חסר שם" }), true;
    const branchId = b.branchId ? String(b.branchId) : null;
    if (branchId && !myBranches.some((x) => x.id === branchId)) return send(400, { error: "סניף לא תקין" }), true;
    if (!manager && !branchId) return send(400, { error: "יש לבחור סניף" }), true;
    // רכז עיר לא משנה הגדרות שכר
    const pay = manager
      ? {
          monthlyTravel: num(b.monthlyTravel),
          inPayroll: b.inPayroll !== false,
          simchaFund: b.simchaFund !== false,
          simchaExternal: Boolean(b.simchaExternal),
        }
      : {
          monthlyTravel: prev.monthlyTravel ?? 0,
          inPayroll: prev.inPayroll ?? true,
          simchaFund: prev.simchaFund ?? true,
          simchaExternal: prev.simchaExternal ?? false,
        };
    const doc = {
      ...prev,
      name,
      phone: normalizePhone(b.phone),
      email: clean(b.email, 120).trim(),
      branchId,
      subId: branchId ? null : prev.subId || null,
      ...pay,
      active: b.active !== false,
      notes: clean(b.notes, 500),
    };
    await store.put("avrechim", id, doc);
    await audit(user, prev.name ? "עדכון אברך" : "הוספת אברך", name);
    return send(200, { ok: true, id }), true;
  }

  if (pathname === "/api/kollel/avrechim/bulk" && method === "POST") {
    if (!manager) return send(403, { error: "אין הרשאה" }), true;
    const { rows } = await readBody(req, 256 * 1024);
    if (!Array.isArray(rows) || rows.length > 500) return send(400, { error: "נתונים לא תקינים" }), true;
    const existing = await allAvrechim();
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const name = clean(r.name, 80).trim();
      if (!name) continue;
      const found = existing.find((a) => a.name === name);
      const bn = String(r.branchName || r.subName || "").trim();
      const branch = bn ? myBranches.find((x) => x.name === bn) : null;
      const doc = {
        ...(found || { inPayroll: true, simchaFund: true, simchaExternal: false, active: true, notes: "" }),
        name,
        phone: r.phone ? normalizePhone(r.phone) : found?.phone || "",
        monthlyTravel: r.monthlyTravel !== undefined && r.monthlyTravel !== "" ? num(r.monthlyTravel) : found?.monthlyTravel || 0,
        branchId: branch ? branch.id : found?.branchId || null,
      };
      await store.put("avrechim", found?.id || randomUUID(), doc);
      found ? updated++ : added++;
    }
    await audit(user, "ייבוא אברכים", `${added} חדשים, ${updated} עודכנו`);
    return send(200, { ok: true, added, updated }), true;
  }

  const avMatch = pathname.match(/^\/api\/kollel\/avrechim\/([\w-]+)$/);
  if (avMatch && method === "DELETE") {
    if (!canEditAvrechim) return send(403, { error: "אין הרשאה" }), true;
    const doc = await store.get("avrechim", avMatch[1]);
    if (!doc || !inScope(doc)) return send(404, { error: "לא נמצא" }), true;
    // לא מוחקים - מעבירים ללא פעיל כדי לשמור היסטוריית משכורות
    await store.put("avrechim", doc.id, { ...doc, active: false, inPayroll: false });
    await audit(user, "העברת אברך ללא פעיל", doc.name);
    return send(200, { ok: true }), true;
  }

  // ---- נסיעות, הוצאות ותוספות
  if (pathname === "/api/kollel/entries" && method === "GET") {
    const month = url.searchParams.get("month");
    const all = url.searchParams.get("all") === "1";
    if (all && !manager) return send(403, { error: "אין הרשאה" }), true;
    const mine = new Set((await myAvrechim()).map((a) => a.id));
    const rows = (await store.list("kollelEntries")).filter((e) => (all || e.month === month) && (manager || mine.has(e.avrechId)));
    return send(200, { entries: rows }), true;
  }

  if (pathname === "/api/kollel/entries" && method === "POST") {
    const b = await readBody(req);
    const month = clean(b.month, 40);
    const type = String(b.type);
    if (!(manager ? ALL_TYPES : SUB_TYPES).includes(type)) return send(403, { error: "סוג דיווח לא מורשה" }), true;
    const av = await store.get("avrechim", String(b.avrechId));
    if (!av || !inScope(av)) return send(403, { error: "האברך אינו בסניף שלך" }), true;
    const m = await monthDoc(month);
    if (!m) return send(400, { error: "החודש לא נפתח עדיין. הרכז הראשי פותח חודש במסך המשכורות." }), true;
    if (m.locked) return send(400, { error: "החודש נסגר לתשלום - לא ניתן לשנות" }), true;
    const amount = num(b.amount);
    if (!amount) return send(400, { error: "חסר סכום" }), true;
    const id = randomUUID();
    await store.put("kollelEntries", id, {
      avrechId: av.id,
      month,
      type,
      amount: type === "deduction" ? -Math.abs(amount) : amount,
      description: clean(b.description, 200),
      by: user.id,
      byName: user.name || user.email || user.phone,
      approvedBy: user.id, // הדיווח של הרכז הוא גם האישור
    });
    await audit(user, "דיווח בכולל", `${av.name} · ${type} · ${amount}`);
    return send(200, { ok: true, id }), true;
  }

  const enMatch = pathname.match(/^\/api\/kollel\/entries\/([\w-]+)$/);
  if (enMatch && method === "DELETE") {
    const e = await store.get("kollelEntries", enMatch[1]);
    if (!e) return send(404, { error: "לא נמצא" }), true;
    if (!manager && e.by !== user.id) return send(403, { error: "אפשר למחוק רק דיווח שלך" }), true;
    const m = await monthDoc(e.month);
    if (m?.locked) return send(400, { error: "החודש נסגר לתשלום" }), true;
    await store.del("kollelEntries", e.id);
    await audit(user, "מחיקת דיווח בכולל", `${e.type} · ${e.amount}`);
    return send(200, { ok: true }), true;
  }

  // ---- נוכחות: מפגש = סניף + תאריך. רשומת הנוכחות שייכת לחודש המשכורת הפתוח
  if (pathname === "/api/kollel/attendance" && method === "GET") {
    const month = url.searchParams.get("month");
    const ids = new Set(myBranches.map((b) => b.id));
    const rows = (await store.list("kollelAttendance")).filter((x) => (!month || x.month === month) && (manager || ids.has(x.branchId)));
    return send(200, { sessions: rows }), true;
  }
  if (pathname === "/api/kollel/attendance" && method === "PUT") {
    const b = await readBody(req, 64 * 1024);
    const branchId = String(b.branchId || "");
    if (!myBranches.some((x) => x.id === branchId)) return send(403, { error: "הסניף אינו באחריותך" }), true;
    const date = String(b.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(400, { error: "תאריך לא תקין" }), true;
    const month = clean(b.month, 40);
    const m = await monthDoc(month);
    if (!m) return send(400, { error: "החודש לא נפתח עדיין" }), true;
    if (m.locked) return send(400, { error: "החודש נסגר לתשלום" }), true;
    const inBranch = new Set((await allAvrechim()).filter((a) => a.branchId === branchId).map((a) => a.id));
    const present = (Array.isArray(b.present) ? b.present : []).map(String).filter((id) => inBranch.has(id));
    const id = `${branchId}_${date}`;
    const prev = await store.get("kollelAttendance", id);
    if (prev && prev.month !== month) {
      const pm = await monthDoc(prev.month);
      if (pm?.locked) return send(400, { error: "המפגש שייך לחודש סגור" }), true;
    }
    await store.put("kollelAttendance", id, { branchId, date, month, present, by: user.id, byName: user.name || user.email || user.phone });
    if (!prev) await audit(user, "פתיחת מפגש נוכחות", `${date} · ${myBranches.find((x) => x.id === branchId)?.name || ""}`);
    return send(200, { ok: true, id }), true;
  }
  const atMatch = pathname.match(/^\/api\/kollel\/attendance\/([\w-]+)$/);
  if (atMatch && method === "DELETE") {
    const doc = await store.get("kollelAttendance", atMatch[1]);
    if (!doc || !myBranches.some((x) => x.id === doc.branchId)) return send(404, { error: "לא נמצא" }), true;
    if ((await monthDoc(doc.month))?.locked) return send(400, { error: "החודש נסגר לתשלום" }), true;
    await store.del("kollelAttendance", doc.id);
    await audit(user, "מחיקת מפגש נוכחות", doc.date);
    return send(200, { ok: true }), true;
  }

  // ---- חודשי משכורת (מנהל בלבד)
  const moMatch = pathname.match(/^\/api\/kollel\/months\/(.+)$/);
  if (moMatch) {
    if (!manager || !user.views.includes("payroll")) return send(403, { error: "אין הרשאה" }), true;
    const key = decodeURIComponent(moMatch[1]).slice(0, 40);
    if (method === "GET") return send(200, { month: await monthDoc(key) }), true;
    if (method === "PUT") {
      const b = await readBody(req, 256 * 1024);
      const prev = await monthDoc(key);
      if (prev?.locked && b.locked !== false) return send(400, { error: "החודש סגור. יש לפתוח אותו לפני שינוי." }), true;
      if (prev?.locked && b.locked === false && !isPrivileged(user.roles)) return send(403, { error: "פתיחת חודש סגור - מנכ״ל או מתכנת בלבד" }), true;
      const rows = {};
      for (const [id, r] of Object.entries(b.rows || {})) {
        rows[id] = {
          base: r.base === null || r.base === "" || r.base === undefined ? null : num(r.base),
          travel: r.travel === null || r.travel === "" || r.travel === undefined ? null : num(r.travel),
          confirmed: Boolean(r.confirmed),
          note: clean(r.note, 200),
        };
      }
      const doc = {
        label: clean(b.label || prev?.label || key, 40),
        order: num(b.order ?? prev?.order ?? Date.now()),
        rows,
        extraIds: (Array.isArray(b.extraIds) ? b.extraIds : []).map(String).slice(0, 100),
        simchas: (Array.isArray(b.simchas) ? b.simchas : []).slice(0, 50).map((s) => ({
          id: String(s.id || randomUUID()),
          celebrantId: String(s.celebrantId),
          type: ["bat", "ben", "barmitzva"].includes(s.type) ? s.type : "bat",
          note: clean(s.note, 80),
        })),
        locked: Boolean(b.locked),
        notes: clean(b.notes, 1000),
      };
      await store.put("kollelMonths", key, doc);
      await audit(user, prev ? (doc.locked && !prev.locked ? "סגירת חודש לתשלום" : !doc.locked && prev.locked ? "פתיחת חודש סגור" : "עדכון חודש משכורת") : "פתיחת חודש משכורת", doc.label);
      return send(200, { ok: true }), true;
    }
  }

  if (pathname === "/api/kollel/settings" && method === "PUT") {
    if (!manager) return send(403, { error: "אין הרשאה" }), true;
    const b = await readBody(req);
    const doc = {
      fullBase: num(b.fullBase, DEFAULT_SETTINGS.fullBase),
      simchaRates: {
        bat: num(b.simchaRates?.bat, 10),
        ben: num(b.simchaRates?.ben, 30),
        barmitzva: num(b.simchaRates?.barmitzva, 50),
      },
      absenceRate: Math.max(0, num(b.absenceRate, 0)),
    };
    await store.put("kollelSettings", "main", doc);
    await audit(user, "עדכון הגדרות כולל", JSON.stringify(doc));
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}
