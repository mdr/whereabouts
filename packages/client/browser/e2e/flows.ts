// The awkward multiplayer paths, against the dev servers: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), and Play again leads back to the same lobby.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/flows.ts [outDir]
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();

// Alice hosts, Bob joins, and the game starts.
const alice = await openApp(browser, "Alice");
await alice.openHome();
await alice.home.enterName("Alice");
await alice.home.hostGame();
await alice.lobby.waitUntilShown();
const code = await alice.lobby.code();
const bob = await openApp(browser, "Bob");
await bob.openHome();
await bob.home.enterName("Bob");
await bob.home.joinGame(code);
await alice.lobby.players.waitForPlayer("Bob");
await alice.lobby.startGame();
await alice.inGame.waitUntilPlaying();
await bob.inGame.waitUntilPlaying();
await alice.map.waitUntilSettled();

// 1. A refresh mid-round keeps the seat and the paint.
await alice.map.drag({ across: 0.5, down: 0.4 });
await alice.pause(900); // the paint uploads after a short pause
const before = await alice.map.shownPaintCells();
await alice.reload();
await alice.inGame.waitUntilPlaying();
await alice.map.waitUntilSettled();
const after = await alice.map.shownPaintCells();
// The upload is compacted to coarser cells, so the count drops but stays non-zero.
checks.check(before > 0 && after > 0 && after <= before, `paint restored after refresh (${before} -> ${after} cells)`);
await alice.playersPanel.open();
const players = await alice.playersPanel.players.players();
checks.check(
  players.length === 2 && players.some((p) => p.name === "Alice" && p.isHost),
  `still two players, Alice still host: ${JSON.stringify(players)}`,
);

// 2. A late joiner sits this round out, then plays the next.
const cara = await openApp(browser, "Cara");
await cara.openHome();
await cara.home.enterName("Cara");
await cara.home.joinGame(code);
await cara.inGame.waitUntilSittingOut();
checks.check(true, "a late joiner is told they're sitting this round out");
await alice.reveal.waitUntilShown(20_000);
const round1 = await alice.reveal.rows();
checks.check(
  round1.some((r) => r.name === "Cara" && r.roundScore === "sat out"),
  `Cara shown as sitting out round 1: ${JSON.stringify(round1)}`,
);
await alice.reveal.moveOn();
await cara.inGame.waitUntilPlaying(10_000);
checks.check(true, "the late joiner plays round 2");
// With nothing painted Done is a pass; Cara has no idea and takes it.
checks.check((await cara.inGame.doneButtonLabel()) === "Pass", "with nothing painted, the button reads Pass");
await cara.inGame.finish();
await cara.screenshot(`${out}/flows-cara-round2.png`);
await alice.map.drag({ across: 0.4, down: 0.5 });
await bob.map.drag({ across: 0.6, down: 0.5 });
await alice.pause(800);
await alice.inGame.finish();
await bob.inGame.pressDone();
await alice.reveal.waitUntilShown();
const round2 = await alice.reveal.rows();
checks.check(
  round2.some((r) => r.name === "Cara" && r.passed && r.roundScore === "+250"),
  `a pass shows as +250, tagged passed: ${JSON.stringify(round2)}`,
);

// 3. The final standings, then Play again.
await alice.reveal.moveOn();
await alice.results.waitUntilShown();
await bob.results.waitUntilShown();
const standings = await alice.results.standings();
checks.check(standings.length === 3, `three players in the final standings: ${JSON.stringify(standings)}`);
await alice.screenshot(`${out}/flows-results.png`);
await alice.results.playAgain();
await bob.lobby.waitUntilShown(10_000);
checks.check((await bob.lobby.code()) === code, "Play again brings everyone back to the same lobby");
const inLobby = await bob.lobby.players.names();
checks.check(inLobby.length === 3, `all three are in the lobby: ${JSON.stringify(inLobby)}`);

await browser.close();
checks.finish();
