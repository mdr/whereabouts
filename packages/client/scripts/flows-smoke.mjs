// Exercises the awkward multiplayer paths against the running dev servers:
// a refresh mid-round keeps the seat and paint, a late joiner spectates then
// plays, and the results screen leads back to a lobby via Play again.
// Run the server with ROUND_MS=12000 ROUNDS=2 for speed.
// Usage: node scripts/flows-smoke.mjs [outDir]
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
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures.push(msg);
};

async function newPlayer(name, query = "") {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(base + query, { waitUntil: "networkidle" });
  await page.fill(".field input", name);
  return page;
}
async function paint(page, fx, fy) {
  const box = await (await page.$("#map canvas")).boundingBox();
  const x = box.x + box.width * fx,
    y = box.y + box.height * fy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i <= 6; i++) await page.mouse.move(x + i * 5, y);
  await page.mouse.up();
}
const cellCount = (page) =>
  page.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);

// ---- setup: Alice hosts, Bob joins, start ----
// Alice runs in dev mode: the in-game player list lives in the drawer.
const alice = await newPlayer("Alice", "?dev");
await alice.click("text=Host a game");
await alice.waitForSelector(".lobby .code");
const code = (await alice.textContent(".lobby .code")).trim();
const bob = await newPlayer("Bob");
await bob.fill(".code-input", code);
await bob.click(".join button");
await alice.waitForSelector("text=Bob");
await alice.click("text=Start game");
await alice.waitForSelector("#map canvas");
await bob.waitForSelector("#map canvas");
await alice.waitForTimeout(2000);

// ---- 1. refresh mid-round keeps seat and paint ----
await paint(alice, 0.5, 0.4);
await alice.waitForTimeout(900); // debounce upload
const before = await cellCount(alice);
await alice.reload({ waitUntil: "networkidle" });
await alice.waitForSelector("#map canvas");
await alice.waitForTimeout(2500);
const after = await cellCount(alice);
// The upload is compacted to coarser cells, so the count drops but stays non-zero.
check(before > 0 && after > 0 && after <= before, `paint restored after refresh (${before} -> ${after} cells)`);
const players = await alice.$$eval(".players li", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
check(
  players.length === 2 && players.some((p) => p.includes("Alice") && p.includes("host")),
  `still two players, Alice still host: ${JSON.stringify(players)}`,
);

// ---- 2. late joiner spectates, then plays next round ----
const cara = await newPlayer("Cara");
await cara.fill(".code-input", code);
await cara.click(".join button");
await cara.waitForSelector("text=watching this one", { timeout: 10000 });
check(true, "late joiner sees spectating notice");
await alice.waitForSelector(".reveal-list", { timeout: 20000 });
const revealRows = await alice.$$eval(".reveal-list li", (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim()),
);
check(
  revealRows.some((r) => r.startsWith("Cara") && r.includes("sat out")),
  `spectator shown as sitting out round 1: ${JSON.stringify(revealRows)}`,
);
await alice.click('button:has-text("Next round")');
await cara.waitForSelector("text=Lock in", { timeout: 10000 });
check(true, "late joiner can play round 2");
await paint(cara, 0.4, 0.5);
await cara.waitForTimeout(800);
await cara.screenshot({ path: `${out}/flows-cara-round2.png` });

// ---- 3. results and play again ----
// No timer on the reveal: the host moves everyone on.
await alice.waitForSelector(".reveal-list", { timeout: 30000 });
await alice.click('button:has-text("Show final results")');
await alice.waitForSelector(".results-card", { timeout: 10000 });
await bob.waitForSelector(".results-card", { timeout: 10000 });
const standings = await alice.$$eval(".final li .name", (els) => els.map((e) => e.textContent.trim()));
check(standings.length === 3, `three players in final standings: ${JSON.stringify(standings)}`);
await alice.screenshot({ path: `${out}/flows-results.png` });
await alice.click("text=Play again");
await bob.waitForSelector(".lobby .code", { timeout: 10000 });
check((await bob.textContent(".lobby .code")).trim() === code, "play again returns everyone to the same lobby");
const scores = await bob.$$eval(".players li", (els) => els.length);
check(scores === 3, `all three still present in lobby (${scores})`);

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall flows ok");
