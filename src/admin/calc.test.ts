/**
 * בדיקות חישוב משכורות וקובץ מס״ב.
 * הרצה: npm test  (Node עם --experimental-strip-types)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePayroll, hebrewYearMonthLabels, type Avrech, type KollelSettings, type MonthDoc } from "./kollelCalc.ts";
import { buildMasav } from "./masav.ts";

const S: KollelSettings = { fullBase: 1500, simchaRates: { bat: 10, ben: 30, barmitzva: 50 }, absenceRate: 20 };
const av = (id: string, extra: Partial<Avrech> = {}): Avrech => ({
  id, name: id, phone: "", monthlyTravel: 0, inPayroll: true, simchaFund: true, simchaExternal: false, active: true, branchId: "b1", ...extra,
});
const month = (extra: Partial<MonthDoc> = {}): MonthDoc => ({ label: "חשון תשפ״ז", order: 1, rows: {}, extraIds: [], simchas: [], locked: false, notes: "", ...extra });

test("בסיס מלא + נסיעות + חריגים", () => {
  const [l] = computePayroll([av("a", { monthlyTravel: 120 })], month(), [
    { id: "e1", avrechId: "a", month: "m", type: "bonus", amount: 100, description: "", by: "", byName: "", createdAt: "" },
    { id: "e2", avrechId: "a", month: "m", type: "deduction", amount: -50, description: "", by: "", byName: "", createdAt: "" },
  ], S);
  assert.equal(l.total, 1500 + 120 + 100 - 50);
  assert.equal(l.isFull, true);
});

test("שמחה: כל חברי הקופה משלמים, בעל השמחה מקבל תעריף × חברים", () => {
  const list = [av("a"), av("b"), av("c"), av("d", { simchaFund: false })];
  const lines = computePayroll(list, month({ simchas: [{ id: "s", celebrantId: "a", type: "ben", note: "" }] }), [], S);
  const by = Object.fromEntries(lines.map((l) => [l.avrech.id, l.total]));
  assert.equal(by.a, 1500 - 30 + 30 * 3);
  assert.equal(by.b, 1500 - 30);
  assert.equal(by.d, 1500);
});

test("היעדרות: מפגשים לפני ההצטרפות לא נספרים", () => {
  const sessions = [
    { branchId: "b1", date: "2026-10-20", present: [] },
    { branchId: "b1", date: "2026-10-27", present: [] },
    { branchId: "b1", date: "2026-11-03", present: ["a"] },
  ];
  const [l] = computePayroll([av("a", { createdAt: "2026-10-25T08:00:00Z" })], month(), [], S, sessions);
  assert.deepEqual(l.attendance, { came: 1, total: 2 });
  assert.equal(l.total, 1500 - 20);
});

test("חודשי שנה עברית: 12 או 13", () => {
  assert.equal(hebrewYearMonthLabels(5785).length, 12);
  assert.equal(hebrewYearMonthLabels(5787).length, 13);
});

const cfg = { institutionCode: "12345678", senderCode: "12345", institutionName: "קרן טללי ברכה" };

test("מס״ב: כל שורה 128 תווים, סה״כ באגורות", async () => {
  const r = buildMasav(cfg, [
    { name: "ישראל כהן", idNumber: "123456782", bankCode: "12", branchCode: "345", account: "123456", amount: 1570.5 },
    { name: "משה לוי", idNumber: "023456789", bankCode: "10", branchCode: "800", account: "99887766", amount: 1500 },
  ], new Date(2026, 10, 10, 12));
  const text = Buffer.from(await r.blob.arrayBuffer()).toString("latin1");
  const rows = text.split("\r\n").filter(Boolean);
  assert.equal(rows.length, 5);
  for (const row of rows) assert.equal(row.length, 128);
  assert.equal(r.total, 3070.5);
  assert.ok(rows[3].includes(String(307050).padStart(15, "0")));
});

test("מס״ב: סכום אפס או מינוס נחסם", () => {
  assert.throws(() => buildMasav(cfg, [{ name: "א", idNumber: "1", bankCode: "1", branchCode: "1", account: "1", amount: -10 }], new Date()));
  assert.throws(() => buildMasav(cfg, [{ name: "א", idNumber: "1", bankCode: "1", branchCode: "1", account: "1", amount: 0 }], new Date()));
});

test("מס״ב: מספרים בשם לא מתהפכים", async () => {
  const r = buildMasav(cfg, [{ name: "סניף 12", idNumber: "1", bankCode: "1", branchCode: "1", account: "1", amount: 1 }], new Date(2026, 0, 1));
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  const line = Buffer.from(bytes).toString("latin1").split("\r\n")[1];
  assert.ok(line.includes("12 "), "הספרות נשארות 12 ולא 21");
});
