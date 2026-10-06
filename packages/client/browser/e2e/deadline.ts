// What is on screen when the clock runs out is what counts, and everyone sees
// the same reveal: paint erased before the deadline stays erased, and a stroke
// still going at zero neither draws over the reveal nor goes missing.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/deadline.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();

const aliceHomePage = await (await newTab(browser, "Alice")).openHome();
await aliceHomePage.enterName("Alice");
const aliceLobbyPage = await aliceHomePage.hostGame();
const code = await aliceLobbyPage.code();
const bobHomePage = await (await newTab(browser, "Bob")).openHome();
await bobHomePage.enterName("Bob");
const bobLobbyPage = await bobHomePage.joinGame(code);
await aliceLobbyPage.players.waitForPlayer("Bob");
const aliceRoundPage = await aliceLobbyPage.startGame();
const bobRoundPage = await bobLobbyPage.waitForGameToStart();

// Alice paints, lets it upload, then clears it all and waits out the clock.
await aliceRoundPage.map.drag({ across: 0.4, down: 0.5 });
await aliceRoundPage.pause(900);
await aliceRoundPage.paintTools.clear();

// Bob starts a long stroke just before zero and keeps the button down well past it.
await bobRoundPage.hud.waitForCountdown(2);
const stroke = bobRoundPage.map.drag({ across: 0.6, down: 0.5 }, { distancePx: 160, steps: 40, holdMs: 4_000 });
const aliceRevealPage = await aliceRoundPage.waitForReveal();
const bobRevealPage = await bobRoundPage.waitForReveal();
await stroke;
await bobRevealPage.pause(500);

const rows = await aliceRevealPage.rows();
checks.check(
  rows.some((r) => r.name === "Alice" && r.passed && r.roundScore === "+250"),
  `paint cleared before the deadline scores as a pass: ${JSON.stringify(rows)}`,
);
checks.check(
  rows.some((r) => r.name === "Bob" && !r.passed),
  `a stroke still going at zero counts: ${JSON.stringify(rows)}`,
);
const aliceSees = await aliceRevealPage.map.shownPaintCells();
const bobSees = await bobRevealPage.map.shownPaintCells();
checks.check(
  aliceSees > 0 && aliceSees === bobSees,
  `both players see the same paint at the reveal (${aliceSees} and ${bobSees} cells)`,
);
await aliceRevealPage.screenshot(`${out}/deadline-alice.png`);
await bobRevealPage.screenshot(`${out}/deadline-bob.png`);

await browser.close();
checks.finish();
