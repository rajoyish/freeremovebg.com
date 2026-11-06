import assert from "node:assert/strict";
import { test } from "node:test";
import { d1 } from "../tests/d1.mjs";
import worker from "./index.js";
import { budgetOf, edgeStatus, markExhausted, monthKey, nextMonthStart, releaseTransformation, reserveTransformation } from "./edgeBudget.js";
import { handleEdgeStatus, handleUpload } from "./upload.js";

const NOV = Date.parse("2026-11-06T10:00:00Z");
const DEC = Date.parse("2026-12-01T00:00:01Z");
const ORIGIN = "https://freeremovebg.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) { objects.set(key, value); },
    async delete(key) { objects.delete(key); },
    async head(key) { return objects.has(key) ? { key } : null; },
  };
}

const env = (over = {}) => ({
  DB: d1(),
  TEMP_BUCKET: bucket(),
  TEMP_PUBLIC_URL: "https://temp.freeremovebg.com",
  EDGE_MONTHLY_BUDGET: "3",
  ...over,
});

function upload() {
  const form = new FormData();
  form.append("file", new File([PNG], "a.png", { type: "image/png" }));
  return new Request("https://freeremovebg.com/api/upload-temp", { method: "POST", body: form, headers: { Origin: ORIGIN } });
}

const statusReq = (body) => new Request("https://freeremovebg.com/api/edge-status", body === undefined
  ? {}
  : { method: "POST", body: JSON.stringify(body), headers: { Origin: ORIGIN, "Content-Type": "application/json" } });

test("months are UTC calendar months and reopen on the 1st", () => {
  assert.equal(monthKey(NOV), "2026-11");
  assert.equal(monthKey(Date.parse("2026-11-30T23:59:59Z")), "2026-11");
  assert.equal(nextMonthStart(NOV), "2026-12-01T00:00:00.000Z");
  assert.equal(nextMonthStart(Date.parse("2026-12-15T00:00:00Z")), "2027-01-01T00:00:00.000Z");
});

test("budget defaults to 4,900 and accepts 0 to switch the edge off", () => {
  assert.equal(budgetOf({}), 4900);
  assert.equal(budgetOf({ EDGE_MONTHLY_BUDGET: "5000" }), 5000);
  assert.equal(budgetOf({ EDGE_MONTHLY_BUDGET: "0" }), 0);
  assert.equal(budgetOf({ EDGE_MONTHLY_BUDGET: "lots" }), 4900);
});

test("reservations stop at the budget and resume next month", async () => {
  const e = env();
  const claims = [];
  for (let i = 0; i < 5; i++) claims.push((await reserveTransformation(e, NOV)).ok);
  assert.deepEqual(claims, [true, true, true, false, false]);

  const nov = await edgeStatus(e, NOV);
  assert.equal(nov.available, false);
  assert.equal(nov.used, 3);
  assert.equal(nov.resumeAt, "2026-12-01T00:00:00.000Z");

  const dec = await edgeStatus(e, DEC);
  assert.equal(dec.available, true);
  assert.equal(dec.used, 0);
  assert.equal((await reserveTransformation(e, DEC)).ok, true);
});

test("a reported 9422 closes the month even under budget", async () => {
  const e = env({ EDGE_MONTHLY_BUDGET: "4900" });
  await reserveTransformation(e, NOV);
  await markExhausted(e, NOV);
  assert.equal((await edgeStatus(e, NOV)).available, false);
  assert.equal((await reserveTransformation(e, NOV)).ok, false);
  assert.equal((await edgeStatus(e, DEC)).available, true, "next month starts fresh");
});

test("uploads are refused with resumeAt once the month is used up", async () => {
  const e = env({ EDGE_MONTHLY_BUDGET: "2" });
  assert.equal((await handleUpload(upload(), e, NOV)).status, 201);
  assert.equal((await handleUpload(upload(), e, NOV)).status, 201);
  const refused = await handleUpload(upload(), e, NOV);
  assert.equal(refused.status, 503);
  const body = await refused.json();
  assert.equal(body.error, "quota_exhausted");
  assert.equal(body.resumeAt, "2026-12-01T00:00:00.000Z");
  assert.equal(e.TEMP_BUCKET.objects.size, 2, "nothing stored for the refused upload");
  assert.equal((await handleUpload(upload(), e, DEC)).status, 201, "December reopens");
});

