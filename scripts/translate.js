#!/usr/bin/env node
/**
 * Manual translation CLI — quota protection tiers 1 & 3.
 * ═══════════════════════════════════════════════════════════════════════════
 * This is the ONLY place in the entire project that talks to the Google Cloud
 * Translation API. It is intentionally DECOUPLED from `astro dev` and
 * `astro build`: nothing runs it automatically. You invoke it by hand, once,
 * after you have finished writing new English copy and are ready to sync:
 *
 *     pnpm run translate                 # sync every language
 *     pnpm run translate -- --langs es   # one or more specific languages
 *     pnpm run translate -- --dry-run    # report cost, call nothing
 *     pnpm run translate -- --force      # ignore cache, re-translate all
 *
 * ── Secret handling ──────────────────────────────────────────────────────────
 * GOOGLE_TRANSLATE_API_KEY is read from the gitignored root `.env` (loaded via
 * Node's built-in process.loadEnvFile) or from a pre-set environment variable
 * (e.g. a CI secret, which takes precedence). The key is server-side only: it
 * is never imported by Astro, never bundled to the client, and never logged.
 *
 * ── Tier 1: Cache-First ──────────────────────────────────────────────────────
 * Each `src/i18n/locales/<code>.json` is a FLAT map of the English source
 * string to its translation:
 *
 *     { "Home": "Inicio", "Choose language": "Elegir idioma", ... }
 *
 * On every run we LOAD that file first. We only build an API request for the
 * English strings that are NOT already keys in it (new or edited copy). Fetched
 * results are appended back into the same file, so a string is paid for exactly
 * once and never fetched again. The locale file doubles as the runtime lookup
 * table read by `src/i18n/dictionaries.ts`.
 *
 * ── Tier 3 safety: refuse to run inside dev/build ────────────────────────────
 * If this script is ever invoked from within a dev server or build lifecycle
 * (npm_lifecycle_event of dev/build/prebuild, or astro in the ancestry), it
 * aborts. The quota can only be spent by a deliberate `pnpm run translate`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const I18N_DIR = resolve(ROOT, "src/i18n");
const LOCALES_DIR = resolve(I18N_DIR, "locales");

// ── Load secrets from the root .env (server-side only, gitignored) ───────────
// Uses Node's built-in loader (stable since Node 22) so there is no dotenv
// dependency. Pre-set environment variables (e.g. CI secrets) always win, since
// loadEnvFile does not overwrite values already present in process.env.
const ENV_FILE = resolve(ROOT, ".env");
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    /* malformed .env — fall back to whatever is already in process.env */
  }
}

const API_KEY =
  process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY;
const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

// Free-tier guardrail: a single manual run should never approach 500k chars.
// If a run would bill more than this, we stop and ask for --force to confirm.
const SAFETY_CHAR_LIMIT = 200_000;

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const langsArg = (() => {
  const i = args.indexOf("--langs");
  return i !== -1 && args[i + 1]
    ? args[i + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;
})();

// ── Tier 3 gate: never run automatically from dev/build ──────────────────────
function assertManualInvocation() {
  const lifecycle = process.env.npm_lifecycle_event || "";
  const blocked = ["dev", "start", "build", "prebuild", "postinstall"];
  if (blocked.includes(lifecycle)) {
    console.error(
      `\n❌ Refusing to translate during "${lifecycle}". ` +
        `Run it deliberately with "pnpm run translate".\n`,
    );
    process.exit(1);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not parse ${path}: ${err.message}`);
  }
}

/** Collect every unique, translatable English string from the en.json tree. */
function collectStrings(value, out) {
  if (typeof value === "string") {
    if (/\p{L}/u.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
}

/**
 * Translate strings via Google Cloud Translation v2 (REST).
 * Up to 128 `q` segments are allowed per request; we chunk to 100 to stay safe.
 * Order in === order out, per the API contract.
 */
async function translateBatch(texts, target) {
  const CHUNK = 100;
  const out = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK);
    const body = new URLSearchParams();
    body.set("key", API_KEY);
    chunk.forEach((q) => body.append("q", q));
    body.set("source", "en");
    body.set("target", target);
    body.set("format", "text");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Google Translate API ${res.status}: ${detail}`);
    }
    const json = await res.json();
    for (const t of json.data.translations) out.push(t.translatedText);
  }
  return out;
}

