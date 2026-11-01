/** תאריכים לפי שעון ישראל (toISOString נותן תאריך UTC - אחרי חצות יוצא "אתמול") */
const IL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD של היום (או של תאריך נתון) לפי שעון ישראל */
export const ilDay = (d: Date = new Date()) => IL.format(d);

/** YYYY-MM-DD בעוד n ימים לפי שעון ישראל */
export const ilDayPlus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return IL.format(d);
};

/** מחרוזת תאריך נשארת כמו שהיא; חותמת זמן מלאה מומרת ליום בישראל */
export const ilDayOf = (iso: string | null | undefined) => {
  const t = String(iso || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : IL.format(d);
};

/** יצירת פורמט תאריך היא פעולה יקרה - כל פורמט נוצר פעם אחת ונשמר (בתצוגת שנה זה החיסכון בין שניות לרגע) */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function dtf(locale: string, opts: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const k = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    fmtCache.set(k, f);
  }
  return f;
}
