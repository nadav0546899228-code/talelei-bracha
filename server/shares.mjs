/**
 * שיתופים מהמתחזקים / המתחזקות: קישור אישי (וואטסאפ, בלי סיסמה) ← טקסט ותמונות
 * ← מגיע לרכז/ת של הסניף לאישור ← אושר = נכנס ליומן המתחזק ולתיעוד הסניף.
 * ניקוי בעזרת בינה מלאכותית (אופציונלי, כשיש מפתח במסך מתכנת).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { branchScope, loadOrg } from "./org.mjs";

const MAX_IMAGES = 4;
const MAX_IMAGE = 1.6 * 1024 * 1024;
const IMG_RE = /^image\/(png|jpe?g|webp)$/;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function byToken(store, t) {
  if (!t || String(t).length < 16) return null;
  return (await store.list("mitchazkim", 20000)).find((m) => m.token && m.token === t && m.status !== "left") || null;
}

async function aiSettings(store) {
  const s = (await store.get("settings", "ai")) || {};
  const key = s.key || process.env.ANTHROPIC_API_KEY || "";
  return { key, model: s.model || "claude-haiku-5-5" };
}

/** ניקוי טקסט: תיקון כתיב, הסרת פרטים מזהים רגישים, תקציר ותגיות */
async function aiClean(store, text, domain) {
  const { key, model } = await aiSettings(store);
  if (!key) throw new Error("לא הוגדר מפתח בינה מלאכותית (מסך מתכנת)");
  const prompt = `לפניך שיתוף ש${domain === "bnot" ? "מתחזקת כתבה" : "מתחזק כתב"} בארגון תורני (${domain === "bnot" ? "בנות צילה" : "כולל ערב"}).
תחזיר JSON בלבד, בלי שום טקסט נוסף, במבנה:
{"text":"הטקסט מתוקן: כתיב ופיסוק בלבד, באותו סגנון ובאותן מילים, בלי מספרי טלפון, כתובות או תעודות זהות","summary":"משפט אחד קצר","tags":["עד 4 תגיות קצרות בעברית"]}
השיתוף:
"""${text}"""`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `שגיאת בינה מלאכותית (${r.status})`);
  const out = String(j?.content?.[0]?.text || "");
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("לא התקבלה תשובה תקינה");
  const p = JSON.parse(m[0]);
  return { text: String(p.text || text).slice(0, 3000), summary: String(p.summary || "").slice(0, 200), tags: (Array.isArray(p.tags) ? p.tags : []).map((x) => String(x).slice(0, 30)).slice(0, 4) };
}

async function delShare(store, s) {
  for (const fid of s.images || []) await store.del("shareFiles", fid);
  await store.del("mitchShares", s.id);
}

