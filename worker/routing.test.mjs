import worker from "./index.js";

let pass = 0;
let fail = 0;

const ASSETS = {
  fetch: async () => new Response("ASSET", { status: 200 }),
};

function makeRequest(path, { country, cookie, ua, method = "GET" } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (ua) headers.set("User-Agent", ua);
  const req = new Request(`https://freeremovebg.com${path}`, {
    method,
    headers,
  });
  return new Proxy(req, {
    get(target, prop) {
      if (prop === "cf") return country ? { country } : undefined;
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

async function expect(label, req, check) {
  const res = await worker.fetch(req, { ASSETS }, {});
  const ok = await check(res);
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(
      `  ✗ ${label} → status=${res.status} location=${res.headers.get("Location")}`,
    );
  }
}

const isAsset = async (r) => r.status === 200 && (await r.text()) === "ASSET";
const redirectsTo = (loc) => (r) =>
  r.status === 302 && r.headers.get("Location") === loc;

console.log("\nWorker routing tests");

await expect(
  "IN visitor on / → English asset (no geo redirect)",
  makeRequest("/", { country: "IN" }),
  isAsset,
);
await expect(
  "MX visitor on / → English asset (no geo redirect)",
  makeRequest("/", { country: "MX" }),
  isAsset,
);
await expect(
  "NP visitor on / → English asset (no geo redirect)",
  makeRequest("/", { country: "NP" }),
  isAsset,
);
await expect(
  "US visitor on / → English asset",
  makeRequest("/", { country: "US" }),
  isAsset,
);
await expect("No country on / → English asset", makeRequest("/", {}), isAsset);

await expect(
  "Cookie lang=fr → /fr/",
  makeRequest("/", { country: "IN", cookie: "lang=fr" }),
  redirectsTo("https://freeremovebg.com/fr/"),
);
await expect(
  "Cookie lang=ne → /ne/",
  makeRequest("/", { country: "US", cookie: "lang=ne" }),
  redirectsTo("https://freeremovebg.com/ne/"),
);
await expect(
  "Cookie lang=en → English asset (no redirect)",
  makeRequest("/", { country: "IN", cookie: "lang=en" }),
  isAsset,
);
await expect(
  "Unknown cookie lang=zz → English asset (ignored)",
  makeRequest("/", { country: "IN", cookie: "lang=zz" }),
  isAsset,
);

await expect(
  "Googlebot in IN → English asset",
  makeRequest("/", {
    country: "IN",
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  }),
  isAsset,
);
await expect(
  "Bingbot in MX → English asset",
  makeRequest("/", {
    country: "MX",
    ua: "Mozilla/5.0 (compatible; bingbot/2.0)",
  }),
  isAsset,
);

await expect(
  "Already on /hi/ → asset (no double redirect)",
  makeRequest("/hi/", { country: "IN" }),
  isAsset,
);
await expect(
  "Asset request /_astro/app.js in IN → asset",
  makeRequest("/_astro/app.js", { country: "IN" }),
  isAsset,
);
await expect(
  "/about in IN → asset",
  makeRequest("/about", { country: "IN" }),
  isAsset,
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
