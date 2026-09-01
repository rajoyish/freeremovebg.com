// Coverage dashboard for the incremental translation workflow.
//
//   node scripts/i18n/status.mjs            stats for every language
//   node scripts/i18n/status.mjs --start    mint a session id, then print stats
//   node scripts/i18n/status.mjs --next 2   name the next N languages to work on
//   node scripts/i18n/status.mjs --json     machine-readable output

import {
  TARGETS, CORE_STRINGS, USE_CASE_STRINGS, statusFor, langName, langEndonym,
  readLedger, readSession, startSession,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};

if (has("--start")) startSession();
const session = readSession();
const ledger = readLedger();

const rows = TARGETS.map((l) => statusFor(l.code));
const complete = rows.filter((r) => r.complete);
const started = rows.filter((r) => !r.complete && r.done > 0);
const untouched = rows.filter((r) => r.done === 0);
const withPages = rows.filter((r) => r.hasPages);
const withContentPages = rows.filter((r) => r.hasContentPages);

// Languages finished under the current session id, in completion order.
const thisSession = session
  ? ledger.entries.filter((e) => e.session === session && e.complete).map((e) => e.code)
  : [];
const thisSessionUnique = [...new Set(thisSession)];

// Work queue: unfinished languages, most-complete first so partials get closed
// out before new ones are opened, then in languages.json order (usage rank).
const order = new Map(TARGETS.map((l, i) => [l.code, i]));
const queue = rows
  .filter((r) => !r.complete)
  .sort((a, b) => b.done - a.done || order.get(a.code) - order.get(b.code));

if (has("--next")) {
  const n = Number(val("--next", 1));
  console.log(queue.slice(0, n).map((r) => r.code).join(" "));
  process.exit(0);
}

const perLang = CORE_STRINGS.length + USE_CASE_STRINGS.length;
const totalMissing = rows.reduce((a, r) => a + r.missingCore + r.missingUseCases, 0);

if (has("--json")) {
  console.log(JSON.stringify({
    session, perLang, totalMissing,
    counts: {
      languages: rows.length,
      complete: complete.length,
      started: started.length,
      untouched: untouched.length,
      thisSession: thisSessionUnique.length,
    },
    thisSession: thisSessionUnique,
    next: queue.slice(0, 5).map((r) => r.code),
    languages: rows,
  }, null, 2));
  process.exit(0);
}

const bar = (p) => "#".repeat(Math.round(p / 5)).padEnd(20, ".");

console.log(`\nTranslation status  (${perLang} strings per language: ${CORE_STRINGS.length} core + ${USE_CASE_STRINGS.length} use-case)\n`);
console.log("code  language          done/total   %    pages  progress");
for (const r of rows) {
  const flag = r.complete ? "done " : r.done === 0 ? "     " : "wip  ";
  console.log(
    r.code.padEnd(6) +
    langName(r.code).padEnd(18) +
    `${r.done}/${r.total}`.padStart(9) +
    String(r.percent).padStart(5) + "%" +
    (r.hasPages ? "   yes " : "   no  ") +
    "  " + bar(r.percent) + " " + flag,
  );
}

console.log(`
Session
  id                    ${session ?? "(none — run with --start)"}
  finished this session ${thisSessionUnique.length}${thisSessionUnique.length ? "  (" + thisSessionUnique.join(", ") + ")" : ""}

Overall
  complete              ${complete.length} / ${rows.length}
  in progress           ${started.length}
  not started           ${untouched.length}
  remaining             ${rows.length - complete.length}
  strings left          ${totalMissing}
  localized use-case pages live  ${withPages.length * 6} (${withPages.length} langs x 6 slugs)
  localized content pages live   ${withContentPages.length * 4} (${withContentPages.length} langs x about/contact/privacy/terms)

Next up               ${queue.slice(0, 5).map((r) => `${r.code} (${langEndonym(r.code)})`).join(", ") || "nothing — all done"}
`);
