/**
 * קובץ זיכויים למס״ב (מרכז סליקה בנקאי) - פורמט קבוע של 128 תווים לשורה:
 * רשומת כותרת K, רשומת תנועה 1 לכל מוטב, רשומת סיכום 5, ושורת סיום של 9.
 * קידוד עברית: CP862 (DOS), טקסט עברי נכתב בסדר חזותי (הפוך) כמקובל בקבצי מס״ב.
 */
import type { MasavSettings } from "./kollelCalc";

export type MasavLine = { name: string; idNumber: string; bankCode: string; branchCode: string; account: string; amount: number; ref?: string };

const digits = (v: string | number, len: number) => String(v ?? "").replace(/\D/g, "").slice(-len).padStart(len, "0");
const isHeb = (c: string) => c >= "א" && c <= "ת";
/** טקסט חופשי בסדר חזותי, מיושר ימינה כמקובל */
const text = (v: string, len: number) => {
  let s = String(v || "").replace(/["'״׳]/g, "").replace(/\s+/g, " ").trim();
  if (/[א-ת]/.test(s)) s = [...s].reverse().join("");
  s = s.slice(0, len);
  return s.padEnd(len, " ");
};
const yymmdd = (d: Date) => `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const yymm = (d: Date) => `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;

export function buildMasav(cfg: MasavSettings, lines: MasavLine[], payDate: Date): { blob: Blob; total: number; count: number } {
  const inst = digits(cfg.institutionCode, 8);
  const sender = digits(cfg.senderCode || cfg.institutionCode.slice(0, 5), 5);
  const today = new Date();
  const pay = yymmdd(payDate);
  const period = `${yymm(payDate)}${yymm(payDate)}`;
  const rows: string[] = [];
  // K - כותרת
  rows.push(`K${inst}00${pay}0001${"0"}${yymmdd(today)}${sender}${"0".repeat(6)}${text(cfg.institutionName, 30)}${" ".repeat(56)}KOT`);
  let total = 0;
  for (const l of lines) {
    const ag = Math.round(l.amount * 100);
    total += ag;
    rows.push(
      `1${inst}00${"0".repeat(6)}${digits(l.bankCode, 2)}${digits(l.branchCode, 3)}0000${digits(l.account, 9)}0${digits(l.idNumber, 9)}${text(l.name, 16)}${String(ag).padStart(13, "0")}${text(l.ref || "", 20)}${period}000006${"0".repeat(18)}  `,
    );
  }
  // 5 - סיכום
  rows.push(`5${inst}00${pay}0001${String(total).padStart(15, "0")}${"0".repeat(15)}${String(lines.length).padStart(7, "0")}${"0".repeat(7)}${" ".repeat(63)}`);
  rows.push("9".repeat(128));
  const str = rows.join("\r\n") + "\r\n";
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    bytes[i] = isHeb(c) ? 0x80 + (c.charCodeAt(0) - 0x5d0) : c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 0x20;
  }
  return { blob: new Blob([bytes], { type: "text/plain" }), total: total / 100, count: lines.length };
}
