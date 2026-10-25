/**
 * הודעות ותפוצה: הודעה קולית מוקראת / מוקלטת, צינתוק, SMS (דרך ימות המשיח),
 * ובנוסף וואטסאפ ומייל (נשלחים מהמכשיר של השולח). כל תפוצה נרשמת בהיסטוריה וביומן.
 * הנמענים נקבעים בשרת לפי הרשאות - רכז עיר / מנהל סניף שולחים רק לאברכים ולרכזים שבאחריותם.
 */
import { randomUUID } from "node:crypto";
import { isKollelManager, isPrivileged, normalizeRoles } from "./roles.mjs";
import { DOMAINS, branchScope, loadOrg } from "./org.mjs";
import { normalizePhone, validPhone } from "./phoneAuth.mjs";
import * as yemot from "./yemot.mjs";

const CHANNELS = {
  voice_tts: "הודעה קולית מוקראת",
  voice_template: "הודעה קולית מוקלטת (תבנית בימות)",
  tzintuk: "צינתוק",
  sms: "SMS",
  whatsapp: "וואטסאפ",
  email: "מייל",
};

async function availableGroups(user, store) {
  const r = user.roles;
  const groups = [];
  const priv = isPrivileged(r);
  const kollelMgr = isKollelManager(r);
  const org = await loadOrg(store);
  const avrechim = (await store.list("avrechim")).filter((a) => a.active !== false);
  const people = [
    ...(await store.list("phoneUsers")).filter((u) => u.active !== false).map((u) => ({ ...u, roles: normalizeRoles(u.roles) })),
    ...(await store.list("users")).filter((u) => u.active !== false && u.phone).map((u) => ({ ...u, roles: normalizeRoles(u.roles) })),
  ];
  const cityName = (id) => org.cities.find((c) => c.id === id)?.name || "";

  for (const domain of ["kollel", "bnot"]) {
    const scope = branchScope(user, org, domain);
    const dLabel = DOMAINS[domain];
    const inScope = (bid) => scope === null || scope.has(bid);
    const hasDomainRole = scope === null ? kollelMgr || r.includes("chief_coordinator") : scope.size > 0;
    if (!hasDomainRole) continue;
    const branchesHere = org.branches.filter((b) => b.domain === domain && inScope(b.id));
    if (domain === "kollel") {
      if (scope === null) groups.push({ id: "avrechim", label: "כל אברכי הכולל", members: avrechim });
      const citiesHere = org.cities.filter((c) => c.domain === domain && branchesHere.some((b) => b.parentId === c.id));
      if (scope === null || r.includes(`${domain}_city`)) {
        for (const c of citiesHere) {
          const ids = new Set(branchesHere.filter((b) => b.parentId === c.id).map((b) => b.id));
          groups.push({ id: `avrechim:city:${c.id}`, label: `אברכי ${c.name}`, members: avrechim.filter((a) => ids.has(a.branchId)) });
        }
      }
      for (const b of branchesHere) {
        groups.push({ id: `avrechim:branch:${b.id}`, label: `אברכי סניף ${b.name} (${cityName(b.parentId)})`, members: avrechim.filter((a) => a.branchId === b.id) });
      }
    }
    // רכזים ומנהלי סניפים
    const branchMgrs = people.filter((p) => p.roles.includes(`${domain}_branch`) && inScope(p.scope?.[domain]?.branchId));
    if (branchMgrs.length) groups.push({ id: `staff:${domain}:branch`, label: `מנהלי הסניפים - ${dLabel}`, members: branchMgrs });
    if (scope === null) {
      const cityCoords = people.filter((p) => p.roles.includes(`${domain}_city`));
      if (cityCoords.length) groups.push({ id: `staff:${domain}:city`, label: `רכזי הערים - ${dLabel}`, members: cityCoords });
    }
  }
  if (priv || r.includes("chief_coordinator")) {
    const all = people.filter((p) => p.roles.some((x) => /_(city|branch)$/.test(x) || x === "chief_coordinator"));
    if (all.length) groups.push({ id: "staff:all", label: "כל הרכזים ומנהלי הסניפים", members: all });
  }
  if (priv || r.includes("isha_coordinator")) {
    const mentors = (await store.list("submissions")).filter((s) => s.form === "ishaMentor" && s.status === "approved");
    groups.push({ id: "mentors", label: "מלוות מאושרות - אישה לאישה", members: mentors.map((m) => ({ name: m.data.fullName || m.data.name, phone: m.data.phone })) });
  }
  if (priv || r.includes("office")) {
    const upd = (await store.list("submissions")).filter((s) => s.form === "updates" && s.status !== "archived");
    groups.push({ id: "updates", label: "נרשמות לעדכוני בנות צילה", members: upd.map((s) => ({ name: s.data.name, phone: s.data.phone })) });
    const contacts = (await store.list("contacts")).filter((c) => c.active !== false);
    groups.push({ id: "contacts", label: "כל אנשי הקשר", members: contacts });
    const tags = Array.from(new Set(contacts.flatMap((c) => c.tags || [])));
    for (const t of tags) groups.push({ id: `contacts:${t}`, label: `אנשי קשר - ${t}`, members: contacts.filter((c) => (c.tags || []).includes(t)) });
  }
  return groups.map((g) => ({
    ...g,
    members: g.members
      .map((m) => ({ name: String(m.name || ""), phone: normalizePhone(m.phone), email: String(m.email || "") }))
      .filter((m) => m.phone || m.email),
  }));
}

