// Validate a filled-in batch and merge it into the language's locale file.
//
//   node scripts/i18n/merge.mjs es
//   node scripts/i18n/merge.mjs es --file path/to/other.json
//   node scripts/i18n/merge.mjs es --prune     also drop keys en.json no longer has
//
// Refuses to write anything if a single check fails, so a bad batch can never
// half-land in a locale file.

import fs from "node:fs";
import path from "node:path";
import {
  BATCH_DIR, ALL_STRINGS, localePath, loadLocale, readJSON, writeJSON,
  knownCode, langName, statusFor, appendLedger, readSession, hasUseCasePages,
} from "./lib.mjs";

const [code, ...flags] = process.argv.slice(2);
const has = (f) => flags.includes(f);
const val = (f, d) => {
  const i = flags.indexOf(f);
  return i === -1 ? d : flags[i + 1];
};

if (!code || !knownCode(code)) {
  console.error("Usage: node scripts/i18n/merge.mjs <code> [--file <path>] [--prune]");
  process.exit(1);
}

const batchPath = val("--file", path.join(BATCH_DIR, `${code}.todo.json`));
if (!fs.existsSync(batchPath)) {
  console.error(`No batch file at ${batchPath}. Run extract.mjs first.`);
  process.exit(1);
}

const batch = readJSON(batchPath);
delete batch.__meta;

const KNOWN = new Set(ALL_STRINGS);
const tags = (s) => (s.match(/<[^>]+>|&[a-z]+;/gi) ?? []).join("");
// {link} marks where an inline link goes. A translation may move it, but losing
// it drops the link out of the sentence.
const slots = (s) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join("");
const errors = [];
const warnings = [];

for (const [english, translation] of Object.entries(batch)) {
  if (!KNOWN.has(english)) {
    errors.push(`key is not an en.json source string (check for edits/whitespace): ${JSON.stringify(english.slice(0, 80))}`);
    continue;
  }
  if (typeof translation !== "string" || translation.trim() === "") {
    errors.push(`empty translation for: ${JSON.stringify(english.slice(0, 80))}`);
    continue;
  }
  if (/\[[A-Z]{2}-Pending\]/.test(translation)) {
    errors.push(`placeholder text left in: ${JSON.stringify(english.slice(0, 80))}`);
    continue;
  }
  if (tags(english) !== tags(translation)) {
    errors.push(`HTML tags/entities differ from the source in: ${JSON.stringify(english.slice(0, 80))}`);
    continue;
  }
  if (slots(english) !== slots(translation)) {
    errors.push(`{placeholder} missing or altered in: ${JSON.stringify(english.slice(0, 80))}`);
    continue;
  }
  if (translation === english && english.split(/\s+/).length > 2) {
    warnings.push(`identical to English: ${JSON.stringify(english.slice(0, 60))}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) — nothing was written:\n`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}

// Merge: existing keys keep their position, new keys append in en.json order so
// the diff reads as pure additions grouped by page section.
const existing = loadLocale(code);
const merged = { ...existing };
let added = 0, updated = 0;
for (const s of ALL_STRINGS) {
  if (!(s in batch)) continue;
  if (merged[s] === batch[s]) continue;
  if (merged[s] === undefined || merged[s] === "") added++;
  else updated++;
  merged[s] = batch[s];
}

let pruned = 0;
if (has("--prune")) {
  for (const k of Object.keys(merged)) {
    if (!KNOWN.has(k)) { delete merged[k]; pruned++; }
  }
}

writeJSON(localePath(code), merged);
fs.unlinkSync(batchPath);

const st = statusFor(code);
const gainedPages = hasUseCasePages(code) && !hasUseCasePages(code, existing);

appendLedger({
  code,
  session: readSession(),
  at: new Date().toISOString(),
  added,
  updated,
  done: st.done,
  total: st.total,
  complete: st.complete,
});

console.log(`\nMerged into src/i18n/locales/${code}.json`);
console.log(`  ${added} new, ${updated} updated${pruned ? `, ${pruned} stale keys pruned` : ""}`);
console.log(`  ${langName(code)} now ${st.done}/${st.total} (${st.percent}%)`);
if (warnings.length) {
  console.log(`  ${warnings.length} left untranslated on purpose? check:`);
  warnings.slice(0, 5).forEach((w) => console.log("    " + w));
}
if (gainedPages) console.log(`  use-case coverage complete — 6 localized pages unlocked for /${code}/`);
if (st.complete) console.log(`  ${code} is fully translated.`);
else console.log(`  ${st.missingCore + st.missingUseCases} strings still missing; re-run extract.mjs ${code}.`);
