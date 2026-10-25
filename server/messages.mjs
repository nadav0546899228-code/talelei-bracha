/**
 * הודעות פנימיות בין אנשי הצוות: השבה, מחיקה (אצלי בלבד) וסימון כנקרא - גם לכמה הודעות יחד.
 * למי מותר לכתוב: מנכ״ל / מתכנת / רכז ראשי - לכולם. רכז עיר - למנהלי הסניפים בעיר שלו ולמעלה.
 * מנהל סניף - לרכז העיר שלו ולמעלה. שאר התפקידים - להנהלה.
 */
import { randomUUID } from "node:crypto";
import { isPrivileged, normalizeRoles, ROLE_SCOPE } from "./roles.mjs";
import { loadOrg } from "./org.mjs";

/** כל אנשי הצוות הפעילים */
export async function staffList(store, resolveUser, bootstrapEmails) {
  const out = [];
  const docs = await store.list("users");
  const emails = new Set([...docs.map((d) => d.id), ...bootstrapEmails]);
  for (const e of emails) {
    const u = await resolveUser(e);
    if (u) out.push(u);
  }
  for (const d of await store.list("phoneUsers")) {
    const u = await resolveUser(`phone:${d.id}`);
    if (u) out.push(u);
  }
  return out;
}

/** לאיזה ארגון שייך איש צוות: טללי ברכה (kollel), בנות צילה (bnot), או הנהלה (שניהם) */
function domainsOf(u) {
  const r = normalizeRoles(u.roles);
  const k = r.some((x) => x.startsWith("kollel_"));
  const b = r.some((x) => x.startsWith("bnot_") || x === "isha_coordinator");
  if (!k && !b) return new Set(["kollel", "bnot"]); // הנהלה: מנכ״ל, רכז ארצי, משרד...
  return new Set([...(k ? ["kollel"] : []), ...(b ? ["bnot"] : [])]);
}
const domainParam = (v) => (v === "bnot" ? "bnot" : v === "kollel" ? "kollel" : null);

async function allowedRecipients(user, staff, store, domain = null) {
  const all = await allowedRecipientsAll(user, staff, store);
  // טללי ברכה ובנות צילה - כמו שני אתרים נפרדים: בכל מצב רואים רק את האנשים של אותו ארגון (+ההנהלה)
  return domain ? all.filter((u) => domainsOf(u).has(domain)) : all;
}

async function allowedRecipientsAll(user, staff, store) {
  const top = (u) => isPrivileged(u.roles) || u.roles.includes("chief_coordinator");
  if (top(user)) return staff.filter((u) => u.id !== user.id);
  const org = await loadOrg(store);
  const out = new Map();
  for (const u of staff) if (top(u) && !u.roles.includes("developer")) out.set(u.id, u);
  for (const r of user.roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const s = user.scope?.[rs.domain] || {};
    if (rs.level === "city" && s.cityId) {
      const branches = new Set(org.branches.filter((b) => b.parentId === s.cityId).map((b) => b.id));
      for (const u of staff) if (u.roles.includes(`${rs.domain}_branch`) && branches.has(u.scope?.[rs.domain]?.branchId)) out.set(u.id, u);
    }
    if (rs.level === "branch" && s.branchId) {
      const cityId = org.branches.find((b) => b.id === s.branchId)?.parentId;
      for (const u of staff) if (u.roles.includes(`${rs.domain}_city`) && u.scope?.[rs.domain]?.cityId === cityId) out.set(u.id, u);
    }
  }
  out.delete(user.id);
  return [...out.values()];
}

export async function handleMessages(req, res, url, ctx) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/messages")) return false;
  const { user, send, store, readBody, clean, resolveUser, bootstrapEmails, notify, roleLabels } = ctx;
  const method = req.method || "GET";
  if (!user.views.includes("messages")) return send(403, { error: "אין הרשאה" }), true;

  const mineVisible = (m) => (m.to.includes(user.id) || m.from === user.id) && !(m.deletedBy || []).includes(user.id);

  if (pathname === "/api/messages" && method === "GET") {
    const dom = domainParam(url.searchParams.get("domain"));
    const rows = (await store.list("messages", 5000)).filter((m) => mineVisible(m) && (!dom || !m.domain || m.domain === dom)).map((m) => ({ ...m, read: m.from === user.id || (m.readBy || []).includes(user.id), mine: m.from === user.id }));
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return send(200, { messages: rows, me: user.id }), true;
  }

  if (pathname === "/api/messages/recipients" && method === "GET") {
    const staff = await staffList(store, resolveUser, bootstrapEmails);
    const list = await allowedRecipients(user, staff, store, domainParam(url.searchParams.get("domain")));
    return send(200, { recipients: list.map((u) => ({ id: u.id, name: u.name || u.email || u.phone, role: normalizeRoles(u.roles).map((r) => roleLabels[r]).join(" · ") })) }), true;
  }

  if (pathname === "/api/messages" && method === "POST") {
    if (user.impersonatedBy) return send(400, { error: "בתצוגה של משתמש אחר אי אפשר לשלוח הודעה בשמו" }), true;
    const b = await readBody(req);
    const text = clean(b.text, 4000).trim();
    if (!text) return send(400, { error: "ההודעה ריקה" }), true;
    const staff = await staffList(store, resolveUser, bootstrapEmails);
    const domain = domainParam(b.domain);
    const allowed = new Map((await allowedRecipients(user, staff, store, domain)).map((u) => [u.id, u]));
    let to = (Array.isArray(b.to) ? b.to : []).map(String).filter((id) => allowed.has(id));
    let replyTo = null;
    let replyDomain = null;
    if (b.replyTo) {
      const orig = await store.get("messages", String(b.replyTo));
      replyDomain = orig?.domain || null;
      // השבה תמיד מותרת לשולח המקורי
      if (orig && (orig.to.includes(user.id) || orig.from === user.id)) {
        replyTo = orig.id;
        if (orig.from !== user.id && !to.includes(orig.from)) to.push(orig.from);
      }
    }
    to = Array.from(new Set(to)).slice(0, 200);
    if (!to.length) return send(400, { error: "יש לבחור למי לשלוח" }), true;
    const names = await Promise.all(to.map(async (id) => allowed.get(id)?.name || (await resolveUser(id))?.name || ""));
    const id = randomUUID();
    await store.put("messages", id, {
      from: user.id,
      fromName: user.name || user.email || user.phone,
      to,
      toNames: names,
      text,
      replyTo,
      domain: replyDomain || domain,
      readBy: [],
      deletedBy: [],
    });
    notify((u) => to.includes(u.id), { title: `הודעה מ${user.name || "הצוות"}`, body: text.slice(0, 120), url: "/admin?v=messages" });
    return send(200, { ok: true, id }), true;
  }

  if ((pathname === "/api/messages/read" || pathname === "/api/messages/delete") && method === "POST") {
    if (user.impersonatedBy) return send(400, { error: "בתצוגה של משתמש אחר אי אפשר לשנות" }), true;
    const { ids } = await readBody(req);
    const field = pathname.endsWith("read") ? "readBy" : "deletedBy";
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 500)) {
      const m = await store.get("messages", String(id));
      if (!m || !(m.to.includes(user.id) || m.from === user.id)) continue;
      const set = new Set(m[field] || []);
      if (set.has(user.id)) continue;
      set.add(user.id);
      await store.put("messages", m.id, { ...m, [field]: [...set] });
    }
    return send(200, { ok: true }), true;
  }

  return send(404, { error: "לא נמצא" }), true;
}