function resolveRecipients(groups, ids, manual, allowManual) {
  const map = new Map();
  for (const g of groups) if (ids.includes(g.id)) for (const m of g.members) map.set(m.phone || m.email, m);
  if (allowManual) {
    for (const p of String(manual || "").split(/[\s,;:]+/)) {
      const n = normalizePhone(p);
      if (validPhone(n) && !map.has(n)) map.set(n, { name: "", phone: n, email: "" });
    }
  }
  return Array.from(map.values());
}

const personalize = (text, r) => String(text).replace(/\{שם\}/g, r.name || "").replace(/\s{2,}/g, " ").trim();

export async function handleBroadcast(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/broadcast/")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";
  if (!user.views.includes("broadcast")) return send(403, { error: "אין הרשאה" }), true;
  const priv = isPrivileged(user.roles);
  const canContacts = priv || user.roles.includes("office");
  const allowManual = priv || isKollelManager(user.roles) || user.roles.includes("office");

  if (pathname === "/api/broadcast/setup" && method === "GET") {
    const groups = await availableGroups(user, store);
    const settings = (await store.get("settings", "broadcast")) || {};
    let units = null;
    if (yemot.yemotConfigured()) {
      try {
        const s = await yemot.getSession();
        units = s.units ?? s.customerUnits ?? null;
      } catch {
        units = null;
      }
    }
    return (
      send(200, {
        channels: CHANNELS,
        yemotConfigured: yemot.yemotConfigured(),
        units,
        settings: { templateId: settings.templateId || "", callerId: settings.callerId || "", smsFrom: settings.smsFrom || "" },
        canEditSettings: priv,
        canContacts,
        allowManual,
        groups: groups.map((g) => ({ id: g.id, label: g.label, count: g.members.length, phones: g.members.filter((m) => m.phone).length, emails: g.members.filter((m) => m.email).length })),
      }),
      true
    );
  }

  if (pathname === "/api/broadcast/settings" && method === "PUT") {
    if (!priv) return send(403, { error: "אין הרשאה" }), true;
    const b = await readBody(req);
    await store.put("settings", "broadcast", { templateId: clean(b.templateId, 20), callerId: normalizePhone(b.callerId), smsFrom: clean(b.smsFrom, 20) });
    await audit(user, "עדכון הגדרות ימות המשיח");
    return send(200, { ok: true }), true;
  }

  if (pathname === "/api/broadcast/templates" && method === "GET") {
    if (!priv) return send(403, { error: "אין הרשאה" }), true;
    try {
      const t = await yemot.getTemplates();
      return send(200, { templates: (t.templates || []).map((x) => ({ templateId: x.templateId, description: x.description })) }), true;
    } catch (e) {
      return send(400, { error: e.message }), true;
    }
  }

  if (pathname === "/api/broadcast/preview" && method === "POST") {
    const b = await readBody(req);
    const groups = await availableGroups(user, store);
    const recipients = resolveRecipients(groups, Array.isArray(b.groups) ? b.groups : [], b.manual, allowManual);
    return send(200, { recipients }), true;
  }

  if (pathname === "/api/broadcast/send" && method === "POST") {
    const b = await readBody(req, 128 * 1024);
    const channel = String(b.channel);
    if (!CHANNELS[channel]) return send(400, { error: "ערוץ לא מוכר" }), true;
    const groups = await availableGroups(user, store);
    let recipients = resolveRecipients(groups, Array.isArray(b.groups) ? b.groups : [], b.manual, allowManual);
    if (b.testPhone) {
      const t = normalizePhone(b.testPhone);
      if (!validPhone(t)) return send(400, { error: "מספר בדיקה לא תקין" }), true;
      recipients = [{ name: user.name || "", phone: t, email: "" }];
    }
    const text = clean(b.text, 1000).trim();
    const settings = (await store.get("settings", "broadcast")) || {};
    const templateId = clean(b.templateId || settings.templateId, 20);
    const id = randomUUID();
    const log = {
      channel,
      channelLabel: CHANNELS[channel],
      text,
      groups: (b.groups || []).map((g) => groups.find((x) => x.id === g)?.label || g),
      count: recipients.length,
      test: Boolean(b.testPhone),
      by: user.id,
      byName: user.name || user.email || user.phone,
      status: "sent",
      result: null,
    };

    // וואטסאפ ומייל נשלחים מהמכשיר - כאן רק נרשמים
    if (channel === "whatsapp" || channel === "email") {
      await store.put("broadcasts", id, { ...log, status: "device" });
      await audit(user, `תפוצה: ${CHANNELS[channel]}`, `${recipients.length} נמענים`);
      return send(200, { ok: true, id, recipients }), true;
    }

    const phones = recipients.filter((r) => validPhone(r.phone));
    if (!phones.length) return send(400, { error: "אין נמענים עם מספר טלפון תקין" }), true;
    if (phones.length > 5000) return send(400, { error: "יותר מדי נמענים בשליחה אחת" }), true;
    if ((channel === "voice_tts" || channel === "sms") && !text) return send(400, { error: "חסר נוסח הודעה" }), true;
    if ((channel === "voice_tts" || channel === "voice_template") && !templateId) {
      return send(400, { error: "חסר מזהה תבנית בימות המשיח (הגדרות ← תבנית קמפיין)" }), true;
    }

    try {
      let result;
      if (channel === "voice_tts") {
        result = await yemot.runCampaign({ templateId, callerId: settings.callerId, recipients: phones, mode: "tts", textFor: (r) => personalize(text, r) });
      } else if (channel === "voice_template") {
        result = await yemot.runCampaign({ templateId, callerId: settings.callerId, recipients: phones, mode: "template" });
      } else if (channel === "tzintuk") {
        result = await yemot.runTzintuk({ callerId: settings.callerId, recipients: phones });
      } else {
        // SMS: אם יש {שם} - שליחה אישית לכל נמען, אחרת שליחה אחת
        if (text.includes("{שם}")) {
          const results = [];
          for (const r of phones.slice(0, 500)) results.push(await yemot.sendSms({ from: settings.smsFrom, message: personalize(text, r), recipients: [r] }));
          result = { personalized: results.length };
        } else {
          result = await yemot.sendSms({ from: settings.smsFrom, message: text, recipients: phones });
        }
      }
      await store.put("broadcasts", id, { ...log, count: phones.length, result, campaignId: result?.campaignId || null });
      await audit(user, `תפוצה: ${CHANNELS[channel]}${log.test ? " (בדיקה)" : ""}`, `${phones.length} נמענים`);
      return send(200, { ok: true, id, result }), true;
    } catch (e) {
      await store.put("broadcasts", id, { ...log, status: "error", result: { error: e.message } });
      await audit(user, `תפוצה נכשלה: ${CHANNELS[channel]}`, e.message);
      return send(400, { error: e.message }), true;
    }
  }

  if (pathname === "/api/broadcast/history" && method === "GET") {
    const rows = (await store.list("broadcasts", 300)).filter((b) => priv || b.by === user.id);
    return send(200, { broadcasts: rows }), true;
  }

  const stMatch = pathname.match(/^\/api\/broadcast\/status\/([\w-]+)$/);
  if (stMatch && method === "GET") {
    const b = await store.get("broadcasts", stMatch[1]);
    if (!b || (!priv && b.by !== user.id)) return send(404, { error: "לא נמצא" }), true;
    if (!b.campaignId) return send(200, { status: null }), true;
    try {
      const s = await yemot.getCampaignStatus(b.campaignId);
      return send(200, { status: s }), true;
    } catch (e) {
      return send(400, { error: e.message }), true;
    }
  }

  // ---- אנשי קשר (מחזקים, תורמים וכו׳)
  if (pathname === "/api/broadcast/contacts") {
    if (!canContacts) return send(403, { error: "אין הרשאה" }), true;
    if (method === "GET") return send(200, { contacts: await store.list("contacts") }), true;
    if (method === "POST") {
      const b = await readBody(req, 512 * 1024);
      const rows = Array.isArray(b.rows) ? b.rows : [b];
      if (rows.length > 2000) return send(400, { error: "יותר מדי שורות" }), true;
      const existing = await store.list("contacts");
      let n = 0;
      for (const r of rows) {
        const name = clean(r.name, 80).trim();
        const phone = normalizePhone(r.phone);
        if (!name && !phone) continue;
        const found = r.id ? existing.find((c) => c.id === r.id) : phone ? existing.find((c) => c.phone === phone) : null;
        const tags = (Array.isArray(r.tags) ? r.tags : String(r.tags || "").split(/[,،]/))
          .map((t) => clean(t, 30).trim())
          .filter(Boolean);
        await store.put("contacts", found?.id || randomUUID(), {
          ...(found || {}),
          name: name || found?.name || "",
          phone: phone || found?.phone || "",
          email: clean(r.email, 120).trim() || found?.email || "",
          tags: tags.length ? Array.from(new Set(tags)) : found?.tags || [],
          notes: clean(r.notes, 300) || found?.notes || "",
          active: r.active !== false,
        });
        n++;
      }
      await audit(user, "עדכון אנשי קשר", `${n} רשומות`);
      return send(200, { ok: true, count: n }), true;
    }
  }
  const ctMatch = pathname.match(/^\/api\/broadcast\/contacts\/([\w-]+)$/);
  if (ctMatch && method === "DELETE") {
    if (!canContacts) return send(403, { error: "אין הרשאה" }), true;
    await store.del("contacts", ctMatch[1]);
    await audit(user, "מחיקת איש קשר");
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}
