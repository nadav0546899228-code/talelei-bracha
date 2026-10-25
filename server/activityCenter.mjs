/**
 * מרכז פעילות ארצי - שכבת קריאה מאוחדת מעל הנתונים הקיימים.
 * אין כאן מאגר פעילות נוסף: כל פריט מגיע מהמקור שבו כבר הוזן.
 */
import { branchScope, loadOrg } from "./org.mjs";

const CITY_COORDS = {
  "צפת":[32.9646,35.4960],"ירושלים":[31.7683,35.2137],"בני ברק":[32.0833,34.8333],
  "תל אביב":[32.0853,34.7818],"פתח תקווה":[32.0840,34.8878],"אשדוד":[31.8014,34.6435],
  "אשקלון":[31.6688,34.5743],"באר שבע":[31.2520,34.7915],"חיפה":[32.7940,34.9896],
  "טבריה":[32.7959,35.5312],"עפולה":[32.6076,35.2896],"נתניה":[32.3215,34.8532],
  "רחובות":[31.8948,34.8113],"בית שמש":[31.7466,34.9888],"מודיעין עילית":[31.9322,35.0442],
  "אלעד":[32.0522,34.9512],"ביתר עילית":[31.6977,35.1158],"קריית גת":[31.6100,34.7642],
  "רכסים":[32.7494,35.0998],"נתיבות":[31.4232,34.5893],"אופקים":[31.3141,34.6203],
  "קריית מלאכי":[31.7308,34.7466],"ערד":[31.2589,35.2128],"מירון":[32.9873,35.4402]
};

const coordFor = (city) => {
  const name = String(city || "").trim();
  if (CITY_COORDS[name]) return CITY_COORDS[name];
  const key = Object.keys(CITY_COORDS).find((k) => name.includes(k) || k.includes(name));
  return key ? CITY_COORDS[key] : null;
};
const isoDay = (v) => String(v || "").slice(0,10);
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

