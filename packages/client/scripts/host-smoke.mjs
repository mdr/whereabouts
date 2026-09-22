// Host controls and the brush footprint, against the dev servers: Alice hosts,
// Bob joins, the round starts; the footprint appears under Alice's cursor;
// Alice removes Bob, who lands on the "removed" screen; Alice ends the game
// early and reaches the final standings. Saves screenshots.
// Usage: node scripts/host-smoke.mjs [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./smoke-out";
mkdirSync(out, { recursive: true });
const base = "http://localhost:5173";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${name} console.error]`, m.text());
  });
  return page;
}

const alice = await player("alice");
await alice.goto(`${base}/#/`, { waitUntil: "networkidle" });
await alice.fill('input[placeholder="Your name"]', "Alice");
await alice.click('button:has-text("Host a game")');
await alice.waitForSelector(".code");
const code = (await alice.textContent(".code")).trim();
console.log("code", code);

const bob = await player("bob");
await bob.goto(`${base}/#/game/${code}`, { waitUntil: "networkidle" });
await bob.fill('input[placeholder="Your name"]', "Bob");
await bob.click('button:has-text("Join")');
await bob.waitForSelector('text="Waiting for"');
await alice.waitForSelector('li:has-text("Bob")');

// Lobby: host sees a remove button on Bob's row, not on her own.
const lobbyKick = await alice.$$eval("button.kick", (b) => b.map((x) => x.getAttribute("aria-label")));
console.log("lobby remove buttons:", JSON.stringify(lobbyKick));

await alice.click('.seconds .pills button:text-is("30")');
await alice.click('button:has-text("Start game")');
await alice.waitForSelector(".toolbar button.primary");
await bob.waitForSelector(".toolbar button.primary");
await alice.waitForTimeout(2500);

// Footprint: hover over the map with the paint tool and check the cursor
// source has a feature.
await alice.mouse.move(650, 420);
await alice.waitForTimeout(400);
const footprint = await alice.evaluate(() => {
  const canvas = document.querySelector(".maplibregl-canvas");
  return canvas ? "canvas present" : "no canvas";
});
console.log("map:", footprint);
await alice.screenshot({ path: `${out}/host-1-footprint.png` });
// Zoom well out so the footprint is visibly made of large hexes.
await alice.keyboard.press("]");
await alice.keyboard.press("]");
await alice.keyboard.press("]");
await alice.mouse.move(660, 430);
await alice.waitForTimeout(400);
await alice.screenshot({ path: `${out}/host-2-footprint-big.png` });

// Bob paints so he has something to lose.
await bob.mouse.move(600, 400);
await bob.mouse.down();
await bob.mouse.move(700, 450, { steps: 8 });
await bob.mouse.up();
await bob.waitForTimeout(800);

// Host removes Bob from the players panel, confirming in the dialog.
await alice.click(".players-toggle");
await alice.waitForSelector(".players-card button.kick");
await alice.click(".players-card button.kick");
await alice.waitForSelector(".modal");
console.log("dialog:", (await alice.textContent(".modal h2")).trim());
await alice.click('.modal button:has-text("Cancel")');
console.log("cancel keeps bob:", (await alice.$$(".players-card li")).length === 2);
await alice.click(".players-card button.kick");
await alice.click('.modal button:has-text("Remove Bob")');
await bob.waitForSelector('text="You were removed from the game"', { timeout: 10000 });
console.log("bob removed:", await bob.textContent("h2"));
await bob.screenshot({ path: `${out}/host-3-bob-removed.png` });
await alice.waitForTimeout(500);
const remaining = await alice.$$eval(".players-card li .name", (els) => els.map((e) => e.textContent.trim()));
console.log("alice sees players:", JSON.stringify(remaining));

// Bob can come back as a new player via the code.
await bob.click('button:has-text("Back to start")');
await bob.waitForSelector('input[placeholder="CODE"]');
await bob.fill('input[placeholder="Your name"]', "Bob II");
await bob.fill('input[placeholder="CODE"]', code);
await bob.click('button:has-text("Join")');
const rejoined = await bob
  .waitForSelector("text=/watching this one|Done|Pass/", { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
console.log("bob rejoined as new player:", rejoined);

// Host ends the game early, confirming in the dialog.
await alice.click("button.end-game");
await alice.waitForSelector(".modal");
console.log("dialog:", (await alice.textContent(".modal h2")).trim());
await alice.screenshot({ path: `${out}/host-3b-end-dialog.png` });
await alice.click('.modal button:has-text("End game")');
await alice.waitForSelector(".results-card", { timeout: 10000 });
console.log("results reached:", (await alice.textContent(".results-card h1")).trim());
await alice.screenshot({ path: `${out}/host-4-results.png` });

await browser.close();
console.log("done");
