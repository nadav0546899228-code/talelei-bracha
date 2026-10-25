/** קריאות למערכת הניהול בשרת */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { body?: BodyInit | null } = {}): Promise<T> {
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
/** קורא ל-onData מיד עם מה ששמור (אם יש), ואחר כך שוב עם הנתונים העדכניים מהשרת */
export async function apiCached<T>(path: string, onData: (d: T) => void): Promise<T> {
  const key = cacheKey(path);
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
  const fresh = await api<T>(path);
  onData(fresh);
  if (cacheOwner) {
    mem.set(key, fresh);
    try {
      const raw = JSON.stringify(fresh);
      if (raw.length < 1_500_000) localStorage.setItem(key, raw);
    } catch {
      /* מקום מלא - נשאר רק בזיכרון */
    }
  }
  return fresh;
}

export const post = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });

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
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "כן" : "לא";
  return String(v ?? "");
}