/** מסכי הצוות */
export async function handleShares(req, res, url, ctx) {
  const { pathname } = url;
  const linkM = pathname.match(/^\/api\/mitch\/([\w-]+)\/link$/);
  if (!linkM && !pathname.startsWith("/api/shares")) return false;
  const { user, send, store, readBody, audit, clean } = ctx;
  const method = req.method || "GET";
  const org = await loadOrg(store);
  const can = (domain) => user.views.includes(domain === "kollel" ? "kollel" : "bnot");
  const inScope = (domain, branchId) => {
    const s = branchScope(user, org, domain);
    return s === null || s.has(branchId);
  };

  // קישור אישי למתחזק/ת (יוצר אם אין; reset=1 מחליף ומבטל את הישן)
  if (linkM && method === "POST") {
    const m = await store.get("mitchazkim", linkM[1]);
    if (!m || !can(m.domain) || !inScope(m.domain, m.branchId)) return send(404, { error: "לא נמצא" }), true;
    const b = await readBody(req);
    let token = m.token;
    if (!token || b.reset) {
      token = randomBytes(18).toString("base64url");
      await store.put("mitchazkim", m.id, { ...m, token });
      await audit(user, b.reset ? "החלפת קישור אישי" : "קישור אישי למתחזק", m.name);
    }
    return send(200, { token }), true;
  }

  // מפתח בינה מלאכותית - מתכנת בלבד
  if (pathname === "/api/shares/ai-key") {
    if (!user.views.includes("developer")) return send(403, { error: "אין הרשאה" }), true;
    if (method === "GET") {
      const s = (await store.get("settings", "ai")) || {};
      return send(200, { set: Boolean(s.key || process.env.ANTHROPIC_API_KEY), fromEnv: !s.key && Boolean(process.env.ANTHROPIC_API_KEY), model: s.model || "claude-haiku-5-5" }), true;
    }
    if (method === "POST") {
      const b = await readBody(req);
      const prev = (await store.get("settings", "ai")) || {};
      await store.put("settings", "ai", { ...prev, key: b.clear ? "" : clean(b.key, 300) || prev.key || "", model: clean(b.model, 80) || prev.model || "" });
      await audit(user, "עדכון מפתח בינה מלאכותית", b.clear ? "הוסר" : "עודכן");
      return send(200, { ok: true }), true;
    }
  }

  if (pathname === "/api/shares" && method === "GET") {
    const domain = url.searchParams.get("domain") === "bnot" ? "bnot" : "kollel";
    if (!can(domain)) return send(403, { error: "אין הרשאה" }), true;
    const rows = (await store.list("mitchShares", 20000)).filter((s) => s.domain === domain && inScope(domain, s.branchId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const { key } = await aiSettings(store);
    const branches = org.branches.filter((b) => b.domain === domain).map((b) => ({ id: b.id, name: b.name }));
    return send(200, { shares: rows, ai: Boolean(key), branches }), true;
  }

  const fileM = pathname.match(/^\/api\/shares\/file\/([\w-]+)$/);
  if (fileM && method === "GET") {
    const f = await store.get("shareFiles", fileM[1]);
    const s = f && (await store.get("mitchShares", f.shareId));
    if (!f || !s || !can(s.domain) || !inScope(s.domain, s.branchId)) return send(404, { error: "לא נמצא" }), true;
    res.writeHead(200, { "Content-Type": f.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
    res.end(Buffer.from(f.data, "base64"));
    return true;
  }

  const aiM = pathname.match(/^\/api\/shares\/([\w-]+)\/ai$/);
  if (aiM && method === "POST") {
    const s = await store.get("mitchShares", aiM[1]);
    if (!s || !can(s.domain) || !inScope(s.domain, s.branchId)) return send(404, { error: "לא נמצא" }), true;
    const b = await readBody(req, 16 * 1024);
    try {
      const r = await aiClean(store, clean(b.text, 3000) || s.text, s.domain);
      return send(200, r), true;
    } catch (e) {
      return send(400, { error: e instanceof Error ? e.message : "שגיאה" }), true;
    }
  }

  const oneM = pathname.match(/^\/api\/shares\/([\w-]+)$/);
  if (oneM) {
    const s = await store.get("mitchShares", oneM[1]);
    if (!s || !can(s.domain) || !inScope(s.domain, s.branchId)) return send(404, { error: "לא נמצא" }), true;
    if (method === "DELETE") {
      const m = await store.get("mitchazkim", s.mitchId);
      if (m) await store.put("mitchazkim", m.id, { ...m, log: (m.log || []).filter((x) => x.shareId !== s.id) });
      await delShare(store, s);
      await audit(user, "מחיקת שיתוף", s.name);
      return send(200, { ok: true }), true;
    }
    if (method === "POST") {
      const b = await readBody(req, 16 * 1024);
      const by = user.name || user.email || user.phone;
      if (b.action === "reject") {
        await delShare(store, s);
        await audit(user, "דחיית שיתוף", s.name);
        return send(200, { ok: true }), true;
      }
      if (b.action === "approve") {
        const text = clean(b.text ?? s.text, 3000);
        const tags = (Array.isArray(b.tags) ? b.tags : s.tags || []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 6);
        const doc = { ...s, text, tags, summary: clean(b.summary ?? s.summary ?? "", 200), status: "approved", decidedBy: by, decidedAt: new Date().toISOString() };
        await store.put("mitchShares", s.id, doc);
        const m = await store.get("mitchazkim", s.mitchId);
        if (m && s.status !== "approved") {
          const entry = { id: randomUUID().slice(0, 8), date: String(s.createdAt).slice(0, 10) || today(), type: "שיתוף", note: text.slice(0, 500), images: s.images || [], shareId: s.id, by: `${m.name} (אושר ע״י ${by})` };
          await store.put("mitchazkim", m.id, { ...m, log: [entry, ...(m.log || [])].slice(0, 300), lastContact: entry.date });
        } else if (m) {
          await store.put("mitchazkim", m.id, { ...m, log: (m.log || []).map((x) => (x.shareId === s.id ? { ...x, note: text.slice(0, 500) } : x)) });
        }
        await audit(user, "אישור שיתוף", s.name);
        return send(200, { ok: true }), true;
      }
    }
  }
  return send(404, { error: "לא נמצא" }), true;
}

/** הדף האישי של המתחזק/ת (מקישור בוואטסאפ) */
export async function publicShares(req, res, url, { store, json, readBody, clean, rateLimited, clientIp, notify, resolveUserScope }) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/public/me")) return false;
  const t = url.searchParams.get("t") || "";
  const m = await byToken(store, t);
  if (!m) {
    rateLimited(`mebad:${clientIp(req)}`, 30, 10 * 60_000);
    return json(res, 404, { error: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש מהרכז." }), true;
  }
  const fileM = pathname.match(/^\/api\/public\/me\/file\/([\w-]+)$/);
  if (fileM && req.method === "GET") {
    const f = await store.get("shareFiles", fileM[1]);
    const s = f && (await store.get("mitchShares", f.shareId));
    if (!f || !s || s.mitchId !== m.id) return json(res, 404, { error: "לא נמצא" }), true;
    res.writeHead(200, { "Content-Type": f.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
    res.end(Buffer.from(f.data, "base64"));
    return true;
  }
  if (pathname !== "/api/public/me") return false;
  const org = await loadOrg(store);
  const branch = org.branches.find((b) => b.id === m.branchId);
  if (req.method === "GET") {
    const shares = (await store.list("mitchShares", 20000))
      .filter((s) => s.mitchId === m.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((s) => ({ id: s.id, text: s.text, images: s.images || [], status: s.status, createdAt: s.createdAt }));
    return json(res, 200, { name: String(m.name).replace(/\s*\(דמה\)$/, "").split(" ")[0], domain: m.domain, branch: branch?.name || "", shares }), true;
  }
  if (req.method === "POST") {
    if (rateLimited(`meshare:${m.id}`, 15, 60 * 60_000)) return json(res, 429, { error: "שלחת הרבה בזמן קצר. אפשר לנסות שוב בעוד שעה." }), true;
    const b = await readBody(req, 8 * 1024 * 1024);
    const text = clean(b.text, 3000).trim();
    const imgs = (Array.isArray(b.images) ? b.images : []).slice(0, MAX_IMAGES);
    if (!text && !imgs.length) return json(res, 400, { error: "צריך לכתוב משהו או לצרף תמונה" }), true;
    const id = randomUUID();
    const ids = [];
    for (const im of imgs) {
      const type = String(im?.type || "");
      const data = String(im?.data || "").replace(/^data:[^,]+,/, "");
      const size = Math.floor((data.length * 3) / 4);
      if (!IMG_RE.test(type) || !data || size > MAX_IMAGE || !/^[A-Za-z0-9+/=]+$/.test(data)) continue;
      const fid = randomUUID();
      await store.put("shareFiles", fid, { shareId: id, type, size, data });
      ids.push(fid);
    }
    if (!text && !ids.length) return json(res, 400, { error: "התמונה לא נקלטה. אפשר לנסות תמונה אחרת." }), true;
    await store.put("mitchShares", id, { mitchId: m.id, name: m.name, domain: m.domain, branchId: m.branchId, text, images: ids, status: "pending", createdAt: new Date().toISOString() });
    // התראה רק למי שאחראי על הסניף הזה
    notify?.((u) => resolveUserScope(u, org, m.domain, m.branchId), {
      title: m.domain === "bnot" ? "שיתוף חדש ממתחזקת" : "שיתוף חדש ממתחזק",
      body: `${m.name}${text ? ` · ${text.slice(0, 60)}` : " · תמונה"}`,
      url: `/admin?v=${m.domain === "bnot" ? "bnot" : "kollel"}&t=shares`,
    });
    return json(res, 200, { ok: true }), true;
  }
  return false;
}

/** האם המשתמש אחראי על הסניף (לפי התחום) */
export function userCoversBranch(u, org, domain, branchId) {
  if (!u.views?.includes(domain === "kollel" ? "kollel" : "bnot")) return false;
  const s = branchScope(u, org, domain);
  return s === null || s.has(branchId);
}
