// Two players through an online game against the dev servers (Vite on 5173
// proxying to the game server on 8787): setup, guessing, Done and Keep
// editing, the reveal, and ready-up into round 2. Saves screenshots.
// Usage, from packages/client: node browser/e2e/multiplayer.ts [outDir]
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();

const alice = await openApp(browser, "Alice");
await alice.openHome();
await alice.home.enterName("Alice");
// Terrain tiles should load at the reveal only: shaded relief would give mountains away.
const terrain = alice.map.countTerrainTileRequests();
await alice.home.hostGame();
await alice.lobby.waitUntilShown();
const code = await alice.lobby.code();
console.log("code:", code);
await alice.screenshot(`${out}/mp-1-lobby-host.png`);

// Bob plays with the dev drawer, so it gets exercised too, and with a long
// name, so the lists are checked for overflow.
const bob = await openApp(browser, "Bob", { dev: true });
await bob.openHome();
await bob.home.enterName("Bobbington-Smythe");
await bob.home.joinGame(code);
await bob.lobby.waitUntilShown();
await alice.lobby.players.waitForPlayer("Bobbington-Smythe", 5_000);

// The host makes it 3 photo rounds of 30 s; Bob sees the choice but can't change it.
await alice.lobby.setOnlyQuestions("landmarks", 3);
await alice.lobby.chooseSecondsPerRound(30);
await bob.lobby.waitForSetupSummary({ rounds: "3", seconds: "30 s", questions: "3 landmarks" });
checks.check(true, "the host's setup reaches Bob");
checks.check(!(await bob.lobby.canChangeSetup()), "Bob can't change the setup");
await alice.screenshot(`${out}/mp-1b-lobby-settings.png`);

await alice.lobby.startGame();
await alice.inGame.waitUntilPlaying();
await bob.inGame.waitUntilPlaying();
await alice.map.waitUntilSettled();
await bob.map.waitUntilSettled();
console.log("prompt:", await alice.hud.prompt());
checks.check(await alice.hud.questionHasPhoto(), "a photos-only game asks a photo question");

await alice.map.drag({ across: 0.62, down: 0.42 });
await bob.map.drag({ across: 0.3, down: 0.55 });
await alice.screenshot(`${out}/mp-2-guessing-alice.png`);
await alice.playersPanel.open();
await alice.screenshot(`${out}/mp-2b-players-panel.png`);
console.log("Bob's blobs (dev):", await bob.devDrawer.blobs());
checks.check(terrain.count() === 0, `no terrain tiles while guessing (${terrain.count()})`);

// Bob is done, changes his mind, and is done again; the round waits for Alice.
await bob.inGame.finish();
await bob.inGame.keepEditing();
await bob.paintTools.waitUntilEnabled(3_000);
checks.check(true, "Keep editing gives Bob his paint tools back");
await bob.inGame.finish();
await alice.pause(1000);
checks.check(!(await alice.reveal.isShown()), "the round stays open while Alice is still guessing");

// Once everyone is done the round ends without waiting for the clock.
await alice.inGame.pressDone();
await alice.reveal.waitUntilShown();
await bob.reveal.waitUntilShown();
checks.check(true, "the reveal comes as soon as everyone is done");
await alice.map.waitUntilSettled();
await alice.screenshot(`${out}/mp-3-reveal-alice.png`);
checks.check(terrain.count() > 0, `terrain tiles at the reveal (${terrain.count()})`);
const rows = await alice.reveal.rows();
console.log("reveal rows:", JSON.stringify(rows));
checks.check(
  rows.every((r) => !r.name.includes("(you)")),
  "nobody is labelled (you)",
);

// Everyone's paint shows together; then Bob looks at Alice's alone, hides all, and brings it back.
await bob.map.waitUntilSettled();
const everyone = await bob.map.shownPaintCells();
await bob.screenshot(`${out}/mp-3b-reveal-everyone.png`);
await bob.reveal.showOnly("Alice");
await bob.map.waitUntilSettled();
const alicesOnly = await bob.map.shownPaintCells();
checks.check(alicesOnly > 0 && alicesOnly < everyone, `Alice's paint alone (${alicesOnly} of ${everyone} cells)`);
await bob.screenshot(`${out}/mp-4-reveal-bob-views-alice.png`);
await bob.reveal.toggleHidePaint();
await bob.map.waitUntilSettled();
checks.check((await bob.map.shownPaintCells()) === 0, "Hide paint hides all paint");
await bob.screenshot(`${out}/mp-4b-reveal-hidden.png`);
await bob.reveal.toggleHidePaint();
await bob.map.waitUntilSettled();
checks.check((await bob.map.shownPaintCells()) === everyone, "clicking it again brings everyone's back");

// Ready-up: Bob is ready, Alice (the host) is not, so nothing moves until she is.
await bob.reveal.ready();
await alice.reveal.waitForReadyCount("1 / 2 ready");
await alice.pause(800);
checks.check(await alice.reveal.isShown(), "still on the reveal with one of two ready");
await alice.screenshot(`${out}/mp-5-reveal-one-ready.png`);
await alice.reveal.ready();
await alice.inGame.waitUntilPlaying(10_000);
checks.check((await alice.hud.round()) === "Round 2 / 3", "round 2 starts once everyone is ready");

await browser.close();
checks.finish();
