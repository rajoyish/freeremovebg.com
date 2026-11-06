import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "./index.js";
import { toolOf } from "./toolCounts.js";

// D1-shaped wrapper over real SQLite, with the homepage's stats row in place
// and tool_counts missing, as in production before the first tool image.
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE stats (id INTEGER PRIMARY KEY, total_cutouts INTEGER NOT NULL)");
  db.exec("INSERT INTO stats VALUES (1, 23443)");
  return {
    db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => { args = a; return stmt; },
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => { db.prepare(sql).run(...args); return { success: true }; },
      };
      return stmt;
    },
  };
}

const ORIGIN = "https://freeremovebg.com";
const env = () => ({ ASSETS: { fetch: () => new Response("ASSET") }, DB: d1() });

const get = (e, query = "") =>
  worker.fetch(new Request(`https://freeremovebg.com/api/count${query}`), e, {}).then((r) => r.json());
const post = (e, body, origin = ORIGIN) =>
  worker.fetch(new Request("https://freeremovebg.com/api/count", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: origin },
  }), e, {});

test("only the two tools are accepted", () => {
  assert.equal(toolOf("convert"), "convert");
  assert.equal(toolOf("optimize"), "optimize");
  assert.equal(toolOf("stats"), null);
  assert.equal(toolOf(undefined), null);
});

test("each tool keeps its own total, separate from cutouts", async () => {
  const e = env();
  assert.equal((await get(e, "?tool=convert")).count, 0, "starts at 0 with no table yet");

  assert.equal((await (await post(e, { count: 3, tool: "convert" })).json()).count, 3);
  assert.equal((await (await post(e, { count: 2, tool: "convert" })).json()).count, 5);
  assert.equal((await (await post(e, { count: 7, tool: "optimize" })).json()).count, 7);

  assert.equal((await get(e, "?tool=convert")).count, 5);
  assert.equal((await get(e, "?tool=optimize")).count, 7);
  assert.equal((await get(e)).count, 23443, "homepage cutouts untouched");
});

test("requests without a known tool still count cutouts", async () => {
  const e = env();
  assert.equal((await (await post(e, { count: 1 })).json()).count, 23444);
  assert.equal((await (await post(e, { count: 1, tool: "bogus" })).json()).count, 23445);
  assert.equal((await get(e, "?tool=bogus")).count, 23445);
});

test("tool counts keep the cutout counter's guards", async () => {
  const e = env();
  assert.equal((await post(e, { count: 1, tool: "convert" }, "https://evil.example")).status, 403);
  assert.equal((await post(e, { count: 0, tool: "convert" })).status, 400);
  assert.equal((await (await post(e, { count: 500, tool: "optimize" })).json()).count, 50, "capped per request");
});