test("missing or broken accounting sends processing to the browser without uploads", async () => {
  const broken = { prepare() { throw new Error("D1 down"); } };
  for (const DB of [undefined, broken]) {
    const e = env({ DB });
    const res = await handleUpload(upload(), e, NOV);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "budget_unavailable");
    assert.equal(e.TEMP_BUCKET.objects.size, 0);
    const status = await (await handleEdgeStatus(statusReq(), e, NOV)).json();
    assert.equal(status.available, false);
    assert.equal(status.resumeAt, null, "an outage must not close the entire month");
  }
});

test("a failed R2 write releases its reservation and leaves room for a retry", async () => {
  const e = env({ EDGE_MONTHLY_BUDGET: "1" });
  const put = e.TEMP_BUCKET.put;
  e.TEMP_BUCKET.put = async () => { throw new Error("R2 down"); };
  assert.equal((await handleUpload(upload(), e, NOV)).status, 500);
  assert.equal((await edgeStatus(e, NOV)).used, 0);
  e.TEMP_BUCKET.put = put;
  assert.equal((await handleUpload(upload(), e, NOV)).status, 201);
  assert.equal((await edgeStatus(e, NOV)).used, 1);
});

test("release uses the reserved month and preserves exhaustion and other months", async () => {
  const e = env();
  await reserveTransformation(e, NOV);
  await reserveTransformation(e, DEC);
  await markExhausted(e, NOV);
  await releaseTransformation(e, NOV);
  assert.equal((await edgeStatus(e, NOV)).used, 0);
  assert.equal((await edgeStatus(e, NOV)).available, false);
  assert.equal((await edgeStatus(e, DEC)).used, 1);
});

test("deleting a source does not refund a transformation reservation", async () => {
  const e = env();
  const { key } = await (await handleUpload(upload(), e, NOV)).json();
  const request = new Request(`${ORIGIN}/api/upload-temp?key=${key}`, {
    method: "DELETE", headers: { Origin: ORIGIN },
  });
  assert.equal((await handleUpload(request, e, NOV)).status, 204);
  assert.equal((await edgeStatus(e, NOV)).used, 1);
});

test("GET /api/edge-status reports the month", async () => {
  const e = env();
  const open = await (await handleEdgeStatus(statusReq(), e, NOV)).json();
  assert.equal(open.available, true);
  assert.equal(open.budget, 3);
  assert.equal(open.estimated, true);

  const unconfigured = await (await handleEdgeStatus(statusReq(), env({ TEMP_PUBLIC_URL: "" }), NOV)).json();
  assert.equal(unconfigured.available, false);
});

test("a 9422 report needs a real temp object behind it", async () => {
  const e = env({ EDGE_MONTHLY_BUDGET: "4900" });
  const res = await handleUpload(upload(), e, NOV);
  const { key } = await res.json();

  assert.equal((await handleEdgeStatus(statusReq({ code: "9422", key: "tmp/2026-11-06/00000000-0000-4000-8000-000000000000.png" }), e, NOV)).status, 404);
  assert.equal((await handleEdgeStatus(statusReq({ code: "9520", key }), e, NOV)).status, 400);
  assert.equal((await edgeStatus(e, NOV)).available, true, "rejected reports change nothing");

  const forged = new Request("https://freeremovebg.com/api/edge-status", {
    method: "POST", body: JSON.stringify({ code: "9422", key }), headers: { Origin: "https://evil.example" },
  });
  assert.equal((await handleEdgeStatus(forged, e, NOV)).status, 403);

  const ok = await handleEdgeStatus(statusReq({ code: "9422", key }), e, NOV);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).available, false);
});

test("the worker routes /api/edge-status", async () => {
  const res = await worker.fetch(statusReq(), { ASSETS: { fetch: () => new Response("ASSET") }, ...env() }, {});
  assert.equal(res.status, 200);
  assert.equal(typeof (await res.json()).available, "boolean");
});
