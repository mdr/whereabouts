// Drives the dev server in the locally installed Chrome, paints a stroke,
// submits, and saves screenshots. Usage: node scripts/smoke.mjs [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./smoke-out";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("requestfailed", (r) => console.log("[requestfailed]", r.url(), r.failure()?.errorText));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector("#submit", { timeout: 30000 }).catch(() => console.log("submit button not found"));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/1-start.png` });

// Paint a stroke across the middle-left of the map, then a second blob.
const map = await page.$("#map canvas");
const box = await map.boundingBox();
const cx = box.x + box.width * 0.55, cy = box.y + box.height * 0.45;
await page.mouse.move(cx - 60, cy);
await page.mouse.down();
for (let i = 0; i <= 20; i++) await page.mouse.move(cx - 60 + i * 6, cy + Math.sin(i / 3) * 10);
await page.mouse.up();
await page.mouse.move(cx + 200, cy + 80);
await page.mouse.down();
await page.mouse.move(cx + 210, cy + 85);
await page.mouse.up();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/2-painted.png` });
console.log("blobs:", await page.$eval("#blobs", (el) => el.innerText));

await page.click("#submit");
await page.waitForTimeout(1500);
await page.mouse.move(cx + 40, cy - 40);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/3-reveal.png` });
console.log("score card:", await page.$eval(".score", (el) => el.innerText));
await browser.close();
