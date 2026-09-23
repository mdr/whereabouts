/**
 * Game sounds: the spray while painting, the last-ten-seconds countdown, and
 * a soft marimba pair for a round starting and for a round finishing early.
 * One per-device switch (`soundOn` in settings) silences everything.
 *
 * Browsers only let a page make sound after the player has tapped or pressed
 * something, so the audio context is created on the first such gesture, and
 * the two recordings are fetched then too, never on page load.
 *
 * Sources, both CC0 on Freesound:
 * - spray.mp3: ten steady stretches cut from "paint in spray 02.wav" by
 *   lukebadluck (#339121), volume-matched, 0.1 s of silence between them.
 * - countdown.mp3: the last 10 s of ticking from "marktimer.wav" by MuzakPlz
 *   (#626908), with its alarm cut to 2.5 s and faded, so the alarm starts
 *   exactly 10 s in.
 */
import { effect } from "@preact/signals";
import sprayUrl from "./assets/sounds/spray.mp3";
import countdownUrl from "./assets/sounds/countdown.mp3";
import { soundOn } from "./settings";

/** [start, length] in seconds of each spray stretch within spray.mp3. */
const SPRAY_SLICES: readonly (readonly [number, number])[] = [
  [0, 3.23],
  [3.33, 2.78],
  [6.21, 2.25],
  [8.56, 2.97],
  [11.63, 4.85],
  [16.58, 2.08],
  [18.76, 1.45],
  [20.31, 1.67],
  [22.08, 1.6],
  [23.78, 2.5],
];
/** Slices after a stroke's first skip their opening "pssh" so a long stroke sounds continuous. */
const SPRAY_ATTACK_S = 0.15;
const SPRAY_CROSSFADE_S = 0.12;
const SPRAY_RELEASE_S = 0.06;
/** Seconds of ticking before the alarm in countdown.mp3. */
export const COUNTDOWN_S = 10;
/** The countdown starts soft and reaches full volume at the alarm. */
const COUNTDOWN_START_GAIN = 0.25;

const VOLUME = { spray: 0.55, countdown: 0.6, cue: 0.3 };

/**
 * When to start the countdown for a round with `msLeft` to go: after
 * `delayMs`, from `offsetS` into the clip. Arriving with 6 s left starts 4 s
 * in, so the alarm still lands on zero; with no time left there is nothing.
 */
export function countdownPlan(msLeft: number): { delayMs: number; offsetS: number } | null {
  if (msLeft <= 0) return null;
  const leadMs = COUNTDOWN_S * 1000;
  if (msLeft >= leadMs) return { delayMs: msLeft - leadMs, offsetS: 0 };
  return { delayMs: 0, offsetS: (leadMs - msLeft) / 1000 };
}

export interface RoundState {
  phase: string;
  /** Index of the round being played or revealed, if any. */
  round: number | null;
}

/**
 * The cue a change of game state calls for. A round starting (from the lobby
 * or the reveal) gets the rising pair. A round ending with time still on the
 * clock means everyone finished early: the falling pair, and the countdown
 * stops before its alarm. Ending on time lets the alarm play out.
 * `prev` is null on the first view after loading, which never cues anything:
 * a refresh mid-round should not announce the round.
 */
export function roundCue(
  prev: RoundState | null,
  next: RoundState,
  msLeftAtChange: number,
): "roundStart" | "finishedEarly" | "stop" | null {
  if (!prev) return null;
  if (next.phase === "guessing" && (prev.phase !== "guessing" || prev.round !== next.round)) return "roundStart";
  if (prev.phase === "guessing" && next.phase === "reveal") return msLeftAtChange > EARLY_MS ? "finishedEarly" : null;
  if (prev.phase === "guessing" && next.phase !== "guessing") return "stop";
  return null;
}
/** More than this left when a round ends counts as finishing early rather than on time. */
const EARLY_MS = 750;

type Ctx = AudioContext;

