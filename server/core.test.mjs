/**
 * בדיקות ליבה: כניסה בטלפון ונעילה, עדכון אטומי במסד, ניקוי נתוני דמה.
 * הרצה: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as phone from "./phoneAuth.mjs";

test("טלפון: נרמול ותקינות", () => {
  assert.equal(phone.normalizePhone("+972-52-123-4567"), "0521234567");
  assert.equal(phone.validPhone("0521234567"), true);
  assert.equal(phone.validPhone("052123456"), false);
  assert.equal(phone.validCode("1234"), true);
  assert.equal(phone.validCode("12a4"), false);
});

test("קוד: גיבוב ואימות", () => {
  const h = phone.hashCode("246810");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(phone.checkCode("246810", h), true);
  assert.equal(phone.checkCode("246811", h), false);
  assert.equal(phone.checkCode("246810", "garbage"), false);
});

test("נעילה: 5 כישלונות ← 15 דקות, 5 נעילות ← קבועה, שחרור מאפס", () => {
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  let u = { id: "x" };
  for (let i = 0; i < 4; i++) u = phone.registerFail(u, t0);
  assert.equal(phone.lockState(u, t0).locked, false);
  u = phone.registerFail(u, t0);
  const st = phone.lockState(u, t0);
  assert.equal(st.locked, true);
  assert.equal(st.permanent, false);
  assert.equal(st.minutes, 15);
  assert.equal(phone.lockState(u, t0 + 16 * 60000).locked, false);
  // עוד 4 נעילות בתוך החלון ← נעילה קבועה
  let t = t0;
  for (let k = 0; k < 4; k++) {
    t += 20 * 60000;
    for (let i = 0; i < 5; i++) u = phone.registerFail(u, t);
  }
  assert.equal(phone.lockState(u, t).permanent, true);
  u = phone.unlock(u);
  assert.equal(phone.lockState(u, t).locked, false);
  assert.deepEqual(u.lockEvents, []);
});

test("נעילות ישנות מעל 30 יום לא נספרות", () => {
  const t0 = Date.parse("2026-01-01T10:00:00Z");
  let u = { id: "y", lockEvents: Array.from({ length: 4 }, () => new Date(t0).toISOString()) };
  const later = t0 + 31 * 86400000;
  for (let i = 0; i < 5; i++) u = phone.registerFail(u, later);
  assert.equal(phone.lockState(u, later).permanent, false);
  assert.equal(u.lockEvents.length, 1);
});

test("מסד קובץ: עדכון אטומי לא מאבד רישומים במקביל", async () => {
  process.env.DATABASE_URL = "";
  process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), "tb-")), "db.json");
  const { createStore } = await import("./store.mjs");
  const store = await createStore();
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      store.update("kollelAttendance", "b1_2026-11-01", (cur) => ({ ...(cur || {}), present: [...(cur?.present || []), `av${i}`] })),
    ),
  );
  const doc = await store.get("kollelAttendance", "b1_2026-11-01");
  assert.equal(doc.present.length, 25);
  // fn שמחזיר null - לא נשמר כלום
  await store.update("kollelAttendance", "nothing", () => null);
  assert.equal(await store.get("kollelAttendance", "nothing"), null);
  // שינוי של אובייקט שהוחזר לא משנה את המסד
  const [row] = await store.list("kollelAttendance");
  row.present.push("hacked");
  assert.equal((await store.get("kollelAttendance", "b1_2026-11-01")).present.length, 25);
});

test("ניקוי דמה מוחק רק רשומות דמה", async () => {
  process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), "tb-")), "db.json");
  const { createStore } = await import(`./store.mjs?x=${Date.now()}`);
  const store = await createStore();
  const { clearDemo } = await import("./demoSeed.mjs");
  await store.put("avrechim", "demo-1", { name: "דמה", demo: true });
  await store.put("avrechim", "real-1", { name: "אמיתי" });
  await store.put("avrechim", "x", { name: "מסומן", demo: true });
  const n = await clearDemo(store, ["avrechim"]);
  assert.equal(n, 2);
  const left = await store.list("avrechim");
  assert.deepEqual(left.map((x) => x.id), ["real-1"]);
});
