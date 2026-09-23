// Checks the game's sounds start and stop when they should, by recording
// every Web Audio source the page starts (it cannot judge how they sound).
// Two players: the rising cue at round start, the spray while painting (and
// not while erasing), the countdown at ten seconds left, the falling cue and
// no alarm when everyone finishes early, the alarm when time runs out, and
// silence with the switch off. Needs the dev servers, with the game server
// run as ROUND_MS=12000 ROUNDS=2. Usage, from packages/client:
// node scripts/sound-smoke.mjs
import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});

// Record each source start (and stop) with the audio clock time.
const recorder = () => {
  window.__audio = [];
  const log = (e) => window.__audio.push({ ...e, at: performance.now() });
  // spray.mp3 is about 26 s long, countdown.mp3 12.5 s.
  const clipOf = (b) => (!b ? null : b.duration > 20 ? "spray" : b.duration > 10 ? "countdown" : "other");
  const bufStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
    log({ kind: "buffer", clip: clipOf(this.buffer), offset, duration });
    return bufStart.apply(this, arguments);
  };
  const bufStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function () {
    log({ kind: "stop", clip: clipOf(this.buffer) });
    return bufStop.apply(this, arguments);
  };
  const oscStart = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function () {
    log({ kind: "osc", freq: Math.round(this.frequency.value) });
    return oscStart.apply(this, arguments);
  };
};

async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(recorder);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  return page;
}
const events = (page) => page.evaluate(() => window.__audio.splice(0));
const SPRAY = "spray";
const COUNTDOWN = "countdown";
const cueNotes = (evs) => evs.filter((e) => e.kind === "osc" && e.freq < 1500).map((e) => e.freq);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};

const host = await player("host");
await host.goto(`${BASE}/`);
await host.fill(".home-name input", "Ann");
await host.click('button:has-text("Host a game")');
await host.waitForSelector(".lobby .code");
const code = (await host.textContent(".lobby .code")).replace(/\s/g, "");
const guest = await player("guest");
await guest.goto(`${BASE}/#/game/${code}`);
await guest.fill(".field input", "Bob");
await guest.click('button:has-text("Join")');
await host.waitForSelector("text=Bob");
await events(host);
await events(guest);

// Round 1 starts: both hear the rising pair (low note first).
const startedAt = await host.evaluate(() => performance.now());
await host.click('button:has-text("Start game")');
await guest.waitForSelector(".tools button:not([disabled])");
await host.waitForSelector(".tools button:not([disabled])");
await host.waitForTimeout(300);
const sinceStart = [];
for (const [name, page] of [
  ["host", host],
  ["guest", guest],
]) {
  const evs = await events(page);
  if (page === host) sinceStart.push(...evs);
  const notes = cueNotes(evs);
  check(`${name} hears the round-start cue`, notes.length === 2 && notes[0] < notes[1], JSON.stringify(notes));
}

// A held stroke sprays; erasing does not.
const box = await (await host.$("#map canvas")).boundingBox();
const stroke = async (page, ms) => {
  await page.mouse.move(box.x + 600, box.y + 400);
  await page.mouse.down();
  for (let i = 0; i < ms / 50; i++) {
    await page.mouse.move(box.x + 600 + i * 3, box.y + 400);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
};
await stroke(host, 1500);
let evs = await events(host);
sinceStart.push(...evs);
const sprays = evs.filter((e) => e.kind === "buffer" && e.clip === SPRAY);
check("a held stroke plays spray slices", sprays.length >= 1, `${sprays.length} slices`);
check(
  "releasing stops the spray",
  evs.some((e) => e.kind === "stop" && e.clip === SPRAY),
);
await host.click('button:has-text("Erase")');
await stroke(host, 800);
evs = await events(host);
sinceStart.push(...evs);
check("erasing is silent", !evs.some((e) => e.kind === "buffer" && e.clip === SPRAY));
await host.click('button:has-text("Paint")');

// The countdown starts with ten seconds left (the round is 12 s).
await host.waitForTimeout(1500);
sinceStart.push(...(await events(host)));
const ticks = sinceStart.filter((e) => e.kind === "buffer" && e.clip === COUNTDOWN);
const tickAt = ticks.map((e) => ((e.at - startedAt) / 1000).toFixed(1) + " s");
// About 2 s after Start: the round is 12 s, so ten are left then.
check(
  "the countdown starts at ten seconds left",
  ticks.length === 1 && Math.abs((ticks[0].at - startedAt) / 1000 - 2) < 1,
  `started at ${tickAt.join(", ") || "never"} after Start`,
);
await events(guest);

// Everyone done early: the falling pair, and the countdown stops before its alarm.
await guest.click('button:has-text("Pass")');
await host.click('button:has-text("Done")');
await host.waitForSelector(".reveal-list, .reveal", { timeout: 10000 });
await host.waitForTimeout(300);
evs = await events(host);
const notes = cueNotes(evs);
check("finishing early plays the falling cue", notes.length === 2 && notes[0] > notes[1], JSON.stringify(notes));
check(
  "finishing early stops the countdown",
  evs.some((e) => e.kind === "stop" && e.clip === COUNTDOWN),
);

// Round 2 runs out of time: the countdown plays through to its alarm, no falling cue.
await host.click('button:has-text("Next round")');
await host.waitForSelector('button:has-text("Pass")', { timeout: 15000 }).catch(async (e) => {
  console.log("host sees:", (await host.textContent("body")).slice(0, 400));
  throw e;
});
await events(host);
await host.waitForSelector(".reveal-list, .reveal", { timeout: 20000 });
await host.waitForTimeout(500);
evs = await events(host);
check("running out of time plays no falling cue", cueNotes(evs).length === 0, JSON.stringify(cueNotes(evs)));
check(
  "the alarm is left to play",
  !evs.some((e) => e.kind === "stop" && e.clip === COUNTDOWN),
  JSON.stringify(evs.map((e) => e.kind + (e.clip ?? e.freq))),
);

// With the switch off, painting is silent (checked in practice mode).
const solo = await player("solo");
await solo.goto(`${BASE}/#/solo`);
await solo.waitForSelector('button:has-text("Submit")');
await solo.waitForTimeout(1500);
await solo.click(".sound-toggle");
await events(solo);
const sbox = await (await solo.$("#map canvas")).boundingBox();
await solo.mouse.move(sbox.x + 600, sbox.y + 400);
await solo.mouse.down();
await solo.mouse.move(sbox.x + 680, sbox.y + 420, { steps: 10 });
await solo.waitForTimeout(600);
await solo.mouse.up();
evs = await events(solo);
check("with sounds off, painting is silent", !evs.some((e) => e.kind === "buffer"));
await solo.click(".sound-toggle");
await solo.mouse.move(sbox.x + 500, sbox.y + 300);
await solo.mouse.down();
await solo.mouse.move(sbox.x + 560, sbox.y + 320, { steps: 10 });
await solo.waitForTimeout(600);
await solo.mouse.up();
evs = await events(solo);
check(
  "switched back on, practice sprays",
  evs.some((e) => e.kind === "buffer" && e.clip === SPRAY),
);

await browser.close();
console.log(failures ? `${failures} FAILED` : "all sound checks passed");
process.exit(failures ? 1 : 0);
