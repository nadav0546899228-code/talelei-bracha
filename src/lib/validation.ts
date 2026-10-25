/** כללי ולידציה לטפסים */

export type Rule = (value: string) => string | null;

export const required =
  (msg = "שדה חובה"): Rule =>
  (v) =>
    v.trim() ? null : msg;

export const maxLen =
  (n: number): Rule =>
  (v) =>
    v.length > n ? `עד ${n} תווים` : null;

/** טלפון ישראלי: נייד/קווי, עם או בלי מקפים, או בפורמט +972 */
export const israeliPhone: Rule = (v) => {
  if (!v.trim()) return null;
  const digits = v.replace(/[\s\-()]/g, "");
  const ok = /^(?:\+?972|0)(?:[23489]\d{7}|5\d{8}|7\d{8})$/.test(digits);
  return ok ? null : "מספר טלפון לא תקין";
};

export const email: Rule = (v) => {
  if (!v.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : "כתובת מייל לא תקינה";
};

export function validate(value: string, rules: Rule[]): string | null {
  for (const r of rules) {
    const err = r(value);
    if (err) return err;
  }
  return null;
}
