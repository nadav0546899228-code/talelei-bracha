/**
 * זרימת עבודה למתחזקים/מתחזקות:
 * שלבים ניתנים להגדרה, זיהוי "נופל בין הכיסאות", ומעקב העברות חסוי למתכנת.
 */

export const DEFAULT_STAGES = {
  kollel: ["היכרות", "לומד בחברותא", "לומד בקביעות", "מתקדם", "שומר תו״מ"],
  bnot: ["השתתפה בהפרשת חלה", "בקשר", "משתתפת בפעילות", "בקשר קבוע", "שומרת תו״מ"],
};

export const DEFAULT_ATTENTION = {
  contactDays: 14,
  stageDays: 45,
  missedMeetings: 3,
};

export const DEFAULT_WHATSAPP_TEMPLATES = {
  kollel: [
    "שלום {שם}, מה שלומך? רציתי לשמוע איך אתה מתקדם.",
    "שלום {שם}, נשמח לראות אותך במפגש הקרוב.",
    "שלום {שם}, רק מזכיר שנדבר היום בעזרת ה׳.",
  ],
  bnot: [
    "שלום {שם}, מה שלומך? רציתי לשמוע איך את מרגישה.",
    "שלום {שם}, נשמח לראות אותך בפעילות הקרובה.",
    "שלום {שם}, רק מזכירה שנדבר היום בעזרת ה׳.",
  ],
};

const isoDay = (value) => String(value || "").slice(0, 10);
const israelToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function dayDiff(from, to = israelToday()) {
  const a = new Date(`${isoDay(from)}T12:00:00Z`);
  const b = new Date(`${isoDay(to)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

const intIn = (value, fallback, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function cleanTemplates(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const rows = value.map((x) => String(x || "").trim().slice(0, 400)).filter(Boolean);
  return rows.length ? [...new Set(rows)].slice(0, 12) : fallback;
}

function cleanStages(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const rows = value
    .map((x) => String(x || "").trim().slice(0, 60))
    .filter(Boolean);
  const unique = [...new Set(rows)];
  return unique.length >= 2 ? unique.slice(0, 12) : fallback;
}

export async function loadMitchConfig(store, domain) {
  const saved = (await store.get("settings", `mitchWorkflow:${domain}`)) || {};
  return {
    stages: cleanStages(saved.stages, DEFAULT_STAGES[domain]),
    attention: {
      contactDays: intIn(saved.attention?.contactDays, DEFAULT_ATTENTION.contactDays, 1, 365),
      stageDays: intIn(saved.attention?.stageDays, DEFAULT_ATTENTION.stageDays, 1, 730),
      missedMeetings: intIn(saved.attention?.missedMeetings, DEFAULT_ATTENTION.missedMeetings, 1, 12),
    },
    whatsappTemplates: cleanTemplates(saved.whatsappTemplates, DEFAULT_WHATSAPP_TEMPLATES[domain]),
  };
}

export function normalizeMitchConfig(domain, raw = {}) {
  return {
    stages: cleanStages(raw.stages, DEFAULT_STAGES[domain]),
    attention: {
      contactDays: intIn(raw.attention?.contactDays, DEFAULT_ATTENTION.contactDays, 1, 365),
      stageDays: intIn(raw.attention?.stageDays, DEFAULT_ATTENTION.stageDays, 1, 730),
      missedMeetings: intIn(raw.attention?.missedMeetings, DEFAULT_ATTENTION.missedMeetings, 1, 12),
    },
    whatsappTemplates: cleanTemplates(raw.whatsappTemplates, DEFAULT_WHATSAPP_TEMPLATES[domain]),
  };
}

function consecutiveMissed(m, sessions) {
  let n = 0;
  for (const s of sessions) {
    if (s.date && m.startDate && String(s.date) < String(m.startDate)) continue;
    const present = Array.isArray(s.mPresent) ? s.mPresent : [];
    if (present.includes(m.id)) break;
    n++;
  }
  return n;
}

export async function enrichMitchRows(store, rows, domain, config) {
  const today = israelToday();
  const sessionsByBranch = new Map();

  if (domain === "kollel") {
    const sessions = (await store.list("kollelAttendance", 50000))
      .filter((s) => s?.branchId && s?.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const s of sessions) {
      const arr = sessionsByBranch.get(s.branchId) || [];
      arr.push(s);
      sessionsByBranch.set(s.branchId, arr);
    }
  }

  return rows.map((m) => {
    const lastContactBase = m.lastContact || m.startDate || m.createdAt || today;
    const stageChangedAt = m.stageChangedAt || m.startDate || m.createdAt || today;
    const daysSinceContact = dayDiff(lastContactBase, today);
    const stageDays = dayDiff(stageChangedAt, today);
    const missedMeetings =
      domain === "kollel" ? consecutiveMissed(m, sessionsByBranch.get(m.branchId) || []) : 0;

    const attention = [];
    if (m.status === "active") {
      if (domain === "kollel" && !m.avrechId) {
        attention.push({ id: "unassigned", severity: "high", label: "ללא אברך משויך" });
      }
      if (m.nextFollowUp && String(m.nextFollowUp) <= today) {
        attention.push({
          id: "followup",
          severity: "high",
          label: String(m.nextFollowUp) < today ? "מעקב באיחור" : "מעקב להיום",
        });
      }
      if (daysSinceContact >= config.attention.contactDays) {
        attention.push({
          id: "no_contact",
          severity: daysSinceContact >= config.attention.contactDays * 2 ? "high" : "medium",
          label: `אין קשר ${daysSinceContact} ימים`,
        });
      }
      if (stageDays >= config.attention.stageDays) {
        attention.push({
          id: "stage_stuck",
          severity: "medium",
          label: `${stageDays} ימים באותו שלב`,
        });
      }
      if (domain === "kollel" && missedMeetings >= config.attention.missedMeetings) {
        attention.push({
          id: "missed_meetings",
          severity: "high",
          label: `נעדר ${missedMeetings} מפגשים ברצף`,
        });
      }
    }

    return {
      ...m,
      stageChangedAt,
      daysSinceContact,
      stageDays,
      missedMeetings,
      attention,
      attentionLevel: attention.some((x) => x.severity === "high")
        ? "high"
        : attention.length
          ? "medium"
          : "none",
    };
  });
}

export function summarizeAttention(rows) {
  const count = (id) => rows.filter((m) => m.attention?.some((a) => a.id === id)).length;
  return {
    total: rows.filter((m) => m.attention?.length).length,
    high: rows.filter((m) => m.attentionLevel === "high").length,
    unassigned: count("unassigned"),
    followup: count("followup"),
    noContact: count("no_contact"),
    stageStuck: count("stage_stuck"),
    missedMeetings: count("missed_meetings"),
  };
}

export function monthStats(rows, today = israelToday()) {
  const month = today.slice(0, 7);
  let stageChanges = 0;
  let contacts = 0;
  for (const m of rows) {
    for (const e of m.log || []) {
      if (!String(e.date || "").startsWith(month)) continue;
      if (e.type === "שינוי שלב") stageChanges++;
      else contacts++;
    }
  }
  return {
    active: rows.filter((m) => m.status === "active").length,
    newThisMonth: rows.filter((m) => String(m.startDate || "").startsWith(month)).length,
    stageChanges,
    contacts,
  };
}