class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private spray: AudioBuffer | null = null;
  private countdown: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private stroke: {
    voices: { src: AudioBufferSourceNode; gain: GainNode }[];
    nextAt: number;
    last: number;
    timer: number;
  } | null = null;
  private ticking: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pendingCountdown: number | null = null;

  /** Create the audio context and start loading; call from a user gesture. */
  unlock(): void {
    const Ctor = typeof window === "undefined" ? undefined : window.AudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.loading ??= Promise.all([this.load(sprayUrl), this.load(countdownUrl)]).then(([s, c]) => {
      this.spray = s;
      this.countdown = c;
    });
  }

  private async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    return this.ctx!.decodeAudioData(await res.arrayBuffer());
  }

  private ready(): Ctx | null {
    return soundOn.value && this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  // ---- spray -----------------------------------------------------------------

  /** Start or stop the spray; safe to call repeatedly with the same value. */
  setSpraying(on: boolean): void {
    if (on) this.startSpray();
    else this.stopSpray();
  }

  private startSpray(): void {
    const ctx = this.ready();
    if (!ctx || !this.spray || this.stroke) return;
    this.stroke = { voices: [], nextAt: ctx.currentTime + 0.01, last: -1, timer: 0 };
    this.scheduleSpray();
  }

  /** Keep half a second of slices queued: random each time, never the same twice running. */
  private scheduleSpray(): void {
    const ctx = this.ctx;
    const stroke = this.stroke;
    if (!ctx || !stroke || !this.spray) return;
    while (stroke.nextAt < ctx.currentTime + 0.5) {
      let i: number;
      do i = Math.floor(Math.random() * SPRAY_SLICES.length);
      while (i === stroke.last);
      const [offset, length] = SPRAY_SLICES[i]!;
      const first = stroke.voices.length === 0;
      const skip = first ? 0 : Math.min(SPRAY_ATTACK_S, length / 3);
      const dur = length - skip;
      const at = stroke.nextAt;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = this.spray;
      src.connect(gain).connect(this.master!);
      const fadeIn = first ? 0.015 : SPRAY_CROSSFADE_S;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(VOLUME.spray, at + fadeIn);
      gain.gain.setValueAtTime(VOLUME.spray, at + dur - SPRAY_CROSSFADE_S);
      gain.gain.linearRampToValueAtTime(0, at + dur);
      src.start(at, offset + skip, dur);
      stroke.voices.push({ src, gain });
      // Drop voices that have finished so a long stroke does not pile them up.
      if (stroke.voices.length > 4) stroke.voices.splice(0, stroke.voices.length - 4);
      stroke.last = i;
      stroke.nextAt = at + dur - SPRAY_CROSSFADE_S;
    }
    stroke.timer = window.setTimeout(() => this.scheduleSpray(), 100);
  }

  private stopSpray(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.stroke = null;
    clearTimeout(stroke.timer);
    for (const v of stroke.voices) this.fadeOut(v, SPRAY_RELEASE_S);
  }

  private fadeOut(v: { src: AudioBufferSourceNode; gain: GainNode }, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + seconds);
      v.src.stop(t + seconds + 0.02);
    } catch {
      /* already stopped */
    }
  }

  // ---- countdown ---------------------------------------------------------------

  /** Arrange the countdown for a round with `msLeft` to go, replacing any other. */
  scheduleCountdown(msLeft: number): void {
    this.stopCountdown();
    const plan = countdownPlan(msLeft);
    if (!plan) return;
    this.pendingCountdown = window.setTimeout(() => {
      this.pendingCountdown = null;
      this.playCountdown(plan.offsetS);
    }, plan.delayMs);
  }

  private playCountdown(offsetS: number): void {
    const ctx = this.ready();
    if (!ctx || !this.countdown) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = this.countdown;
    src.connect(gain).connect(this.master!);
    const t = ctx.currentTime + 0.01;
    const progress = Math.min(1, offsetS / COUNTDOWN_S);
    const startGain = VOLUME.countdown * (COUNTDOWN_START_GAIN + (1 - COUNTDOWN_START_GAIN) * progress);
    gain.gain.setValueAtTime(startGain, t);
    gain.gain.linearRampToValueAtTime(VOLUME.countdown, t + Math.max(0, COUNTDOWN_S - offsetS));
    src.start(t, offsetS);
    src.onended = () => {
      if (this.ticking?.src === src) this.ticking = null;
    };
    this.ticking = { src, gain };
  }

  /** Stop the countdown (and cancel one still to come) before its alarm. */
  stopCountdown(): void {
    if (this.pendingCountdown !== null) clearTimeout(this.pendingCountdown);
    this.pendingCountdown = null;
    if (this.ticking) this.fadeOut(this.ticking, 0.08);
    this.ticking = null;
  }

  // ---- cues ----------------------------------------------------------------------

  /** Two soft marimba notes a fifth apart: rising for a round starting, falling for finishing early. */
  cue(kind: "roundStart" | "finishedEarly"): void {
    const ctx = this.ready();
    if (!ctx) return;
    const low = 659;
    const notes = kind === "roundStart" ? [low, low * 1.5] : [low * 1.5, low];
    const t = ctx.currentTime + 0.01;
    notes.forEach((f, i) => this.mallet(f, t + i * 0.14));
  }

  /** A mallet tone: a sine with two quickly decaying overtones. */
  private mallet(freq: number, at: number): void {
    const ctx = this.ctx!;
    for (const [mult, amp, decay] of [
      [1, 1, 0.9],
      [4, 0.25, 0.15],
      [10, 0.05, 0.05],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(VOLUME.cue * amp, at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(gain).connect(this.master!);
      osc.start(at);
      osc.stop(at + decay + 0.05);
    }
  }

  /** Silence everything at once, for the switch going off or leaving a game. */
  stopAll(): void {
    this.stopSpray();
    this.stopCountdown();
  }
}

export const sound = new SoundEngine();

let installed = false;

/**
 * Unlock audio on the first tap or key press, and silence everything when
 * the switch goes off. Call once at start-up.
 */
export function installSound(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const unlock = () => sound.unlock();
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
  effect(() => {
    if (!soundOn.value) sound.stopAll();
  });
}
