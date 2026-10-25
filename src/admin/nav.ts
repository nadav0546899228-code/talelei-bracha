/**
 * ניווט במערכת הניהול: שני מצבים (טללי ברכה - בנים / בנות צילה - בנות),
 * כפתורי-על שנכנסים פנימה, ושורה תחתונה שאפשר לערוך.
 */
import type { IconName } from "../components/Icon";
import type { FormKey, Me, View } from "./api";

export type Mode = "boys" | "girls";
export const MODE_LABELS: Record<Mode, string> = { boys: "טללי ברכה", girls: "בנות צילה" };

/** מסך = תצוגה + לשונית פנימית אופציונלית, או מסך כפתור-על */
export type Screen = { view: View; tab?: string } | { hub: string };

export type NavLeaf = { id: string; label: string; icon: IconName; view: View; tab?: string; hint?: string; badgeForms?: FormKey[]; badgeMessages?: boolean };
export type NavHub = { id: string; label: string; icon: IconName; items: NavLeaf[] };
export type NavEntry = { id: string; label: string; icon: IconName; hub?: NavHub; leaf?: NavLeaf };

const INQ: FormKey[] = ["contact", "volunteer", "updates", "assistance"];

const leaf = (id: string, label: string, icon: IconName, view: View, extra: Partial<NavLeaf> = {}): NavLeaf => ({ id, label, icon, view, ...extra });

/** כל המבנה לפי מצב. פריטים שאין למשתמש הרשאה אליהם מסוננים אחר כך */
function tree(mode: Mode): NavHub[] {
  const manage: NavHub = {
    id: "manage",
    label: "ניהול",
    icon: "shield",
    items: [
      leaf("content", "תוכן האתר", "edit", "content", { hint: "טקסטים, תמונות ופרטי קשר" }),
      leaf("events", "אירועים ושיעורים", "calendar", "content", { tab: "events", hint: "מתעדכן מיד באתר הציבורי" }),
      leaf("users", "משתמשים והרשאות", "users", "users", { hint: "מי נכנס ומה כל אחד רואה" }),
      leaf("audit", "יומן פעולות", "list", "audit", { hint: "כל פעולה במערכת" }),
      leaf("developer", "מתכנת", "code", "developer", { hint: "בדיקות מערכת, גיבוי וכניסה כ..." }),
      leaf("donations", "תרומות", "gift", "donations"),
    ],
  };
  const common = {
    home: { id: "home", label: "בית", icon: "grid" as IconName, items: [leaf("dashboard", "לוח בקרה", "grid", "dashboard")] },
    smart: { id: "smart-center", label: "ניהול חכם", icon: "sparkle" as IconName, items: [leaf("smart", "ניהול חכם", "sparkle", "smart", { hint: "משימות, אישורים, משפכים, בריאות סניפים ופעולות מרוכזות" })] },
    activity: { id: "activity-center", label: "פעילות", icon: "calendar" as IconName, items: [leaf("activity", "לוח פעילות ארצי", "calendar", "activity", { hint: "לוח שנה, שעות ומפת הפעילות בארץ" })] },
    /** תקשורת: הודעות פנימיות + תפוצה + פניות מהאתר - כפתור אחד */
    comm: { id: "comm", label: "תקשורת", icon: "chat" as IconName, items: [
      leaf("messages", "הודעות פנימיות", "chat", "messages", { hint: "בין המנכ״ל, הרכזים ומנהלי הסניפים", badgeMessages: true }),
      leaf("inquiries", "פניות מהאתר", "inbox", "inquiries", { badgeForms: INQ, hint: "צור קשר, התנדבות, עדכונים וסיוע" }),
      leaf("bc-send", "שליחת תפוצה", "phone", "broadcast", { tab: "send", hint: "קולית, צינתוק, SMS, וואטסאפ, מייל" }),
      leaf("bc-history", "היסטוריית תפוצה", "clock", "broadcast", { tab: "history" }),
      leaf("bc-contacts", "אנשי קשר", "users", "broadcast", { tab: "contacts" }),
    ] },
  };
  if (mode === "boys") {
    return [
      common.home,
      common.smart,
      common.activity,
      {
        id: "kollel",
        label: "כולל ערב",
        icon: "book",
        items: [
          leaf("attendance", "ערב לימוד", "calendar", "kollel", { tab: "attendance", hint: "מי הגיע הערב - אברכים והמתחזקים שלהם" }),
          leaf("mitch-k", "מתחזקים", "heart", "kollel", { tab: "mitch", hint: "כל מתחזק, עם מי לומד, שלב ומעקב" }),
          leaf("avrechim", "אברכים", "users", "kollel", { tab: "avrechim", hint: "לפי ערים וסניפים" }),
          leaf("entries", "נסיעות והוצאות", "file", "kollel", { tab: "entries", hint: "דיווח ואישור בחודש הפתוח" }),
          leaf("payroll", "משכורות", "file", "payroll", { hint: "טבלת החודש, שמחות, ייצוא לאקסל" }),
          leaf("reports", "דוחות וגרפים", "grid", "reports", { hint: "השוואה בין ערים וסניפים" }),
          leaf("org-kollel", "ערים, סניפים ורכזים", "pin", "org", { hint: "מבנה הכולל ומי אחראי על מה" }),
        ],
      },
      common.comm,
      manage,
    ];
  }
  return [
    common.home,
    common.activity,
    {
      id: "bnot",
      label: "בנות צילה",
      icon: "heart",
      items: [
        leaf("challah", "הפרשת חלה", "wheat", "bnot", { tab: "challah", hint: "אירוע, הרשמה, הגעה ותיעוד" }),
        leaf("mitch-b", "מתחזקות", "heart", "bnot", { tab: "mitch", hint: "קשר מתמשך: שיחות, שלב ומעקב" }),
        leaf("bnot-members", "משתתפות", "users", "bnot", { tab: "members", hint: "לפי ערים וסניפים" }),
        leaf("bnot-acts", "פעילויות ונוכחות", "calendar", "bnot", { tab: "activities", hint: "מפגשים בסניפים ומי הגיעה" }),
        leaf("isha-req", "בקשות שיחה", "chat", "isha", { tab: "ishaRequest", badgeForms: ["ishaRequest"], hint: "אישה לאישה - שיבוץ מלווה" }),
        leaf("isha-mentors", "מלוות", "hands", "isha", { tab: "ishaMentor", badgeForms: ["ishaMentor"], hint: "מתנדבות שנרשמו ואושרו" }),
        leaf("org-bnot", "ערים, סניפים ורכזות", "pin", "org", { hint: "מבנה בנות צילה ומי אחראית על מה" }),
      ],
    },
    common.comm,
    manage,
  ];
}

