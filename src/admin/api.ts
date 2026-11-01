import { dtf } from "./dates";
/** קריאות למערכת הניהול בשרת */
import { newUndoId, showUndo } from "./undo";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** אותה פעולת שמירה שנשלחה פעמיים ברצף (לחיצה כפולה) - נשלחת לשרת פעם אחת בלבד */
const inflightWrites = new Map<string, Promise<unknown>>();

export async function api<T = unknown>(path: string, init: RequestInit & { body?: BodyInit | null } = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET") {
    const k = `${method} ${path} ${typeof init.body === "string" ? init.body : ""}`;
    const running = inflightWrites.get(k);
    if (running) return running as Promise<T>;
    const p = apiRaw<T>(path, init).finally(() => inflightWrites.delete(k));
    inflightWrites.set(k, p);
    return p;
  }
  // כמה מסכים שמבקשים את אותם נתונים באותו רגע (למשל אחרי עדכון חי) - בקשה אחת לשרת
  if (init.body || init.signal) return apiRaw<T>(path, init);
  let scope = "";
  try {
    scope = localStorage.getItem("tb-active-org-scope") || "";
  } catch {
    /* */
  }
  const k = `GET ${scope} ${path}`;
  const running = inflightGets.get(k);
  if (running) return running as Promise<T>;
  const p = apiRaw<T>(path, init).finally(() => inflightGets.delete(k));
  inflightGets.set(k, p);
  return p;
}
const inflightGets = new Map<string, Promise<unknown>>();

async function apiRaw<T>(path: string, init: RequestInit & { body?: BodyInit | null }): Promise<T> {
  let orgScope = "";
  try { orgScope = localStorage.getItem("tb-active-org-scope") || ""; } catch { /* localStorage לא זמין */ }
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(path.startsWith("/api/") && orgScope ? { "X-TB-Org-Scope": orgScope } : {}),
      ...init.headers,
    },
  });
  const isJson = res.headers.get("content-type")?.includes("json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `שגיאה ${res.status}`);
  return data as T;
}

/* ---------- פתיחה מהירה: מציגים מיד את הנתונים האחרונים מהמכשיר ומרעננים ברקע ---------- */
let cacheOwner = "";
const mem = new Map<string, unknown>();
/** מי מחובר (כולל "כניסה בשם") - כדי שלא יוצגו נתונים של משתמש אחר */
export function setCacheOwner(owner: string) {
  cacheOwner = owner;
}
export function clearApiCache() {
  mem.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("tbc:")) localStorage.removeItem(k);
  } catch {
    /* לא זמין */
  }
}
const cacheKey = (path: string) => {
  let scope = "";
  try { scope = localStorage.getItem("tb-active-org-scope") || ""; } catch { /* */ }
  return `tbc:${cacheOwner}:${scope}:${path}`;
};
/* מטמון במכשיר מוגבל בגודל: עד 8 מסכים אחרונים ו-3MB, הוותיקים נמחקים (אחרת הזיכרון במכשיר מתמלא תוך ימים) */
const INDEX_KEY = "tbc:index";
const MAX_ENTRIES = 8;
const MAX_TOTAL = 3_000_000;
function remember(key: string, raw: string) {
  try {
    let idx: { k: string; n: number }[] = [];
    try {
      idx = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
    } catch {
      idx = [];
    }
    idx = idx.filter((x) => x.k !== key);
    idx.push({ k: key, n: raw.length });
    let total = idx.reduce((t, x) => t + x.n, 0);
    while (idx.length > MAX_ENTRIES || total > MAX_TOTAL) {
      const old = idx.shift();
      if (!old) break;
      total -= old.n;
      localStorage.removeItem(old.k);
    }
    // ניקוי רשומות ישנות שלא במפתח (מגרסאות קודמות)
    const keep = new Set(idx.map((x) => x.k));
    for (const k of Object.keys(localStorage)) if (k.startsWith("tbc:") && k !== INDEX_KEY && !keep.has(k) && k !== key) localStorage.removeItem(k);
    localStorage.setItem(key, raw);
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* מקום מלא - נשאר רק בזיכרון */
  }
}
/** מפתח קבוע למסכים שהכתובת שלהם משתנה כל יום (טווח תאריכים) */
const stableKey = (path: string) => path.replace(/([?&])(from|to)=\d{4}-\d{2}-\d{2}/g, "$1$2=*");
const inflightReads = new Map<string, { p: Promise<unknown>; started: number }>();
const appliedAt = new Map<string, number>();
let reqCounter = 0;
const lastRaw = new Map<string, string>();

