// The awkward multiplayer paths, against the dev servers: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), and Play again leads back to the same lobby.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/flows.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();

// Alice hosts, Bob joins, and the game starts.
const aliceHomePage = await (await newTab(browser, "Alice")).openHome();
await aliceHomePage.enterName("Alice");
const aliceLobbyPage = await aliceHomePage.hostGame();
const code = await aliceLobbyPage.code();
const bobHomePage = await (await newTab(browser, "Bob")).openHome();
await bobHomePage.enterName("Bob");
const bobLobbyPage = await bobHomePage.joinGame(code);
await aliceLobbyPage.players.waitForPlayer("Bob");
let aliceRoundPage = await aliceLobbyPage.startGame();
let bobRoundPage = await bobLobbyPage.waitForGameToStart();

// 1. A refresh mid-round keeps the seat and the paint.
await aliceRoundPage.map.drag({ across: 0.5, down: 0.4 });
await aliceRoundPage.pause(900); // the paint uploads after a short pause
const before = await aliceRoundPage.map.shownPaintCells();
aliceRoundPage = await aliceRoundPage.reload();
const after = await aliceRoundPage.map.shownPaintCells();
// The upload is compacted to coarser cells, so the count drops but stays non-zero.
checks.check(before > 0 && after > 0 && after <= before, `paint restored after refresh (${before} -> ${after} cells)`);
await aliceRoundPage.playersPanel.open();
const players = await aliceRoundPage.playersPanel.players.players();
checks.check(
  players.length === 2 && players.some((p) => p.name === "Alice" && p.isHost),
  `still two players, Alice still host: ${JSON.stringify(players)}`,
);

// 2. A late joiner sits this round out, then plays the next.
const caraHomePage = await (await newTab(browser, "Cara")).openHome();
await caraHomePage.enterName("Cara");
const caraSittingOutPage = await caraHomePage.joinGameMidRound(code);
checks.check(true, "a late joiner is told they're sitting this round out");
let aliceRevealPage = await aliceRoundPage.waitForReveal();
let bobRevealPage = await bobRoundPage.waitForReveal();
const caraRevealPage = await caraSittingOutPage.waitForReveal();
const round1 = await aliceRevealPage.rows();
checks.check(
  round1.some((r) => r.name === "Cara" && r.roundScore === "sat out"),
  `Cara shown as sitting out round 1: ${JSON.stringify(round1)}`,
);
aliceRoundPage = await aliceRevealPage.nextRound();
bobRoundPage = await bobRevealPage.waitForNextRound();
const caraRoundPage = await caraRevealPage.waitForNextRound();
checks.check(true, "the late joiner plays round 2");
// With nothing painted Done is a pass; Cara has no idea and takes it.
checks.check((await caraRoundPage.doneButtonLabel()) === "Pass", "with nothing painted, the button reads Pass");
const caraRoundDonePage = await caraRoundPage.finish();
await caraRoundDonePage.screenshot(`${out}/flows-cara-round2.png`);
await aliceRoundPage.map.drag({ across: 0.4, down: 0.5 });
await bobRoundPage.map.drag({ across: 0.6, down: 0.5 });
await aliceRoundPage.pause(800);
const aliceRoundDonePage = await aliceRoundPage.finish();
bobRevealPage = await bobRoundPage.finishLast();
aliceRevealPage = await aliceRoundDonePage.waitForReveal();
const round2 = await aliceRevealPage.rows();
checks.check(
  round2.some((r) => r.name === "Cara" && r.passed && r.roundScore === "+250"),
  `a pass shows as +250, tagged passed: ${JSON.stringify(round2)}`,
);

// 3. The final standings, then Play again.
const aliceResultsPage = await aliceRevealPage.showFinalResults();
const bobResultsPage = await bobRevealPage.waitForResults();
const standings = await aliceResultsPage.standings();
checks.check(standings.length === 3, `three players in the final standings: ${JSON.stringify(standings)}`);
await aliceResultsPage.screenshot(`${out}/flows-results.png`);
await aliceResultsPage.playAgain();
const bobLobbyAgainPage = await bobResultsPage.waitForLobby();
checks.check((await bobLobbyAgainPage.code()) === code, "Play again brings everyone back to the same lobby");
const inLobby = await bobLobbyAgainPage.players.names();
checks.check(inLobby.length === 3, `all three are in the lobby: ${JSON.stringify(inLobby)}`);

await browser.close();
checks.finish();
