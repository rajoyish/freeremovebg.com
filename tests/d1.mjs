import { DatabaseSync } from "node:sqlite";

// Exercise Worker queries against SQLite, including an initially absent table.
export function d1() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...values) => { args = values; return stmt; },
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => { db.prepare(sql).run(...args); return { success: true }; },
      };
      return stmt;
    },
  };
}
