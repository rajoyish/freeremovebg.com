import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Generate a guarded repair from a Cloudflare dashboard snapshot. No I/O. */
export function reconciliationSql(month, expected, observed) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must be YYYY-MM.");
  }
  for (const count of [expected, observed]) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Counts must be non-negative safe integers.");
    }
  }
  if (observed < expected) {
    throw new Error("Reconciliation must not lower reserved usage.");
  }
  // Compare-and-set: a concurrent reservation must make this a no-op.
  // This also makes replaying the same repair harmless. Do not clear 9422.
  return `UPDATE edge_usage
SET uploads = ${observed}
WHERE month = '${month}' AND uploads = ${expected}
RETURNING month, uploads, exhausted_at;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [month, expected, observed, ...extra] = process.argv.slice(2);
    if (extra.length || !/^\d+$/.test(expected ?? "") || !/^\d+$/.test(observed ?? "")) {
      throw new Error("Usage: node scripts/reconcile-edge-usage.mjs YYYY-MM <current-d1-count> <cloudflare-count>");
    }
    console.log(reconciliationSql(month, Number(expected), Number(observed)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
