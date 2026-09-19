// Touch input on the map, driven through Chrome's DevTools protocol against
// the dev server in solo mode: one finger paints, two fingers pan/zoom and
// leave no paint behind. Usage: node scripts/touch-smoke.mjs [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./smoke-out";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const cdp = await context.newCDPSession(page);

const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })),
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paint cell count, read from the dev drawer.
const cells = () => page.evaluate(() => document.querySelector("#dev")?.textContent?.match(/(\d+) cells/)?.[1] ?? "?");

await page.goto("http://localhost:5173/?dev#/solo", { waitUntil: "networkidle" });
await page.waitForSelector('button:has-text("Submit")', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log("cells before:", await cells());

// One finger: drag across the map should paint.
await touch("touchStart", [[500, 400]]);
for (let i = 1; i <= 8; i++) {
  await touch("touchMove", [[500 + i * 12, 400 + i * 6]]);
  await sleep(30);
}
await touch("touchEnd", []);
await page.waitForTimeout(500);
const afterOne = await cells();
console.log("cells after one-finger drag:", afterOne);
await page.screenshot({ path: `${out}/touch-1-painted.png` });

// Clear, then two fingers: a pinch should not paint.
await page.click('button:has-text("Clear")');
await page.waitForTimeout(300);
await touch("touchStart", [[450, 400]]);
await sleep(30);
await touch("touchStart", [
  [450, 400],
  [550, 400],
]);
for (let i = 1; i <= 6; i++) {
  await touch("touchMove", [
    [450 - i * 8, 400],
    [550 + i * 8, 400],
  ]);
  await sleep(30);
}
await touch("touchEnd", []);
await page.waitForTimeout(500);
const afterTwo = await cells();
console.log("cells after two-finger pinch:", afterTwo);
await page.screenshot({ path: `${out}/touch-2-pinched.png` });

await browser.close();
const ok = Number(afterOne) > 0 && Number(afterTwo) === 0;
console.log(ok ? "touch ok" : "touch FAILED");
process.exit(ok ? 0 : 1);
