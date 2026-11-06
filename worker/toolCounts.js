// ---------------------------------------------------------------------------
// Per-tool "images processed" totals for /convert and /optimize, served
// through the same /api/count endpoint as the cutout counter:
//
//   GET  /api/count?tool=convert           -> { count }
//   POST /api/count  { count, token, tool } -> { count }
//
// One row per tool. A request without `tool` still reads and writes the
// original stats.total_cutouts row, so the homepage counter is unchanged.
// Every image counts once it is finished, whichever engine produced it (the
// edge or the visitor's device).
//
// The table creates itself on first use, so there is no migration to run.
// ---------------------------------------------------------------------------

export const TOOLS = ["convert", "optimize"];

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS tool_counts (
  tool TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0
)`;

/** The tool named in a request, or null for the cutout counter. */
export function toolOf(value) {
  return TOOLS.includes(value) ? value : null;
}

async function withTable(db, query) {
  try {
    return await query();
  } catch (error) {
    if (!/no such table/i.test(String(error?.message))) throw error;
    await db.prepare(TABLE_SQL).run();
    return query();
  }
}

export async function readToolCount(db, tool) {
  const row = await withTable(db, () =>
    db.prepare("SELECT total FROM tool_counts WHERE tool = ?").bind(tool).first(),
  );
  return row?.total ?? 0;
}

export async function addToolCount(db, tool, inc) {
  const row = await withTable(db, () =>
    db.prepare(
      `INSERT INTO tool_counts (tool, total) VALUES (?, ?)
       ON CONFLICT(tool) DO UPDATE SET total = total + excluded.total
       RETURNING total`,
    )
      .bind(tool, inc)
      .first(),
  );
  return row?.total ?? 0;
}

