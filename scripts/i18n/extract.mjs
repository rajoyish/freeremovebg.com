// Write the untranslated strings for one language into a fill-in batch file.
//
//   node scripts/i18n/extract.mjs es               everything still missing
//   node scripts/i18n/extract.mjs es --max 40      cap the batch (tight quota)
//   node scripts/i18n/extract.mjs es --scope core  only the non-use-case strings
//
// Output: .i18n-batches/<code>.todo.json — a flat map of English source string
// to empty string. Fill in the values, then run merge.mjs.

import fs from "node:fs";
import path from "node:path";
import {
  BATCH_DIR, missingFor, knownCode, langName, langEndonym, langDir, statusFor,
  isKeywordString,
} from "./lib.mjs";

const [code, ...flags] = process.argv.slice(2);
const val = (f, d) => {
  const i = flags.indexOf(f);
  return i === -1 ? d : flags[i + 1];
};

if (!code || !knownCode(code)) {
  console.error(`Usage: node scripts/i18n/extract.mjs <code> [--max N] [--scope core|useCases|all]`);
  console.error(code ? `Unknown language code: ${code}` : "");
  process.exit(1);
}

const scope = val("--scope", "all");
const max = Number(val("--max", Infinity));
const missing = missingFor(code);

// Core strings lead: they are short and they clean up the 49 home pages that
// already ship. Use-case strings follow in en.json order, which keeps each
// landing page's copy contiguous so a capped batch stays coherent.
const pool =
  scope === "core" ? missing.core
  : scope === "useCases" ? missing.useCases
  : [...missing.core, ...missing.useCases];

if (pool.length === 0) {
  console.log(`${code} (${langName(code)}): nothing missing in scope "${scope}".`);
  process.exit(0);
}

const batch = pool.slice(0, max);
const keywordKeys = batch.filter(isKeywordString);

const todo = {
  __meta: {
    code,
    language: langName(code),
    endonym: langEndonym(code),
    dir: langDir(code),
    instructions:
      "Translate each value. Keys are the English source and MUST stay byte-for-byte identical. " +
      "Keep HTML tags, entities and the FreeRemoveBG brand name unchanged. Delete nothing.",
    inThisBatch: batch.length,
    stillMissingAfter: pool.length - batch.length,
  },
};

// Keyword meta is not prose. Translating the English list word by word yields
// terms nobody searches for; these values want the phrases a native speaker
// actually types, which may share no vocabulary with the English.
if (keywordKeys.length) {
  todo.__meta.keywordStrings = keywordKeys;
  todo.__meta.keywordInstructions =
    "The keys listed in keywordStrings are comma-separated SEO keyword lists, not sentences. " +
    "Do not translate them term by term. Write the search phrases a native speaker of this " +
    "language actually types for this tool, comma-separated, lowercase, 6-9 terms. Include the " +
    "local spelling variants people really use. Latin-script languages: prefer unaccented forms, " +
    "since that is how most people type a query.";
}

for (const s of batch) todo[s] = "";

fs.mkdirSync(BATCH_DIR, { recursive: true });
const out = path.join(BATCH_DIR, `${code}.todo.json`);
fs.writeFileSync(out, JSON.stringify(todo, null, 2) + "\n");

const st = statusFor(code);
console.log(`${code} (${langName(code)} / ${langEndonym(code)}, ${langDir(code)})`);
console.log(`  currently ${st.done}/${st.total} (${st.percent}%)`);
console.log(`  batch: ${batch.length} strings -> ${path.relative(process.cwd(), out)}`);
if (keywordKeys.length) {
  console.log(`  ${keywordKeys.length} of these are keyword lists — see __meta.keywordInstructions.`);
}
if (pool.length > batch.length) {
  console.log(`  ${pool.length - batch.length} more remain after this batch; re-run extract to get them.`);
}
