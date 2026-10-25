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
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const isJson = res.headers.get("content-type")?.includes("json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `שגיאה ${res.status}`);
  return data as T;
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
  | "kollel_city"
  | "kollel_branch"
  | "bnot_city"
  | "bnot_branch"
  | "isha_coordinator"
  | "office"
  | "content_editor";

export type Domain = "kollel" | "bnot";
export type Scope = Partial<Record<Domain, { cityId?: string; branchId?: string }>>;

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
};

/** תפקידים שמשויכים לעיר או לסניף (זהה לשרת) */
export const ROLE_SCOPE: Partial<Record<Role, { domain: Domain; level: "city" | "branch" }>> = {
  kollel_city: { domain: "kollel", level: "city" },
  kollel_branch: { domain: "kollel", level: "branch" },
  bnot_city: { domain: "bnot", level: "city" },
  bnot_branch: { domain: "bnot", level: "branch" },
};

export const DOMAIN_LABELS: Record<Domain, string> = { kollel: "כולל ערב", bnot: "בנות צילה" };

export type OrgUnit = { id: string; type: "city" | "branch"; domain: Domain; name: string; parentId: string | null };

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