/** קורא ל-onData מיד עם מה ששמור (אם יש), ואחר כך שוב עם הנתונים העדכניים מהשרת */
export async function apiCached<T>(path: string, onData: (d: T) => void): Promise<T> {
  const key = cacheKey(stableKey(path));
  if (cacheOwner) {
    let hit = mem.get(key) as T | undefined;
    if (hit === undefined) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) hit = JSON.parse(raw) as T;
      } catch {
        /* */
      }
    }
    if (hit !== undefined) onData(hit);
  }
  // כמה מסכים שמבקשים את אותם נתונים באותו רגע - בקשה אחת לשרת
  let entry = inflightReads.get(path);
  if (!entry) {
    const started = ++reqCounter;
    entry = { started, p: api<T>(path).finally(() => inflightReads.delete(path)) };
    inflightReads.set(path, entry);
  }
  const fresh = (await entry.p) as T;
  // תשובה לבקשה ישנה שהגיעה אחרי תשובה חדשה יותר - לא דורסת את המסך
  if (entry.started >= (appliedAt.get(key) || 0)) {
    appliedAt.set(key, entry.started);
    onData(fresh);
  }
  if (cacheOwner) {
    mem.set(key, fresh);
    const write = () => {
      try {
        const raw = JSON.stringify(fresh);
        if (raw === lastRaw.get(key)) return;
        lastRaw.set(key, raw);
        if (raw.length < 1_500_000) remember(key, raw);
      } catch {
        /* */
      }
    };
    // שמירה במכשיר כשהדפדפן פנוי - לא מעכב את המסך
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(write);
    else window.setTimeout(write, 200);
  }
  return fresh;
}

export const post = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
/** מחיקה מהמסך - אחריה מוצגת הודעת "נמחק · בטל" */
const inflightDeletes = new Map<string, Promise<unknown>>();
export const del = <T = unknown>(path: string): Promise<T> => {
  const running = inflightDeletes.get(path);
  if (running) return running as Promise<T>;
  const undoId = newUndoId();
  const p = apiRaw<T>(path, { method: "DELETE", headers: { "X-Undo-Id": undoId } })
    .then((r) => {
      showUndo(undoId, (id) => api("/api/undo", { method: "POST", body: JSON.stringify({ id }) }));
      return r;
    })
    .finally(() => inflightDeletes.delete(path));
  inflightDeletes.set(path, p);
  return p;
};

/* ---------- טיפוסים ---------- */

export type View = "dashboard" | "smart" | "activity" | "messages" | "isha" | "bnot" | "inquiries" | "kollel" | "payroll" | "reports" | "org" | "broadcast" | "donations" | "content" | "users" | "audit" | "developer";
export type Role =
  | "developer"
  | "ceo"
  | "chief_coordinator"
  | "kollel_region"
  | "bnot_region"
  | "kollel_city"
  | "kollel_branch"
  | "bnot_city"
  | "bnot_branch"
  | "bnot_caller"
  | "isha_coordinator"
  | "office"
  | "content_editor";

export type Domain = "kollel" | "bnot";
export type Scope = Partial<Record<Domain, { regionId?: string; cityId?: string; branchId?: string }>>;