export async function handleActivityCenter(req, res, url, ctx) {
  const { pathname } = url;
  if (pathname !== "/api/activity-center") return false;
  const { user, send, store } = ctx;
  if ((req.method || "GET") !== "GET") return send(405, { error: "פעולה לא נתמכת" }), true;
  if (!user.views.includes("activity")) return send(403, { error: "אין הרשאה" }), true;

  const org = await loadOrg(store);
  const kScope = branchScope(user, org, "kollel");
  const bScope = branchScope(user, org, "bnot");
  const globalCalendar = user.roles.includes("office") || user.roles.includes("content_editor");
  const canK = globalCalendar || user.views.includes("kollel") || user.roles.some((r) => r.startsWith("kollel_")) || user.roles.includes("chief_coordinator") || user.roles.includes("ceo") || user.roles.includes("developer");
  const canB = globalCalendar || user.views.includes("bnot") || user.views.includes("isha") || user.roles.some((r) => r.startsWith("bnot_")) || user.roles.includes("chief_coordinator") || user.roles.includes("ceo") || user.roles.includes("developer");

  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const branchOk = (domain, branchId) => {
    if (!branchId || globalCalendar) return true;
    const scope = domain === "bnot" ? bScope : kScope;
    return scope === null || scope.has(branchId);
  };
  const branchInfo = (branchId) => {
    const branch = org.branches.find((b) => b.id === branchId);
    const city = org.cities.find((c) => c.id === branch?.parentId);
    const coords = branch?.lat && branch?.lng ? [Number(branch.lat), Number(branch.lng)] : city?.lat && city?.lng ? [Number(city.lat), Number(city.lng)] : coordFor(city?.name);
    return { branch: branch?.name || "", city: city?.name || "", lat: coords?.[0] ?? null, lng: coords?.[1] ?? null };
  };
  const items = [];
  const push = (item) => {
    const date = isoDay(item.date || item.start);
    if (!date || !inRange(date, from, to)) return;
    items.push({ ...item, date });
  };

  if (canB) {
    for (const a of await store.list("bnotActivities", 5000)) {
      if (!branchOk("bnot", a.branchId)) continue;
      const loc = branchInfo(a.branchId);
      push({
        id: `bnot:${a.id}`, source: "bnotActivity", sourceLabel: "פעילות בנות צילה", domain: "bnot",
        title: a.title || "פעילות בנות צילה", date: a.date, time: a.time || "", place: a.place || loc.branch,
        address: a.address || "", branchId: a.branchId, ...loc, participants: Array.isArray(a.present) ? a.present.length : 0, demo: Boolean(a.demo)
      });
    }
    for (const e of await store.list("challahEvents", 5000)) {
      if (!branchOk("bnot", e.branchId)) continue;
      const loc = branchInfo(e.branchId);
      push({
        id: `challah:${e.id}`, source: "challah", sourceLabel: "הפרשת חלה", domain: "bnot",
        title: e.title || "הפרשת חלה", date: e.date, time: e.time || "", place: e.place || loc.branch,
        address: e.address || "", branchId: e.branchId, ...loc, participants: Array.isArray(e.registrations) ? e.registrations.length : 0,
        open: e.open !== false, demo: Boolean(e.demo)
      });
    }
  }

  if (canK) {
    for (const a of await store.list("kollelAttendance", 8000)) {
      if (!branchOk("kollel", a.branchId)) continue;
      const loc = branchInfo(a.branchId);
      push({
        id: `kollel:${a.id}`, source: "kollelStudy", sourceLabel: "ערב לימוד", domain: "kollel",
        title: "ערב לימוד", date: a.date, time: a.time || "20:00", place: a.place || loc.branch,
        address: a.address || "", branchId: a.branchId, ...loc, participants: Array.isArray(a.present) ? a.present.length : 0, demo: Boolean(a.demo)
      });
    }
  }

  const contentDoc = await store.get("content", "site");
  for (const l of contentDoc?.content?.lessons || []) {
    const start = String(l.date || "");
    if (!start) continue;
    const d = new Date(start);
    if (Number.isNaN(d.getTime())) continue;
    const domain = l.brand === "bz" ? "bnot" : "kollel";
    if ((domain === "bnot" && !canB) || (domain === "kollel" && !canK)) continue;
    const locationText = `${l.location || ""} ${l.address || ""}`;
    const city = Object.keys(CITY_COORDS).find((c) => locationText.includes(c)) || "";
    const coords = coordFor(city);
    push({
      id: `lesson:${l.id}`, source: "scheduledLesson", sourceLabel: "שיעור", domain,
      title: l.title || "שיעור", start, date: start,
      time: new Intl.DateTimeFormat("he-IL",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Jerusalem"}).format(d),
      place: l.location || "", address: l.address || "", branchId:null, branch:"", city,
      lat:coords?.[0] ?? null, lng:coords?.[1] ?? null, participants:null, demo:Boolean(l.demo)
    });
  }

  for (const e of contentDoc?.content?.events || []) {
    const domain = e.brand === "bz" ? "bnot" : "kollel";
    if ((domain === "bnot" && !canB) || (domain === "kollel" && !canK)) continue;
    const start = String(e.start || "");
    const d = new Date(start);
    if (!start || Number.isNaN(d.getTime())) continue;
    const locationText = `${e.location || ""} ${e.address || ""}`;
    const city = Object.keys(CITY_COORDS).find((c) => locationText.includes(c)) || "";
    const coords = coordFor(city);
    push({
      id: `content:${e.id}`, source: "siteEvent", sourceLabel: "אירוע האתר", domain,
      title: e.title || "אירוע", start, date: start, time: new Intl.DateTimeFormat("he-IL",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Jerusalem"}).format(d),
      place: e.location || "", address: e.address || "", branchId: null, branch: "", city,
      lat: coords?.[0] ?? null, lng: coords?.[1] ?? null, participants: null, demo: Boolean(e.demo)
    });
  }

  items.sort((a,b) => `${a.date}T${a.time || "23:59"}`.localeCompare(`${b.date}T${b.time || "23:59"}`));
  const locations = new Map();
  for (const x of items) {
    if (!x.city || x.lat == null || x.lng == null) continue;
    const prev = locations.get(x.city) || { city:x.city, lat:x.lat, lng:x.lng, count:0, boys:0, girls:0, participants:0 };
    prev.count++;
    if (x.domain === "bnot") prev.girls++; else prev.boys++;
    prev.participants += Number(x.participants || 0);
    locations.set(x.city, prev);
  }

  return send(200, {
    items,
    locations:[...locations.values()].sort((a,b)=>b.count-a.count),
    totals:{
      activities:items.length,
      boys:items.filter((x)=>x.domain==="kollel").length,
      girls:items.filter((x)=>x.domain==="bnot").length,
      participants:items.reduce((n,x)=>n+Number(x.participants||0),0),
      cities:locations.size
    }
  }), true;
}
