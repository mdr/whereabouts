// Two players through an online game against the dev servers (Vite on 5173
// proxying to the game server on 8787): setup, guessing, Done and Keep
// editing, the reveal, and ready-up into round 2. Saves screenshots.
// Usage, from packages/client: node browser/e2e/multiplayer.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();

const aliceTab = await newTab(browser, "Alice");
// Terrain tiles should load at the reveal only: shaded relief would give mountains away.
const terrain = aliceTab.countTerrainTileRequests();
const aliceHomePage = await aliceTab.openHome();
await aliceHomePage.enterName("Alice");
const aliceLobbyPage = await aliceHomePage.hostGame();
const code = await aliceLobbyPage.code();
console.log("code:", code);
await aliceLobbyPage.screenshot(`${out}/mp-1-lobby-host.png`);

// Bob plays with the dev drawer, so it gets exercised too, and with a long
// name, so the lists are checked for overflow.
const bobHomePage = await (await newTab(browser, "Bob", { dev: true })).openHome();
await bobHomePage.enterName("Bobbington-Smythe");
const bobLobbyPage = await bobHomePage.joinGame(code);
await aliceLobbyPage.players.waitForPlayer("Bobbington-Smythe", 5_000);

// The host makes it 3 photo rounds of 30 s; Bob sees the choice but can't change it.
await aliceLobbyPage.setOnlyQuestions("landmarks", 3);
await aliceLobbyPage.chooseSecondsPerRound(30);
await bobLobbyPage.waitForSetupSummary({ rounds: "3", seconds: "30 s", questions: "3 landmarks" });
checks.check(true, "the host's setup reaches Bob");
checks.check(!(await bobLobbyPage.canChangeSetup()), "Bob can't change the setup");
await aliceLobbyPage.screenshot(`${out}/mp-1b-lobby-settings.png`);

const aliceRoundPage = await aliceLobbyPage.startGame();
let bobRoundPage = await bobLobbyPage.waitForGameToStart();
console.log("prompt:", await aliceRoundPage.hud.prompt());
checks.check(await aliceRoundPage.hud.questionHasPhoto(), "a photos-only game asks a photo question");

await aliceRoundPage.map.drag({ across: 0.62, down: 0.42 });
await bobRoundPage.map.drag({ across: 0.3, down: 0.55 });
await aliceRoundPage.screenshot(`${out}/mp-2-guessing-alice.png`);
await aliceRoundPage.playersPanel.open();
await aliceRoundPage.screenshot(`${out}/mp-2b-players-panel.png`);
console.log("Bob's blobs (dev):", await bobRoundPage.devDrawer.blobs());
checks.check(terrain.count() === 0, `no terrain tiles while guessing (${terrain.count()})`);

// Bob is done, changes his mind, and is done again; the round waits for Alice.
bobRoundPage = await (await bobRoundPage.finish()).keepEditing();
checks.check(true, "Keep editing gives Bob his paint tools back");
const bobRoundDonePage = await bobRoundPage.finish();
await aliceRoundPage.pause(1000);
checks.check(await aliceRoundPage.isStillShown(), "the round stays open while Alice is still guessing");

// Once everyone is done the round ends without waiting for the clock.
const aliceRevealPage = await aliceRoundPage.finishLast();
const bobRevealPage = await bobRoundDonePage.waitForReveal(10_000);
checks.check(true, "the reveal comes as soon as everyone is done");
await aliceRevealPage.screenshot(`${out}/mp-3-reveal-alice.png`);
checks.check(terrain.count() > 0, `terrain tiles at the reveal (${terrain.count()})`);
const rows = await aliceRevealPage.rows();
console.log("reveal rows:", JSON.stringify(rows));
checks.check(
  rows.every((r) => !r.name.includes("(you)")),
  "nobody is labelled (you)",
);

// Everyone's paint shows together; then Bob looks at Alice's alone, hides all, and brings it back.
const everyone = await bobRevealPage.map.shownPaintCells();
await bobRevealPage.screenshot(`${out}/mp-3b-reveal-everyone.png`);
await bobRevealPage.showOnly("Alice");
const alicesOnly = await bobRevealPage.map.shownPaintCells();
checks.check(alicesOnly > 0 && alicesOnly < everyone, `Alice's paint alone (${alicesOnly} of ${everyone} cells)`);
await bobRevealPage.screenshot(`${out}/mp-4-reveal-bob-views-alice.png`);
await bobRevealPage.toggleHidePaint();
checks.check((await bobRevealPage.map.shownPaintCells()) === 0, "Hide paint hides all paint");
await bobRevealPage.screenshot(`${out}/mp-4b-reveal-hidden.png`);
await bobRevealPage.toggleHidePaint();
checks.check((await bobRevealPage.map.shownPaintCells()) === everyone, "clicking it again brings everyone's back");

// Ready-up: Bob is ready, Alice (the host) is not, so nothing moves until she is.
await bobRevealPage.ready();
await aliceRevealPage.waitForReadyCount("1 / 2 ready");
await aliceRevealPage.pause(800);
checks.check(await aliceRevealPage.isStillShown(), "still on the reveal with one of two ready");
await aliceRevealPage.screenshot(`${out}/mp-5-reveal-one-ready.png`);
const aliceRound2Page = await aliceRevealPage.readyLast();
checks.check((await aliceRound2Page.hud.round()) === "Round 2 / 3", "round 2 starts once everyone is ready");

await browser.close();
checks.finish();
