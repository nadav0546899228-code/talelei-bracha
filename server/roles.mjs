/**
 * תפקידים, תצוגות והרשאות - המקור הקובע (השרת אוכף, הממשק רק מציג).
 *
 * מבנה ארגוני (בשני תחומים: כולל ערב ובנות צילה):
 *   מנכ״ל ← רכז ראשי (מעל כל הרכזים) ← רכז עיר ← מנהל סניף ← אברכים
 */

export const VIEWS = ["dashboard", "smart", "activity", "messages", "isha", "bnot", "inquiries", "kollel", "payroll", "reports", "org", "broadcast", "donations", "content", "users", "audit", "developer"];

export const VIEW_LABELS = {
  dashboard: "לוח בקרה",
  smart: "ניהול חכם",
  activity: "לוח פעילות ארצי",
  messages: "הודעות",
  bnot: "סניפי בנות צילה",
  reports: "דוחות",
  donations: "תרומות",
  isha: "אישה לאישה",
  inquiries: "פניות",
  kollel: "כולל ערב",
  payroll: "משכורות",
  org: "ערים, סניפים ורכזים",
  broadcast: "הודעות ותפוצה",
  content: "תוכן האתר",
  users: "משתמשים והרשאות",
  audit: "יומן פעולות",
  developer: "מתכנת",
};

export const ROLES = {
  developer: { label: "מתכנת", views: VIEWS },
  ceo: { label: "מנכ״ל", views: VIEWS.filter((v) => v !== "developer" && v !== "audit") },
  chief_coordinator: { label: "רכז ראשי", views: ["dashboard", "smart", "activity", "messages", "kollel", "payroll", "reports", "isha", "bnot", "org", "broadcast"] },
  kollel_city: { label: "רכז עיר - כולל ערב", views: ["dashboard", "smart", "activity", "messages", "kollel", "org", "broadcast"] },
  kollel_branch: { label: "מנהל סניף - כולל ערב", views: ["dashboard", "smart", "activity", "messages", "kollel", "broadcast"] },
  bnot_city: { label: "רכזת עיר - בנות צילה", views: ["dashboard", "smart", "activity", "messages", "isha", "bnot", "org", "broadcast"] },
  bnot_branch: { label: "מנהלת סניף - בנות צילה", views: ["dashboard", "smart", "activity", "messages", "bnot", "broadcast"] },
  isha_coordinator: { label: "רכזת אישה לאישה", views: ["dashboard", "smart", "activity", "messages", "isha", "broadcast"] },
  office: { label: "משרד ופניות", views: ["dashboard", "smart", "activity", "messages", "inquiries", "broadcast", "donations"] },
  content_editor: { label: "עריכת תוכן", views: ["dashboard", "activity", "messages", "content"] },
  bnot_caller: { label: "טלפנית - בנות צילה", views: ["dashboard", "smart", "bnot", "messages"] },
};

/** תפקידים שמשויכים לעיר או לסניף */
export const ROLE_SCOPE = {
  kollel_city: { domain: "kollel", level: "city" },
  kollel_branch: { domain: "kollel", level: "branch" },
  bnot_city: { domain: "bnot", level: "city" },
  bnot_branch: { domain: "bnot", level: "branch" },
  bnot_caller: { domain: "bnot", level: "branch" },
};

/** שמות תפקידים מגרסה קודמת */
const LEGACY = { kollel_head: "chief_coordinator", kollel_sub: "kollel_branch" };
export const normalizeRoles = (roles) => Array.from(new Set((roles || []).map((r) => LEGACY[r] || r))).filter((r) => ROLES[r]);

/** תפקידים שכל תפקיד רשאי להעניק */
export function grantableRoles(roles) {
  if (roles.includes("developer")) return Object.keys(ROLES);
  if (roles.includes("ceo")) return Object.keys(ROLES).filter((r) => r !== "developer");
  const out = new Set();
  if (roles.includes("chief_coordinator")) ["kollel_city", "kollel_branch", "bnot_city", "bnot_branch", "bnot_caller"].forEach((r) => out.add(r));
  if (roles.includes("kollel_city")) out.add("kollel_branch");
  if (roles.includes("bnot_city")) ["bnot_branch", "bnot_caller"].forEach((r) => out.add(r));
  return [...out];
}

const list = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** משתמשי יסוד - תמיד קיימים, לא ניתנים לעריכה או מחיקה מהממשק */
export const BOOTSTRAP = {
  developer: list(process.env.DEVELOPER_EMAILS || "nadav0546899228@gmail.com"),
  ceo: list(process.env.CEO_EMAILS || "0542577001c@gmail.com"),
};

export function bootstrapRoles(email) {
  const e = (email || "").toLowerCase();
  const roles = [];
  if (BOOTSTRAP.developer.includes(e)) roles.push("developer");
  if (BOOTSTRAP.ceo.includes(e)) roles.push("ceo");
  return roles;
}

/** לאיזו תצוגה שייך כל טופס - קובע מי רשאי לראות את הפניות */
export const FORM_VIEW = {
  ishaRequest: "isha",
  ishaMentor: "isha",
  contact: "inquiries",
  volunteer: "inquiries",
  updates: "inquiries",
  assistance: "inquiries",
};

export function viewsFor(roles) {
  const set = new Set();
  for (const r of roles) for (const v of ROLES[r]?.views ?? []) set.add(v);
  return VIEWS.filter((v) => set.has(v));
}

export const isPrivileged = (roles) => roles.includes("developer") || roles.includes("ceo");
/** רואה את כל הכולל ומנהל משכורות */
export const isKollelManager = (roles) => isPrivileged(roles) || roles.includes("chief_coordinator");
