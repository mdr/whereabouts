// Walks every screen at phone size (Playwright's iPhone 13 profile, 390px
// wide) against the running dev servers and checks the layout never forces
// the page wider than the screen. Run the server with ROUND_MS=12000 ROUNDS=2.
// Usage: node scripts/phone-smoke.mjs [outDir]
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./smoke-out";
mkdirSync(out, { recursive: true });
const base = "http://localhost:5173/";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const phone = devices["iPhone 13"];
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures.push(msg);
};

async function newPlayer(name, mobile) {
  const ctx = await browser.newContext(
    mobile ? { ...phone, isMobile: true, hasTouch: true } : { viewport: { width: 1300, height: 900 } },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.fill(".field input", name);
  return page;
}

/** The layout viewport must stay at the screen width and nothing may poke past it. */
async function fits(page, label) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest(".maplibregl-map") && !el.closest(".maplibregl-ctrl")) continue; // canvas can be oversized
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
        const cls = typeof el.className === "string" && el.className ? "." + el.className.split(" ").join(".") : "";
        wide.push(`${el.tagName.toLowerCase()}${cls} [${Math.round(b.left)}..${Math.round(b.right)}]`);
      }
    }
    return { vw, sw: document.documentElement.scrollWidth, wide };
  });
  await page.screenshot({ path: `${out}/phone-${label}.png` });
  check(r.vw === phone.viewport.width, `${label}: layout viewport ${r.vw} is the screen width`);
  check(r.sw <= r.vw, `${label}: no horizontal scroll (${r.sw} <= ${r.vw})`);
  check(r.wide.length === 0, `${label}: nothing overflows${r.wide.length ? ": " + r.wide.slice(0, 5).join(", ") : ""}`);
}

/** The map's attribution button must sit above the toolbar, not on it. */
async function attributionClear(page, label) {
  const r = await page.evaluate(() => {
    const a = document.querySelector(".maplibregl-ctrl-bottom-right")?.getBoundingClientRect();
    const t = document.querySelector(".hud-bottom")?.getBoundingClientRect();
    return a && t ? { ab: Math.round(a.bottom), tt: Math.round(t.top) } : null;
  });
  check(r && r.ab <= r.tt, `${label}: attribution button (bottom ${r?.ab}) clears the toolbar (top ${r?.tt})`);
}

/** A control is usable: on screen and not covered by something else. */
async function reachable(page, selector, label) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      found: true,
      onScreen: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight,
      hit: hit === el || el.contains(hit),
    };
  }, selector);
  check(r.found && r.onScreen && r.hit, `${label} is on screen and not covered`);
}

const alice = await newPlayer("Alice", false);
await alice.click("text=Host a game");
await alice.waitForSelector(".lobby .code");
const code = (await alice.textContent(".lobby .code")).trim();

const bob = await newPlayer("Bobbington", true);
await fits(bob, "home");
await bob.fill(".code-input", code);
await bob.click(".join button");
await bob.waitForSelector(".lobby");
await fits(bob, "lobby");

await alice.click("text=Start game");
await bob.waitForSelector("#map canvas");
await bob.waitForTimeout(2500);
await fits(bob, "ingame");
await reachable(bob, ".toolbar button.primary", "Done button");
await reachable(bob, ".toolbar .tools button:first-child", "Pan button");
await reachable(bob, ".maplibregl-ctrl-attrib-button", "map attribution button");
await attributionClear(bob, "ingame");

// Paint with one finger in the clear strip of map between the cards and the
// toolbar (a photo question makes the cards tall), then press Done.
const cdp = await bob.context().newCDPSession(bob);
const { x, y } = await bob.evaluate(() => {
  const top = document.querySelector(".hud-right").getBoundingClientRect().bottom;
  const bottom = document.querySelector(".hud-bottom").getBoundingClientRect().top;
  return { x: window.innerWidth / 2, y: (top + bottom) / 2 };
});
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
for (let i = 1; i <= 5; i++) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + i * 6, y }] });
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await bob.waitForTimeout(500);
const cells = await bob.evaluate(() => window.whereabouts.map.getSource("paint").serialize().data.features.length);
check(cells > 0, `one-finger drag painted (${cells} cells)`);
await bob.click(".players-toggle");
await bob.waitForTimeout(200);
await fits(bob, "ingame-players");
await bob.click(".players-toggle");
await bob.click(".toolbar button.primary");
await bob.waitForSelector("text=You're done");
await fits(bob, "ingame-locked");

await bob.waitForSelector(".ready-count", { timeout: 60000 });
await bob.waitForTimeout(1500);
await fits(bob, "reveal");
await reachable(bob, ".toolbar button.primary", "Ready button");
await reachable(bob, ".reveal-list li.everyone", "scores list");
await attributionClear(bob, "reveal");

await alice.click("text=End game");
await alice.click(".modal button.danger");
await bob.waitForSelector(".results-card", { timeout: 60000 });
await bob.waitForTimeout(500);
await fits(bob, "results");

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nphone layout ok");
