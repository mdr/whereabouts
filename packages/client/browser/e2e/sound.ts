// The game's sounds start and stop when they should, against the dev
// servers: the rising cue at round start, the spray while painting and the
// eraser while erasing, the whoosh for Clear, the chicken for a pass, the
// countdown at ten seconds left, the falling cue and no alarm when everyone
// finishes early, the alarm when time runs out, applause at the final
// results, and silence with the switch off.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/sound.ts
import { Checks, launchChrome, openApp } from "./support.ts";
import { cueNotes, pageTime, played, recordSounds, stopped, takeSounds } from "./sounds.ts";

const checks = new Checks();
const browser = await launchChrome(["--autoplay-policy=no-user-gesture-required"]);
const options = { context: { viewport: { width: 1280, height: 800 } }, initScript: recordSounds };
const spot = { across: 0.47, down: 0.5 };

const host = await openApp(browser, "Ann", options);
await host.openHome();
await host.home.enterName("Ann");
await host.home.hostGame();
await host.lobby.waitUntilShown();
const code = await host.lobby.code();
const guest = await openApp(browser, "Bob", options);
await guest.openGameLink(code);
await guest.joinAs.enterName("Bob");
await guest.joinAs.join();
await host.lobby.players.waitForPlayer("Bob");
await takeSounds(host);
await takeSounds(guest);

// Round 1 starts: both hear the rising pair, low note first.
const startedAt = await pageTime(host);
await host.lobby.startGame();
await guest.paintTools.waitUntilEnabled();
await host.paintTools.waitUntilEnabled();
await host.pause(300);
const sinceStart = await takeSounds(host);
for (const [name, notes] of [
  ["Ann", cueNotes(sinceStart)],
  ["Bob", cueNotes(await takeSounds(guest))],
] as const) {
  checks.check(
    notes.length === 2 && notes[0]! < notes[1]!,
    `${name} hears the round-start cue ${JSON.stringify(notes)}`,
  );
}

// A held stroke sprays; erasing does not.
await host.map.drag(spot, { distancePx: 90, steps: 30, holdMs: 1500 });
let events = await takeSounds(host);
sinceStart.push(...events);
checks.check(played(events, "spray"), "a held stroke plays the spray");
checks.check(stopped(events, "spray"), "letting go stops the spray");
await host.paintTools.selectTool("erase");
await host.map.drag(spot, { distancePx: 50, steps: 16, holdMs: 800 });
events = await takeSounds(host);
sinceStart.push(...events);
checks.check(played(events, "eraser") && !played(events, "spray"), "erasing rubs the eraser, not the spray");
await host.paintTools.selectTool("paint");

// Clear whooshes when there is paint to wipe; Undo brings it back for Done below.
await host.paintTools.clear();
events = await takeSounds(host);
sinceStart.push(...events);
checks.check(played(events, "clear"), "Clear plays the whoosh");
await host.paintTools.undoWithKeyboard();

// The round is 12 s, so the countdown should start about 2 s after Start.
await host.pause(1500);
sinceStart.push(...(await takeSounds(host)));
const ticks = sinceStart.filter((e) => e.kind === "buffer" && e.clip === "countdown");
const tickAt = ticks.map((e) => `${((e.at - startedAt) / 1000).toFixed(1)} s`);
checks.check(
  ticks.length === 1 && Math.abs((ticks[0]!.at - startedAt) / 1000 - 2) < 1,
  `the countdown starts at ten seconds left (${tickAt.join(", ") || "never"} after Start)`,
);
await takeSounds(guest);

// Everyone done early: the falling pair, and the countdown stops before its alarm.
checks.check((await guest.inGame.doneButtonLabel()) === "Pass", "Bob has nothing painted, so he can pass");
await guest.inGame.finish();
checks.check(played(await takeSounds(guest), "chicken"), "passing plays the chicken");
await host.inGame.pressDone();
await host.reveal.waitUntilShown();
await host.pause(300);
events = await takeSounds(host);
const falling = cueNotes(events);
checks.check(
  falling.length === 2 && falling[0]! > falling[1]!,
  `finishing early plays the falling cue ${JSON.stringify(falling)}`,
);
checks.check(stopped(events, "countdown"), "finishing early stops the countdown");

// Round 2 runs out of time: the countdown plays through to its alarm, and no falling cue.
await host.reveal.moveOn();
await host.inGame.waitUntilPlaying();
await host.pause(300); // past the round-start cue
await takeSounds(host);
await host.reveal.waitUntilShown(20_000);
await host.pause(500);
events = await takeSounds(host);
checks.check(
  cueNotes(events).length === 0,
  `running out of time plays no falling cue ${JSON.stringify(cueNotes(events))}`,
);
checks.check(!stopped(events, "countdown"), "the alarm is left to play");

// The final results: applause for everyone.
await host.reveal.moveOn();
await host.results.waitUntilShown();
await host.pause(400);
checks.check(played(await takeSounds(host), "applause"), "Ann hears applause at the final results");
checks.check(played(await takeSounds(guest), "applause"), "Bob hears it too");

// With the switch off, painting is silent (in practice mode).
const solo = await openApp(browser, "solo", options);
await solo.openPractice();
await solo.solo.waitUntilShown();
await solo.map.waitUntilSettled();
await solo.hud.toggleSound();
await takeSounds(solo);
await solo.map.drag(spot, { distancePx: 80, steps: 10, holdMs: 600 });
checks.check(!(await takeSounds(solo)).some((e) => e.kind === "buffer"), "with sounds off, painting is silent");
await solo.hud.toggleSound();
await solo.map.drag({ across: 0.4, down: 0.4 }, { distancePx: 60, steps: 10, holdMs: 600 });
checks.check(played(await takeSounds(solo), "spray"), "switched back on, practice sprays");

await browser.close();
checks.finish();