/** המצבים שהמשתמש רשאי להם */
export function modesFor(me: Me): Mode[] {
  const v = me.user.views;
  const r = me.user.roles;
  const out: Mode[] = [];
  if (v.includes("kollel") || v.includes("payroll") || r.some((x) => x.startsWith("kollel_"))) out.push("boys");
  if (v.includes("isha") || r.some((x) => x.startsWith("bnot_"))) out.push("girls");
  return out.length ? out : ["boys"];
}

/** כפתורי-העל של המשתמש במצב הנוכחי, אחרי סינון הרשאות */
export function hubsFor(me: Me, mode: Mode): NavHub[] {
  const v = me.user.views;
  return tree(mode)
    .map((h) => ({ ...h, items: h.items.filter((i) => v.includes(i.view)) }))
    .filter((h) => h.items.length);
}

/** כל מה שאפשר לשים בשורה התחתונה: כפתורי-על, וגם קיצורים ישירים */
export function entriesFor(hubs: NavHub[]): NavEntry[] {
  const out: NavEntry[] = [];
  for (const h of hubs) {
    if (h.items.length === 1) out.push({ id: h.id, label: h.label, icon: h.icon, leaf: h.items[0] });
    else out.push({ id: h.id, label: h.label, icon: h.icon, hub: h });
  }
  for (const h of hubs) {
    if (h.items.length > 1) for (const i of h.items) out.push({ id: `leaf:${i.id}`, label: i.label, icon: i.icon, leaf: i });
  }
  return out;
}

/**
 * הסרגל התחתון מיועד לפעולות יומיומיות בלבד.
 * בקרן טללי ברכה נשארים 4 כפתורים מרכזיים; כל שאר האפשרויות זמינות בתפריט 3 הקווים.
 */
export const defaultBar = (entries: NavEntry[], mode: Mode) => {
  const mains = entries.filter((e) => !e.id.startsWith("leaf:"));
  if (mode === "boys") {
    const preferred = ["home", "kollel", "activity-center", "comm"];
    return preferred.filter((id) => mains.some((e) => e.id === id));
  }
  return mains.map((e) => e.id);
};

/** שמירת השורה התחתונה לכל משתמש ולכל מצב בנפרד (במכשיר) */
const key = (me: Me, mode: Mode) => `tb-bar-v2:${me.user.impersonatedBy ? "as:" : ""}${me.user.id}:${mode}`;
export function loadBar(me: Me, mode: Mode, entries: NavEntry[]): string[] {
  const mains = defaultBar(entries, mode);
  try {
    const raw = localStorage.getItem(key(me, mode));
    if (raw) {
      const saved = (JSON.parse(raw) as string[]).filter((id) => mains.includes(id));
      if (saved.length) return [...saved, ...mains.filter((id) => !saved.includes(id))];
    }
  } catch {
    /* אין אחסון - ברירת מחדל */
  }
  return mains;
}
export function saveBar(me: Me, mode: Mode, ids: string[] | null) {
  try {
    if (ids) localStorage.setItem(key(me, mode), JSON.stringify(ids));
    else localStorage.removeItem(key(me, mode));
  } catch {
    /* לא נשמר - לא קריטי */
  }
}

export function loadMode(me: Me, modes: Mode[]): Mode {
  try {
    const m = localStorage.getItem(`tb-mode:${me.user.id}`) as Mode | null;
    if (m && modes.includes(m)) return m;
  } catch {
    /* ברירת מחדל */
  }
  return modes[0];
}
export function saveMode(me: Me, mode: Mode) {
  try {
    localStorage.setItem(`tb-mode:${me.user.id}`, mode);
  } catch {
    /* לא קריטי */
  }
}

/** האם מסך שייך לכפתור (להדגשה בשורה) */
export function entryActive(e: NavEntry, screen: Screen): boolean {
  if ("hub" in screen) return Boolean(e.hub && e.hub.id === screen.hub);
  if (e.leaf) return e.leaf.view === screen.view && (!e.leaf.tab || !screen.tab || e.leaf.tab === screen.tab);
  return Boolean(e.hub?.items.some((i) => i.view === screen.view));
}

/** קבוצות תפוצה ששייכות למצב */
export function groupInMode(id: string, mode: Mode): boolean {
  const boys = id.startsWith("avrechim") || id.startsWith("staff:kollel");
  const girls = id === "mentors" || id === "updates" || id.startsWith("staff:bnot");
  if (boys) return mode === "boys";
  if (girls) return mode === "girls";
  return true;
}
