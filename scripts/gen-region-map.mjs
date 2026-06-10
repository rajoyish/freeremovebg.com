#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_LANG = "en";
const LANG_COOKIE = "lang";

const languages = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/languages.json"), "utf8"),
);

const regionEntries = [];
for (const lang of languages) {
  if (lang.code === DEFAULT_LANG) continue;
  for (const country of lang.countries) {
    regionEntries.push(`  ${JSON.stringify(country)}: ${JSON.stringify(lang.code)},`);
  }
}

const codes = languages.map((l) => `  ${JSON.stringify(l.code)},`).join("\n");

const out = `export const regionMap = {
${regionEntries.join("\n")}
};

export const supportedCodes = [
${codes}
];

export const defaultLang = ${JSON.stringify(DEFAULT_LANG)};

export const langCookie = ${JSON.stringify(LANG_COOKIE)};
`;

await writeFile(resolve(ROOT, "worker/region-map.js"), out, "utf8");
console.log("✅ Wrote worker/region-map.js");
