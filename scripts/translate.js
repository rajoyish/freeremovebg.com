#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const I18N_DIR = resolve(ROOT, "src/i18n");
const LOCALES_DIR = resolve(I18N_DIR, "locales");

const ENV_FILE = resolve(ROOT, ".env");
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {}
}

const API_KEY =
  process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY;
const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

const SAFETY_CHAR_LIMIT = 200_000;

// Rate-limit safety: throttle API calls and retry on quota errors.
const CHUNK_DELAY_MS = 500; // wait between API calls (free-tier burst limit)
const MAX_RETRIES = 3; // retries for 403/429 rate-limit errors
const BASE_RETRY_DELAY_MS = 2000; // starting backoff (doubles each retry)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const langsArg = (() => {
  const i = args.indexOf("--langs");
  return i !== -1 && args[i + 1]
    ? args[i + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
})();

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

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not parse ${path}: ${err.message}`);
  }
}

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

function decodeHtmlEntities(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

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
    body.set("format", "html");

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (res.ok) {
        const json = await res.json();
        for (const t of json.data.translations)
          out.push(decodeHtmlEntities(t.translatedText));
        lastError = null;
        break;
      }

      const detail = await res.text();
      lastError = new Error(`Google Translate API ${res.status}: ${detail}`);

      // Retry only on rate-limit errors (403/429)
      if ((res.status === 403 || res.status === 429) && attempt < MAX_RETRIES) {
        const wait = BASE_RETRY_DELAY_MS * 2 ** attempt;
        console.error(
          `     ⚠ rate limited (${res.status}). Retrying in ${wait}ms… (${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(wait);
        continue;
      }
      throw lastError;
    }
    if (lastError) throw lastError;

    // Rate-limit pacing between API calls
    await sleep(CHUNK_DELAY_MS);
  }
  return out;
}

function sortedByKey(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, obj[k]]),
  );
}

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
  console.log(
    `   Target langs   : ${targets.map((l) => l.code).join(", ") || "(none)"}`,
  );
  if (DRY_RUN) console.log(`   Mode           : DRY RUN (no API calls)`);
  if (FORCE) console.log(`   Mode           : FORCE (ignoring cache)`);
  console.log("");

  await mkdir(LOCALES_DIR, { recursive: true });
  const plan = [];
  let plannedChars = 0;

  for (const lang of targets) {
    const file = resolve(LOCALES_DIR, `${lang.code}.json`);
    const cache = (await readJson(file, {})) ?? {};
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
      console.log(
        `   • ${p.lang.code}: ${p.missing.length} new strings · ${p.cost} chars`,
      );
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
    await writeFile(
      file,
      JSON.stringify(sortedByKey(cache), null, 2) + "\n",
      "utf8",
    );
    console.log(`     saved → src/i18n/locales/${lang.code}.json`);
  }

  console.log(`\n✅ Done. Billed ${billed} characters this run.`);
  console.log(`   (Cached strings cost nothing; re-running now bills 0.)\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
