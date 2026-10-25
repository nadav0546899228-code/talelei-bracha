/**
 * חישוב משכורת חודשית לכולל ערב - לפי הכללים הקבועים:
 * - בסיס "מלא" = 1,500 ₪ (ניתן לשינוי בהגדרות). סכום שונה / 0 - לפי הזנה בחודש.
 * - נסיעות: סכום קבוע חודשי לאברך + התאמות שמדווח רכז המשנה.
 * - הוצאות, בונוס, מענקים - תוספות; הורדות - הפחתה.
 * - שמחות: הולדת בת 10 ₪, הולדת בן 30 ₪, בר מצווה 50 ₪ - מורידים מכל חבר בקופה
 *   (כולל בעל השמחה), ובעל השמחה מקבל: תעריף × מספר החברים בקופה.
 *   אברך שההורדה שלו נגבית ממשכורת אחרת - נספר בקופה אבל לא יורד לו כאן.
 * - בעמודת "פירוט" רושמים רק תוספות מיוחדות. לעולם לא את המילה "מלא".
 */

export type Avrech = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subId?: string | null;
  branchId?: string | null;
  monthlyTravel: number;
  inPayroll: boolean;
  simchaFund: boolean;
  simchaExternal: boolean;
  active: boolean;
  notes?: string;
  /** פרטי תשלום - מגיעים מהשרת רק להנהלה */
  bank?: { idNumber: string; bankCode: string; branchCode: string; account: string; holder: string } | null;
};

export type EntryType = "travel" | "expense" | "bonus" | "grant" | "deduction" | "other";
export type BranchExpense = { id: string; month: string; branchId: string; amount: number; category: string; description: string; by: string; byName: string; createdAt?: string };
export const EXPENSE_CATEGORIES = ["כיבוד", "ספרים", "שכירות", "ציוד", "אירוע", "שונות"];
export type Entry = { id: string; avrechId: string; month: string; type: EntryType; amount: number; description: string; by: string; byName: string; createdAt: string };
export type Simcha = { id: string; celebrantId: string; type: "bat" | "ben" | "barmitzva"; note: string };
export type MonthRow = { base: number | null; travel: number | null; confirmed: boolean; note: string };
export type MonthDoc = { label: string; order: number; rows: Record<string, MonthRow>; extraIds: string[]; simchas: Simcha[]; locked: boolean; notes: string };
export type MasavSettings = { institutionCode: string; senderCode: string; institutionName: string };
export type KollelSettings = { fullBase: number; simchaRates: { bat: number; ben: number; barmitzva: number }; absenceRate?: number; masav?: MasavSettings };
export type AttendanceSession = { branchId: string; date: string; present: string[] };

export const ENTRY_LABELS: Record<EntryType, string> = {
  travel: "נסיעות",
  expense: "הוצאות",
  bonus: "בונוס",
  grant: "מענק",
  deduction: "הורדה",
  other: "זכות",
};

export const SIMCHA_LABELS = { bat: "הולדת הבת", ben: "הולדת הבן", barmitzva: "בר מצווה" } as const;

export type PayrollLine = {
  avrech: Avrech;
  base: number;
  isFull: boolean;
  travel: number;
  additions: { label: string; amount: number }[];
  total: number;
  detail: string;
  confirmed: boolean;
  note: string;
  /** נוכחות בחודש (רק אם סומנו מפגשים בסניף שלו) */
  attendance: { came: number; total: number } | null;
};

const fmt = (n: number) => n.toLocaleString("he-IL");

export function monthMembers(avrechim: Avrech[], month: MonthDoc | null): Avrech[] {
  const extra = new Set(month?.extraIds ?? []);
  return avrechim.filter((a) => (a.active && a.inPayroll) || extra.has(a.id));
}

