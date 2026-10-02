// Every screen at phone size (Playwright's iPhone 13 profile, 390 px wide),
// against the dev servers: the layout never makes the page wider than the
// screen, and the controls a player needs are on screen and uncovered.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/phone.ts [outDir]
import { devices } from "playwright-core";
import type { App } from "../pages/App.ts";
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();
const phone = devices["iPhone 13"];

async function fits(app: App, label: string): Promise<void> {
  const fit = await app.layout.fit();
  await app.screenshot(`${out}/phone-${label}.png`);
  checks.check(
    fit.viewportWidth === phone.viewport.width,
    `${label}: layout viewport ${fit.viewportWidth} is the screen width`,
  );
  checks.check(fit.scrollWidth <= fit.viewportWidth, `${label}: no horizontal scroll (${fit.scrollWidth})`);
  checks.check(
    fit.overflowing.length === 0,
    `${label}: nothing overflows${fit.overflowing.length ? `: ${fit.overflowing.slice(0, 5).join(", ")}` : ""}`,
  );
}

const alice = await openApp(browser, "Alice");
await alice.openHome();
await alice.home.enterName("Alice");
await alice.home.hostGame();
await alice.lobby.waitUntilShown();
const code = await alice.lobby.code();

const bob = await openApp(browser, "Bob", { context: { ...phone, isMobile: true, hasTouch: true } });
await bob.openHome();
await fits(bob, "home");
await bob.home.enterName("Bobbington");
await bob.home.joinGame(code);
await bob.lobby.waitUntilShown();
await fits(bob, "lobby");

await alice.lobby.startGame();
await bob.inGame.waitUntilPlaying();
await bob.map.waitUntilSettled();
await fits(bob, "ingame");
checks.check(await bob.inGame.doneButtonIsUsable(), "ingame: the Done button is usable");
checks.check(await bob.paintTools.toolIsUsable("pan"), "ingame: the Pan tool is usable");
checks.check(await bob.map.attributionIsUsable(), "ingame: the map attribution button is usable");
checks.check(await bob.map.attributionClearsToolbar(), "ingame: the attribution button clears the toolbar");

// One finger on the strip of map left clear (a photo makes the question card tall).
await bob.map.fingerDrag(await bob.map.spotClearOfCards());
const cells = await bob.map.yourPaintCells();
checks.check(cells > 0, `a one-finger drag paints (${cells} cells)`);
await bob.playersPanel.open();
await fits(bob, "ingame-players");
await bob.playersPanel.close();
await bob.inGame.finish();
await fits(bob, "ingame-done");

await bob.reveal.waitUntilShown(60_000);
await bob.map.waitUntilSettled();
await fits(bob, "reveal");
checks.check(await bob.reveal.readyButtonIsUsable(), "reveal: the Ready button is usable");
checks.check(await bob.reveal.scoresAreUsable(), "reveal: the scores list is usable");
checks.check(await bob.map.attributionClearsToolbar(), "reveal: the attribution button clears the toolbar");

await alice.hud.askToEndGame();
await alice.dialog.confirm();
await bob.results.waitUntilShown(60_000);
await fits(bob, "results");

await browser.close();
checks.finish();
