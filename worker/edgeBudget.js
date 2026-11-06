// ---------------------------------------------------------------------------
// Monthly budget for Cloudflare Image Transformations (free tier).
//
// The free plan allows 5,000 unique transformations per calendar month. Every
// upload to /api/upload-temp gets a fresh key, so each one becomes exactly one
// unique transformation. Counting uploads per month (UTC) therefore tracks the
// quota without calling Cloudflare's API.
//
// Once the count reaches the budget, or a browser reports that the edge
// answered 9422, the month is marked exhausted. From then on:
//   - GET /api/edge-status says { available: false, resumeAt }, so pages go
//     straight to on-device encoding and upload nothing;
//   - POST /api/upload-temp refuses with 503 before storing anything.
// A new month is a new row, so the edge comes back on its own on the 1st.
//
// The table creates itself on first use. There is no migration to run.
// ---------------------------------------------------------------------------

// Headroom under 5,000 for anything else on the zone that transforms images.
export const DEFAULT_BUDGET = 4900;

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS edge_usage (
  month TEXT PRIMARY KEY,
  uploads INTEGER NOT NULL DEFAULT 0,
  exhausted_at TEXT
)`;

/** "2026-11" for any instant in November 2026, UTC. */
export function monthKey(now) {
  return new Date(now).toISOString().slice(0, 7);
}

/** Midnight UTC on the 1st of the following month, as an ISO string. */
export function nextMonthStart(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

/** EDGE_MONTHLY_BUDGET from wrangler.toml, or the default. 0 turns the edge off. */
export function budgetOf(env) {
  const raw = env.EDGE_MONTHLY_BUDGET;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_BUDGET;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_BUDGET;
}

// Run a query, creating the table the first time it is missing.
async function withTable(db, query) {
  try {
    return await query();
  } catch (error) {
    if (!/no such table/i.test(String(error?.message))) throw error;
    await db.prepare(TABLE_SQL).run();
    return query();
  }
}

export async function edgeStatus(env, now = Date.now()) {
  const budget = budgetOf(env);
  const month = monthKey(now);
  const row = await withTable(env.DB, () =>
    env.DB.prepare("SELECT uploads, exhausted_at FROM edge_usage WHERE month = ?")
      .bind(month)
      .first(),
  );
  const used = row?.uploads ?? 0;
  const exhausted = Boolean(row?.exhausted_at) || used >= budget;
  return {
    available: !exhausted,
    used,
    budget,
    month,
    resumeAt: exhausted ? nextMonthStart(now) : null,
  };
}

/**
 * Claim one transformation from this month's budget. Atomic: the increment
 * only happens while the month is open and under budget, so concurrent
 * uploads cannot overshoot.
 */
export async function reserveTransformation(env, now = Date.now()) {
  const budget = budgetOf(env);
  if (budget <= 0) return { ok: false };
  const row = await withTable(env.DB, () =>
    env.DB.prepare(
      `INSERT INTO edge_usage (month, uploads) VALUES (?, 1)
       ON CONFLICT(month) DO UPDATE SET uploads = uploads + 1
       WHERE exhausted_at IS NULL AND uploads < ?
       RETURNING uploads`,
    )
      .bind(monthKey(now), budget)
      .first(),
  );
  return row ? { ok: true, used: row.uploads } : { ok: false };
}

/** Close the month early, e.g. when the edge itself answered 9422. */
export async function markExhausted(env, now = Date.now()) {
  await withTable(env.DB, () =>
    env.DB.prepare(
      `INSERT INTO edge_usage (month, uploads, exhausted_at) VALUES (?, 0, ?)
       ON CONFLICT(month) DO UPDATE SET
         exhausted_at = COALESCE(exhausted_at, excluded.exhausted_at)`,
    )
      .bind(monthKey(now), new Date(now).toISOString())
      .run(),
  );
}
