import test from "node:test";
import assert from "node:assert/strict";
import { handleMitch } from "./mitch.mjs";
import { enrichMitchRows, normalizeMitchConfig, summarizeAttention } from "./mitchWorkflow.mjs";

function storeOf(seed = {}) {
  const data = new Map(Object.entries(seed).map(([k, rows]) => [k, new Map((rows || []).map((x) => [x.id, x]))]));
  return {
    async list(name) { return [...(data.get(name)?.values() || [])]; },
    async get(name, id) { return data.get(name)?.get(id) || null; },
    async put(name, id, doc) {
      if (!data.has(name)) data.set(name, new Map());
      const row = { ...doc, id };
      data.get(name).set(id, row);
      return row;
    },
    async del(name, id) { data.get(name)?.delete(id); },
  };
}

test("attention rules detect unassigned, stale contact, stuck stage and missed meetings", async () => {
  const store = storeOf({
    kollelAttendance: [
      { id: "s3", branchId: "b1", date: "2026-10-24", mPresent: [] },
      { id: "s2", branchId: "b1", date: "2026-10-22", mPresent: [] },
      { id: "s1", branchId: "b1", date: "2026-10-20", mPresent: [] },
    ],
  });
  const config = normalizeMitchConfig("kollel", { attention: { contactDays: 7, stageDays: 20, missedMeetings: 3 } });
  const [row] = await enrichMitchRows(store, [{
    id: "m1",
    domain: "kollel",
    branchId: "b1",
    avrechId: null,
    status: "active",
    startDate: "2026-08-01",
    lastContact: "2026-10-01",
    stageChangedAt: "2026-09-01",
    log: [],
  }], "kollel", config);
  const ids = new Set(row.attention.map((x) => x.id));
  assert.equal(ids.has("unassigned"), true);
  assert.equal(ids.has("no_contact"), true);
  assert.equal(ids.has("stage_stuck"), true);
  assert.equal(ids.has("missed_meetings"), true);
  assert.equal(row.attentionLevel, "high");
  assert.equal(summarizeAttention([row]).total, 1);
});

test("transfer history endpoint is forbidden to non-developer users", async () => {
  const store = storeOf({ orgUnits: [], mitchTransfers: [{ id: "t1", mitchId: "m1", at: "2026-10-25T10:00:00Z" }] });
  let response;
  const handled = await handleMitch(
    { method: "GET" },
    {},
    new URL("http://local/api/mitch/transfers"),
    {
      user: { id: "u1", name: "רכז", roles: ["chief_coordinator"], views: ["kollel"], scope: {} },
      store,
      send(status, body) { response = { status, body }; },
      readBody: async () => ({}),
      audit: async () => {},
      clean: (v) => String(v || ""),
    },
  );
  assert.equal(handled, true);
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "מתכנת בלבד");
});

test("transfer history endpoint is available to developer", async () => {
  const store = storeOf({ orgUnits: [], mitchTransfers: [{ id: "t1", mitchId: "m1", at: "2026-10-25T10:00:00Z" }] });
  let response;
  const handled = await handleMitch(
    { method: "GET" },
    {},
    new URL("http://local/api/mitch/transfers"),
    {
      user: { id: "dev", name: "מתכנת", roles: ["developer"], views: ["kollel", "developer"], scope: {} },
      store,
      send(status, body) { response = { status, body }; },
      readBody: async () => ({}),
      audit: async () => {},
      clean: (v) => String(v || ""),
    },
  );
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.transfers.length, 1);
  assert.equal(response.body.transfers[0].id, "t1");
});
