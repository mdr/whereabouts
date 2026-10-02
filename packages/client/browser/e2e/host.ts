// Host controls and the brush footprint, against the dev servers: Alice
// hosts and Bob joins by link; the footprint shows under Alice's cursor;
// Alice removes Bob, who can come back as a new player; Alice ends the game
// early. Saves screenshots.
// Usage, from packages/client: node browser/e2e/host.ts [outDir]
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();
const viewport = { viewport: { width: 1300, height: 850 } };

const alice = await openApp(browser, "Alice", { context: viewport });
await alice.openHome();
await alice.home.enterName("Alice");
await alice.home.hostGame();
await alice.lobby.waitUntilShown();
const code = await alice.lobby.code();

const bob = await openApp(browser, "Bob", { context: viewport });
await bob.openGameLink(code);
await bob.joinAs.enterName("Bob");
await bob.joinAs.join();
await bob.lobby.waitUntilShown();
await alice.lobby.players.waitForPlayer("Bob");

// In the lobby the host can remove Bob, but not herself.
const removable = (await alice.lobby.players.players()).filter((p) => p.removable).map((p) => p.name);
checks.check(JSON.stringify(removable) === '["Bob"]', `the host can remove ${JSON.stringify(removable)}`);

await alice.lobby.chooseSecondsPerRound(30);
await alice.lobby.startGame();
await alice.inGame.waitUntilPlaying();
await bob.inGame.waitUntilPlaying();
await alice.map.waitUntilSettled();

// The footprint under the cursor, at the normal brush size and then much bigger.
await alice.map.hover({ across: 0.5, down: 0.5 });
await alice.screenshot(`${out}/host-1-footprint.png`);
await alice.paintTools.biggerBrushWithKeyboard(3);
await alice.map.hover({ across: 0.51, down: 0.51 });
await alice.screenshot(`${out}/host-2-footprint-big.png`);

// Bob paints, so he has something to lose.
await bob.map.drag({ across: 0.46, down: 0.47 }, { distancePx: 100 });

// The host removes Bob from the players panel, after first cancelling.
await alice.playersPanel.open();
await alice.playersPanel.players.askToRemove("Bob");
console.log("dialog:", await alice.dialog.waitForQuestion());
await alice.dialog.cancel();
checks.check((await alice.playersPanel.players.names()).length === 2, "Cancel keeps Bob in the game");
await alice.playersPanel.players.askToRemove("Bob");
await alice.dialog.confirm();
const reason = await bob.turnedAway.waitForReason();
checks.check(reason === "You were removed from the game", `Bob is told: ${reason}`);
await bob.screenshot(`${out}/host-3-bob-removed.png`);
await alice.pause(500);
const remaining = await alice.playersPanel.players.names();
checks.check(JSON.stringify(remaining) === '["Alice"]', `Alice sees ${JSON.stringify(remaining)}`);

// Bob comes back as a new player with the code.
await bob.turnedAway.backToStart();
await bob.home.enterName("Bob II");
await bob.home.joinGame(code);
const rejoined = await bob.inGame.waitUntilInRound().then(
  () => true,
  () => false,
);
checks.check(rejoined, "Bob rejoins as a new player");

// The host ends the game early, confirming in the dialog.
await alice.hud.askToEndGame();
console.log("dialog:", await alice.dialog.waitForQuestion());
await alice.screenshot(`${out}/host-3b-end-dialog.png`);
await alice.dialog.confirm();
await alice.results.waitUntilShown();
checks.check(true, "ending the game goes to the final standings");
await alice.screenshot(`${out}/host-4-results.png`);

await browser.close();
checks.finish();