export function computePayroll(avrechim: Avrech[], month: MonthDoc | null, entries: Entry[], s: KollelSettings, sessions: AttendanceSession[] = []): PayrollLine[] {
  const members = monthMembers(avrechim, month);
  const fund = members.filter((a) => a.simchaFund);
  const fundCount = fund.length;
  const simchas = month?.simchas ?? [];

  return members.map((a) => {
    const row = month?.rows[a.id];
    const base = row?.base ?? s.fullBase;
    const own = entries.filter((e) => e.avrechId === a.id);
    const travelAdj = own.filter((e) => e.type === "travel").reduce((t, e) => t + e.amount, 0);
    const travel = (row?.travel ?? a.monthlyTravel) + travelAdj;
    const additions: { label: string; amount: number }[] = [];
    if (travel) additions.push({ label: "נסיעות", amount: travel });
    for (const type of ["expense", "bonus", "grant", "other", "deduction"] as EntryType[]) {
      for (const e of own.filter((x) => x.type === type)) {
        additions.push({ label: e.description ? `${ENTRY_LABELS[type]} - ${e.description}` : ENTRY_LABELS[type], amount: e.amount });
      }
    }
    // שמחות
    if (a.simchaFund && !a.simchaExternal && simchas.length) {
      const out = simchas.reduce((t, x) => t + s.simchaRates[x.type], 0);
      if (out) additions.push({ label: "עבור שמחות", amount: -out });
    }
    for (const x of simchas.filter((x) => x.celebrantId === a.id)) {
      additions.push({ label: x.note || SIMCHA_LABELS[x.type], amount: s.simchaRates[x.type] * fundCount });
    }
    // נוכחות: הורדה ליום היעדרות רק אם הוגדר תעריף בהגדרות
    const mine = a.branchId ? sessions.filter((x) => x.branchId === a.branchId) : [];
    const came = mine.filter((x) => x.present.includes(a.id)).length;
    const missed = mine.length - came;
    if (missed > 0 && (s.absenceRate ?? 0) > 0) additions.push({ label: `היעדרות ${missed} ימים`, amount: -missed * (s.absenceRate ?? 0) });
    const total = base + additions.reduce((t, x) => t + x.amount, 0);
    // סימן LRM לפני המינוס כדי שיוצג נכון בתוך טקסט מימין לשמאל
    const detail = additions.map((x) => `${x.label} ${x.amount < 0 ? "\u200E-" : ""}${fmt(Math.abs(x.amount))}`).join(" · ");
    return { avrech: a, base, isFull: base === s.fullBase, travel, additions, total, detail, confirmed: Boolean(row?.confirmed), note: row?.note ?? "", attendance: mine.length ? { came, total: mine.length } : null };
  });
}

/** תווית חודש עברי לתאריך, למשל "חשון תשפ״ז" */
export function hebrewMonthLabel(d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", { month: "long", year: "numeric" }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year = Number(parts.find((p) => p.type === "year")?.value);
    return `${month} ${gem(year % 1000)}`;
  } catch {
    return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(d);
  }
}

function gem(n: number): string {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const hundreds = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
  let s = hundreds[Math.floor(n / 100)] ?? "";
  const r = n % 100;
  s += r === 15 ? "טו" : r === 16 ? "טז" : tens[Math.floor(r / 10)] + ones[r % 10];
  return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
}

/** מספר השנה העברית (למשל 5787) */
export function hebrewYearNum(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US-u-ca-hebrew", { year: "numeric" }).formatToParts(d).find((p) => p.type === "year")?.value || 0);
}
/** "תשפ״ז" משנה עברית מלאה */
export const hebrewYearLabel = (y: number) => gem(y % 1000);
/** השנה מתוך תווית חודש ("חשון תשפ״ז" → "תשפ״ז") */
export const yearOfMonthLabel = (label: string) => label.trim().split(/\s+/).pop() || "";

const yearMonthsCache = new Map<number, string[]>();
/** כל חודשי השנה העברית לפי הסדר (12, או 13 בשנה מעוברת) - באותו פורמט של hebrewMonthLabel */
export function hebrewYearMonthLabels(y: number): string[] {
  const hit = yearMonthsCache.get(y);
  if (hit) return hit;
  const out: string[] = [];
  const d = new Date(y - 3761, 7, 1, 12);
  for (let i = 0; i < 440; i++) {
    if (hebrewYearNum(d) === y) {
      const l = hebrewMonthLabel(d);
      if (out[out.length - 1] !== l) out.push(l);
    }
    d.setDate(d.getDate() + 1);
  }
  yearMonthsCache.set(y, out);
  return out;
}
