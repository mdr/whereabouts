// Opens the production build (served by the packaged server, e.g. `nix run`)
// in the locally installed Chrome and checks the map actually loads: the
// MapLibre worker must be fetched as JavaScript, not the SPA fallback.
// Usage: node scripts/prod-smoke.mjs [baseUrl]   (default http://localhost:8799)
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8799";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => {
  const url = r.url();
  const type = r.headers()["content-type"] ?? "";
  if (/\.(m?js)(\?|$)/.test(url) && !type.includes("javascript")) {
    problems.push(`script served as ${type}: ${url}`);
  }
});

await page.goto(`${base}/#/solo`, { waitUntil: "networkidle" });
const loaded = await page
  .waitForFunction(() => !document.body.textContent?.includes("Loading map"), null, { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(1500);
console.log(`map loaded: ${loaded}`);
console.log(`submit button present: ${(await page.$('button:has-text("Submit")')) !== null}`);
for (const p of problems) console.log(`problem: ${p}`);
await browser.close();
process.exit(loaded && problems.length === 0 ? 0 : 1);
