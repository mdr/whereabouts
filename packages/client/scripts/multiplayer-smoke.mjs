// Drives two players through a full online game against the running dev
// servers (client on 5173 proxying to server on 8787). Saves screenshots.
// Usage: node scripts/multiplayer-smoke.mjs [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./smoke-out";
mkdirSync(out, { recursive: true });
const base = "http://localhost:5173/";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function newPlayer(name, query = "") {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${name} console.error]`, m.text().slice(0, 200));
  });
  await page.goto(base + query, { waitUntil: "networkidle" });
  await page.fill(".field input", name);
  return page;
}

const alice = await newPlayer("Alice");
// Terrain tiles should load at the reveal only: shaded relief would give mountains away.
let terrainRequests = 0;
alice.on("request", (r) => {
  if (r.url().includes("elevation-tiles-prod")) terrainRequests++;
});
await alice.click('button:has-text("Host a game")');
await alice.waitForSelector(".lobby .code", { timeout: 15000 });
const code = (await alice.textContent(".lobby .code")).trim();
console.log("code:", code);
await alice.screenshot({ path: `${out}/mp-1-lobby-host.png` });

// Bob plays in dev mode so the drawer gets exercised too.
// A long name, so the lists are checked for overflow.
const bob = await newPlayer("Bobbington-Smythe", "?dev");
await bob.fill(".code-input", code);
await bob.click(".join button");
await bob.waitForSelector(".lobby .code", { timeout: 15000 });
await alice.waitForSelector("text=Bob", { timeout: 5000 });
console.log("both in lobby");
// Host trims the game to 3 rounds of 30 s; Bob sees the change.
await alice.selectOption(".settings select >> nth=0", "3");
await alice.selectOption(".settings select >> nth=1", "30000");
await alice.selectOption(".settings select >> nth=2", "1");
await bob.waitForSelector("text=3 rounds · 30 seconds each · all photos", { timeout: 5000 });
console.log("settings propagated to Bob");
await alice.screenshot({ path: `${out}/mp-1b-lobby-settings.png` });

await alice.click("text=Start game");
await alice.waitForSelector(".countdown", { timeout: 15000 });
await bob.waitForSelector(".countdown", { timeout: 15000 });
await alice.waitForSelector("#map canvas");
await bob.waitForSelector("#map canvas");
await alice.waitForTimeout(2500);
console.log("guessing; prompt:", await alice.textContent(".prompt"));
console.log("all-photos mix gives a photo question:", (await alice.$(".card.question .thumb img")) ? "ok" : "FAIL");

async function paint(page, fx, fy) {
  const box = await (await page.$("#map canvas")).boundingBox();
  const x = box.x + box.width * fx,
    y = box.y + box.height * fy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i <= 8; i++) await page.mouse.move(x + i * 5, y + Math.sin(i) * 6);
  await page.mouse.up();
}
await paint(alice, 0.62, 0.42);
await paint(bob, 0.3, 0.55);
await alice.waitForTimeout(800);
await alice.screenshot({ path: `${out}/mp-2-guessing-alice.png` });
// Players panel starts collapsed; expand it on Alice's side.
await alice.click(".players-toggle");
await alice.waitForSelector(".players-card");
await alice.screenshot({ path: `${out}/mp-2b-players-panel.png` });
console.log("bob blobs (dev):", (await bob.textContent(".blobs")).replace(/\s+/g, " ").slice(0, 120));
console.log("no terrain tiles while guessing:", terrainRequests === 0 ? "ok" : `FAIL (${terrainRequests})`);
await bob.click('button:has-text("Done")');
await bob.waitForSelector("text=You're done", { timeout: 5000 });
console.log("bob locked");
// Bob changes his mind, then locks again.
await bob.click('button:has-text("Keep editing")');
await bob.waitForSelector('.toolbar button.primary:has-text("Done")', { timeout: 5000 });
const toolsBack = await bob.waitForSelector('.tools button:has-text("Paint"):not([disabled])', { timeout: 3000 }).then(
  () => "ok",
  () => "FAIL",
);
console.log("bob unlocked: paint tools back:", toolsBack);
await bob.click('button:has-text("Done")');
await bob.waitForSelector("text=You're done", { timeout: 5000 });
await alice.waitForTimeout(1000);
const stillGuessing = await alice.$(".reveal-list");
console.log("round still open with one player locked:", stillGuessing === null);

// Once everyone is done the round ends without waiting for the clock.
await alice.click('button:has-text("Done")');
await alice.waitForSelector(".reveal-list", { timeout: 10000 });
await bob.waitForSelector(".reveal-list", { timeout: 10000 });
console.log("reveal reached early via lock-in");
await alice.waitForTimeout(1500);
await alice.screenshot({ path: `${out}/mp-3-reveal-alice.png` });
console.log("terrain tiles at the reveal:", terrainRequests > 0 ? `ok (${terrainRequests})` : "FAIL (0)");
console.log("reveal rows:", (await alice.textContent(".reveal-list")).replace(/\s+/g, " "));
// By default everyone's paint is shown together; then Bob looks at Alice's alone.
const everyone = await bob.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);
console.log("bob sees everyone's paint cells:", everyone);
await bob.screenshot({ path: `${out}/mp-3b-reveal-everyone.png` });
await bob.click(".reveal-list li:has-text('Alice')");
await bob.waitForTimeout(1200);
const features = await bob.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);
console.log("bob sees alice's paint cells:", features);
await bob.screenshot({ path: `${out}/mp-4-reveal-bob-views-alice.png` });
// Hide paint leaves just the map and the answer; clicking it again brings everyone back.
await bob.click(".reveal-list li.hide-paint");
await bob.waitForTimeout(600);
const hidden = await bob.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);
console.log("bob hides all paint:", hidden === 0 ? "ok" : `FAIL (${hidden} cells)`);
await bob.screenshot({ path: `${out}/mp-4b-reveal-hidden.png` });
await bob.click(".reveal-list li.hide-paint");
await bob.waitForTimeout(600);
const restored = await bob.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);
console.log("paint back after un-hiding:", restored === everyone ? "ok" : `FAIL (${restored} vs ${everyone})`);
// Rows are in this round's order, and nobody is labelled "(you)".
const rowText = await bob.textContent(".reveal-list");
console.log("no (you) label:", rowText.includes("(you)") ? "FAIL" : "ok");

// Ready-up: Bob is ready, Alice (host) is not, so nothing moves until she is.
await bob.click('button:has-text("Ready")');
await alice.waitForSelector("text=1 / 2 ready", { timeout: 5000 });
await alice.waitForTimeout(800);
console.log("still on reveal after one ready:", (await alice.$(".reveal-list")) !== null);
await alice.screenshot({ path: `${out}/mp-5-reveal-one-ready.png` });
await alice.click('button:has-text("Ready")');
await alice.waitForSelector(".toolbar button.primary", { timeout: 10000 });
console.log("round 2 started via everyone ready:", await alice.textContent(".hud-header .round"));
await browser.close();
console.log("done");