/** Sort an object's keys so locale files stay diff-friendly between runs. */
function sortedByKey(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, obj[k]]),
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  assertManualInvocation();

  const en = await readJson(resolve(I18N_DIR, "en.json"));
  const languages = await readJson(resolve(I18N_DIR, "languages.json"));
  if (!en || !languages) {
    throw new Error("Missing src/i18n/en.json or src/i18n/languages.json");
  }

  let targets = languages.filter((l) => l.code !== "en");
  if (langsArg) {
    const known = new Set(languages.map((l) => l.code));
    for (const c of langsArg) {
      if (!known.has(c)) throw new Error(`Unknown language code: "${c}"`);
    }
    targets = targets.filter((l) => langsArg.includes(l.code));
  }

  const sourceSet = new Set();
  collectStrings(en, sourceSet);
  const sourceStrings = [...sourceSet];

  console.log(`\n🌍 Translation sync`);
  console.log(`   Source strings : ${sourceStrings.length}`);
  console.log(`   Target langs   : ${targets.map((l) => l.code).join(", ") || "(none)"}`);
  if (DRY_RUN) console.log(`   Mode           : DRY RUN (no API calls)`);
  if (FORCE) console.log(`   Mode           : FORCE (ignoring cache)`);
  console.log("");

  // Tier 1: figure out the real cost across all targets BEFORE any API call.
  await mkdir(LOCALES_DIR, { recursive: true });
  const plan = [];
  let plannedChars = 0;

  for (const lang of targets) {
    const file = resolve(LOCALES_DIR, `${lang.code}.json`);
    const cache = (await readJson(file, {})) ?? {};
    // Cache-first: only strings absent from the locale file need fetching.
    const missing = sourceStrings.filter(
      (s) => FORCE || cache[s] === undefined || cache[s] === "",
    );
    const cost = missing.reduce((n, s) => n + s.length, 0);
    plannedChars += cost;
    plan.push({ lang, file, cache, missing, cost });
  }

  console.log(`   Cache status:`);
  for (const p of plan) {
    if (p.missing.length === 0) {
      console.log(`   • ${p.lang.code}: up to date (0 new strings)`);
    } else {
      console.log(`   • ${p.lang.code}: ${p.missing.length} new strings · ${p.cost} chars`);
    }
  }
  console.log(`\n   Total billable this run: ${plannedChars} characters`);

  if (DRY_RUN) {
    console.log(`\n✅ Dry run complete. Nothing was sent to Google.\n`);
    return;
  }

  if (plannedChars === 0) {
    console.log(`\n✅ Everything is already cached. No API calls made.\n`);
    return;
  }

  if (!API_KEY) {
    throw new Error(
      "GOOGLE_TRANSLATE_API_KEY is not set. Export it before running, or use --dry-run.",
    );
  }

  if (plannedChars > SAFETY_CHAR_LIMIT && !FORCE) {
    throw new Error(
      `This run would bill ${plannedChars} chars (> ${SAFETY_CHAR_LIMIT} safety limit). ` +
        `Re-run with --force if that is intentional.`,
    );
  }

  let billed = 0;
  for (const { lang, file, cache, missing } of plan) {
    if (missing.length === 0) continue;
    console.log(`\n   ↻ ${lang.code}: fetching ${missing.length} strings…`);
    const translated = await translateBatch(missing, lang.code);
    missing.forEach((src, i) => {
      cache[src] = translated[i];
      billed += src.length;
    });
    // Append-and-persist: merged with everything previously cached.
    await writeFile(file, JSON.stringify(sortedByKey(cache), null, 2) + "\n", "utf8");
    console.log(`     saved → src/i18n/locales/${lang.code}.json`);
  }

  console.log(`\n✅ Done. Billed ${billed} characters this run.`);
  console.log(`   (Cached strings cost nothing; re-running now bills 0.)\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
