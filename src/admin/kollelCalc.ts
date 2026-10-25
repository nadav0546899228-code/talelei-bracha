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
};

export type EntryType = "travel" | "expense" | "bonus" | "grant" | "deduction";
export type Entry = { id: string; avrechId: string; month: string; type: EntryType; amount: number; description: string; by: string; byName: string; createdAt: string };
export type Simcha = { id: string; celebrantId: string; type: "bat" | "ben" | "barmitzva"; note: string };
export type MonthRow = { base: number | null; travel: number | null; confirmed: boolean; note: string };
export type MonthDoc = { label: string; order: number; rows: Record<string, MonthRow>; extraIds: string[]; simchas: Simcha[]; locked: boolean; notes: string };
export type KollelSettings = { fullBase: number; simchaRates: { bat: number; ben: number; barmitzva: number } };

export const ENTRY_LABELS: Record<EntryType, string> = {
  travel: "נסיעות",
  expense: "הוצאות",
  bonus: "בונוס",
  grant: "מענק",
  deduction: "הורדה",
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
};

const fmt = (n: number) => n.toLocaleString("he-IL");

export function monthMembers(avrechim: Avrech[], month: MonthDoc | null): Avrech[] {
  const extra = new Set(month?.extraIds ?? []);
  return avrechim.filter((a) => (a.active && a.inPayroll) || extra.has(a.id));
}

export function computePayroll(avrechim: Avrech[], month: MonthDoc | null, entries: Entry[], s: KollelSettings): PayrollLine[] {
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
    for (const type of ["expense", "bonus", "grant", "deduction"] as EntryType[]) {
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
    const total = base + additions.reduce((t, x) => t + x.amount, 0);
    // סימן LRM לפני המינוס כדי שיוצג נכון בתוך טקסט מימין לשמאל
    const detail = additions.map((x) => `${x.label} ${x.amount < 0 ? "\u200E-" : ""}${fmt(Math.abs(x.amount))}`).join(" · ");
    return { avrech: a, base, isFull: base === s.fullBase, travel, additions, total, detail, confirmed: Boolean(row?.confirmed), note: row?.note ?? "" };
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