export type Me = {
  user: {
    id: string;
    kind: "google" | "phone" | "virtual";
    email: string;
    phone?: string;
    subId?: string;
    name: string;
    picture: string;
    roles: Role[];
    scope?: Scope;
    views: View[];
    bootstrap: boolean;
    impersonatedBy?: { id: string; name: string; email: string; phone: string };
  };
  account?: {
    id: string;
    kind: "google" | "phone" | "virtual";
    email: string;
    phone?: string;
    subId?: string;
    name: string;
    picture: string;
    roles: Role[];
    scope?: Scope;
    views: View[];
    bootstrap: boolean;
  };
  roleLabels: Record<Role, string>;
  viewLabels: Record<View, string>;
  assignableRoles: Role[];
  mustChangeCode: boolean;
  canImpersonate: boolean;
  featureFlags?: { donations: boolean };
};

/** תפקידים שמשויכים לעיר או לסניף (זהה לשרת) */
export const ROLE_SCOPE: Partial<Record<Role, { domain: Domain; level: "region" | "city" | "branch" }>> = {
  kollel_region: { domain: "kollel", level: "region" },
  bnot_region: { domain: "bnot", level: "region" },
  kollel_city: { domain: "kollel", level: "city" },
  kollel_branch: { domain: "kollel", level: "branch" },
  bnot_city: { domain: "bnot", level: "city" },
  bnot_branch: { domain: "bnot", level: "branch" },
  bnot_caller: { domain: "bnot", level: "branch" },
};

export const DOMAIN_LABELS: Record<Domain, string> = { kollel: "כולל ערב", bnot: "בנות צילה" };

export type OrgUnit = { id: string; type: "region" | "city" | "branch"; domain: Domain; name: string; parentId: string | null; lat?: number; lng?: number };

export type Submission = {
  id: string;
  form: FormKey;
  data: Record<string, string | string[] | boolean>;
  status: Status;
  notes: { at: string; by: string; text: string }[];
  assignedMentorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FormKey = "ishaRequest" | "ishaMentor" | "contact" | "volunteer" | "updates" | "assistance";
export type Status = "new" | "in_progress" | "done" | "archived" | "approved" | "rejected";

export const FORM_LABELS: Record<FormKey, string> = {
  ishaRequest: "בקשות שיחה",
  ishaMentor: "מלוות",
  contact: "צור קשר",
  volunteer: "התנדבות",
  updates: "עדכונים",
  assistance: "בקשות סיוע",
};

export const STATUS_LABELS: Record<Status, string> = {
  new: "חדשה",
  in_progress: "בטיפול",
  done: "טופלה",
  archived: "בארכיון",
  approved: "מאושרת",
  rejected: "לא מתאימה",
};

export const STATUS_FLOW: Record<FormKey, Status[]> = {
  ishaRequest: ["new", "in_progress", "done", "archived"],
  ishaMentor: ["new", "in_progress", "approved", "rejected", "archived"],
  contact: ["new", "in_progress", "done", "archived"],
  volunteer: ["new", "in_progress", "done", "archived"],
  updates: ["new", "done", "archived"],
  assistance: ["new", "in_progress", "done", "archived"],
};

export const FIELD_LABELS: Record<string, string> = {
  name: "שם",
  fullName: "שם מלא",
  phone: "טלפון",
  email: "מייל",
  contactMethod: "דרך חזרה",
  bestTime: "זמן נוח",
  note: "הערה",
  community: "שיוך / קהילה",
  availability: "זמינות",
  languages: "שפות",
  experience: "ניסיון",
  subject: "נושא",
  message: "הודעה",
  interest: "תחומי עניין",
  topics: "נושאים",
  consent: "אישור",
};

export function displayName(s: Submission): string {
  const v = s.data.fullName || s.data.name;
  return typeof v === "string" && v ? v : "ללא שם";
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return dtf("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "כן" : "לא";
  return String(v ?? "");
}
