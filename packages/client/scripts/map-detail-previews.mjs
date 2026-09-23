// Renders the map-detail preview images shown in the lobby and on the front
// page: the same frame (the northern Adriatic, Slovenia and Croatia) at each guessing level.
// Captured at the size it is shown (180 x 120) at double density, so rivers and borders stay
// a full pixel wide rather than thinning away when a larger capture is scaled down. Needs the
// Vite dev server. Usage, from packages/client: node scripts/map-detail-previews.mjs
import { chromium } from "playwright-core";

const LEVELS = ["minimal", "water", "physical", "political"];
const SIZE = { width: 180, height: 120 };
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:5173/#/solo", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.whereabouts?.map);
// Let the practice screen settle its own view first.
await page.waitForTimeout(2500);
await page.addStyleTag({ content: ".hud, .maplibregl-control-container { display: none !important; }" });
for (const level of LEVELS) {
  await page.evaluate((l) => {
    window.whereabouts.map.jumpTo({ center: [14.5, 45.6], zoom: 4.2 });
    window.whereabouts.gameMap.setDetail(l);
  }, level);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const m = window.whereabouts.map;
        m.once("idle", resolve);
        m.triggerRepaint();
      }),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: `src/assets/map-${level}.jpg`, type: "jpeg", quality: 80 });
  console.log("wrote", `src/assets/map-${level}.jpg`);
}
await browser.close();
