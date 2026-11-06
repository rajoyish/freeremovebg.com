import assert from "node:assert/strict";
import { test } from "node:test";
import { d1 } from "./d1.mjs";
import { reconciliationSql } from "../scripts/reconcile-edge-usage.mjs";
import { edgeStatus, markExhausted, reserveTransformation } from "../worker/edgeBudget.js";

const NOV = Date.parse("2026-11-06T10:00:00Z");
const DEC = Date.parse("2026-12-01T00:00:00Z");
const env = () => ({ DB: d1(), EDGE_MONTHLY_BUDGET: "13" });

test("reconciliation repairs the screenshot gap and subsequent uploads consume the corrected budget", async () => {
  const e = env();
  await reserveTransformation(e, NOV);
  const sql = reconciliationSql("2026-11", 1, 12);
  assert.equal(e.DB.db.prepare(sql).get().uploads, 12);
  assert.equal(e.DB.db.prepare(sql).get(), undefined, "replaying the repair does not add usage");
  assert.equal((await edgeStatus(e, NOV)).used, 12);
  assert.equal((await reserveTransformation(e, NOV)).used, 13);
  assert.equal((await reserveTransformation(e, NOV)).ok, false);
  assert.equal((await edgeStatus(e, DEC)).used, 0, "the correction applies only to November");
});

test("a concurrent upload prevents a stale snapshot from overwriting the counter", async () => {
  const e = env();
  await reserveTransformation(e, NOV);
  const sql = reconciliationSql("2026-11", 1, 12);
  await reserveTransformation(e, NOV);
  assert.equal(e.DB.db.prepare(sql).get(), undefined);
  assert.equal((await edgeStatus(e, NOV)).used, 2);
});

test("reconciliation preserves an exhausted month", async () => {
  const e = env();
  await reserveTransformation(e, NOV);
  await markExhausted(e, NOV);
  e.DB.db.prepare(reconciliationSql("2026-11", 1, 12)).get();
  assert.equal((await edgeStatus(e, NOV)).available, false);
});

test("invalid snapshots and reductions cannot generate a repair", () => {
  for (const month of [undefined, "2026-13", "2026-00", "2026-11' OR 1=1 --"]) {
    assert.throws(() => reconciliationSql(month, 1, 12));
  }
  for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => reconciliationSql("2026-11", count, 12));
    assert.throws(() => reconciliationSql("2026-11", 1, count));
  }
  assert.throws(() => reconciliationSql("2026-11", 12, 1));
});
