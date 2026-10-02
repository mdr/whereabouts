// Opens the production build (served by the packaged server, e.g. `nix run`)
// and checks the map loads: the MapLibre worker must be fetched as
// JavaScript, not the SPA fallback.
// Usage, from packages/client: node browser/e2e/prod.ts [baseUrl]   (default http://localhost:8799)
import { Checks, launchChrome, openApp } from "./support.ts";

const baseUrl = process.argv[2] ?? "http://localhost:8799";
const checks = new Checks();
const browser = await launchChrome();
const you = await openApp(browser, "prod", { baseUrl, context: { viewport: { width: 1200, height: 800 } } });

const problems: string[] = [];
you.page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
});
you.page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
you.page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
you.page.on("response", (r) => {
  const type = r.headers()["content-type"] ?? "";
  if (/\.(m?js)(\?|$)/.test(r.url()) && !type.includes("javascript")) {
    problems.push(`script served as ${type}: ${r.url()}`);
  }
});

await you.openPractice();
const loaded = await you.map.waitUntilSettled().then(
  () => true,
  () => false,
);
checks.check(loaded, "the map loads");
checks.check(await you.solo.isShown(), "practice is ready to play");
checks.check(problems.length === 0, `no errors${problems.length ? `: ${problems.join("; ")}` : ""}`);

await browser.close();
checks.finish();
