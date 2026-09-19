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
await alice.click("text=Host a game");
await alice.waitForSelector(".lobby .code", { timeout: 15000 });
const code = (await alice.textContent(".lobby .code")).trim();
console.log("code:", code);
await alice.screenshot({ path: `${out}/mp-1-lobby-host.png` });

// Bob plays in dev mode so the drawer gets exercised too.
const bob = await newPlayer("Bob", "?dev");
await bob.fill(".code-input", code);
await bob.click(".join button");
await bob.waitForSelector(".lobby .code", { timeout: 15000 });
await alice.waitForSelector("text=Bob", { timeout: 5000 });
console.log("both in lobby");
// Host trims the game to 3 rounds of 30 s; Bob sees the change.
await alice.selectOption(".settings select >> nth=0", "3");
await alice.selectOption(".settings select >> nth=1", "30000");
await bob.waitForSelector("text=3 rounds · 30 seconds each", { timeout: 5000 });
console.log("settings propagated to Bob");
await alice.screenshot({ path: `${out}/mp-1b-lobby-settings.png` });

await alice.click("text=Start game");
await alice.waitForSelector(".countdown", { timeout: 15000 });
await bob.waitForSelector(".countdown", { timeout: 15000 });
await alice.waitForSelector("#map canvas");
await bob.waitForSelector("#map canvas");
await alice.waitForTimeout(2500);
console.log("guessing; prompt:", await alice.textContent(".prompt"));

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
await bob.click("text=Lock in");
await bob.waitForSelector("text=Locked in", { timeout: 5000 });
console.log("bob locked");
await alice.waitForTimeout(1000);
const stillGuessing = await alice.$(".reveal-list");
console.log("round still open with one player locked:", stillGuessing === null);

// Once everyone has locked in the round ends without waiting for the clock.
await alice.click("text=Lock in");
await alice.waitForSelector(".reveal-list", { timeout: 10000 });
await bob.waitForSelector(".reveal-list", { timeout: 10000 });
console.log("reveal reached early via lock-in");
await alice.waitForTimeout(1500);
await alice.screenshot({ path: `${out}/mp-3-reveal-alice.png` });
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

// Ready-up: Bob is ready, Alice (host) is not, so nothing moves until she is.
await bob.click('button:has-text("Ready")');
await alice.waitForSelector("text=1 / 2 ready", { timeout: 5000 });
await alice.waitForTimeout(800);
console.log("still on reveal after one ready:", (await alice.$(".reveal-list")) !== null);
await alice.screenshot({ path: `${out}/mp-5-reveal-one-ready.png` });
await alice.click('button:has-text("Ready")');
await alice.waitForSelector("text=Lock in", { timeout: 10000 });
console.log("round 2 started via everyone ready:", await alice.textContent(".hud-header .round"));
await browser.close();
console.log("done");
