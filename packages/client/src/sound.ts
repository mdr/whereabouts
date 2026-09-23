/**
 * Game sounds: a spray while painting and an eraser rubbing while erasing,
 * the last-ten-seconds countdown, a soft marimba pair for a round starting
 * and for a round finishing early, a chicken for a pass, a whoosh for Clear,
 * and applause for the final results. One per-device switch (`soundOn` in
 * settings) silences everything.
 *
 * Browsers only let a page make sound after the player has tapped or pressed
 * something, so the audio context is created on the first such gesture, and
 * the recordings are fetched then too, never on page load.
 *
 * Sources, all CC0 on Freesound, cut and volume-matched:
 * - spray.mp3: ten steady stretches of "paint in spray 02.wav" by lukebadluck
 *   (#339121), 0.1 s of silence between them.
 * - eraser.mp3: nine rubs of "Eraser on Paper_1-2.aif" by lucaslara (#154461),
 *   laid out the same way.
 * - countdown.mp3: the last 10 s of ticking from "marktimer.wav" by MuzakPlz
 *   (#626908), its alarm cut to 2.5 s and faded, so the alarm starts 10 s in.
 * - chicken.mp3: the first three clucks of "Chicken clucking" by Breviceps
 *   (#456803).
 * - clear.mp3: "Swipe Whoosh" by qubodup (#60007).
 * - applause.mp3: "Voice_Crowd_Small_Expression_Applause_Stereo" by Nox_Sound
 *   (#752710).
 */
import { effect } from "@preact/signals";
import sprayUrl from "./assets/sounds/spray.mp3";
import eraserUrl from "./assets/sounds/eraser.mp3";
import countdownUrl from "./assets/sounds/countdown.mp3";
import chickenUrl from "./assets/sounds/chicken.mp3";
import clearUrl from "./assets/sounds/clear.mp3";
import applauseUrl from "./assets/sounds/applause.mp3";
import { soundOn } from "./settings";

type Slices = readonly (readonly [number, number])[];

/** A recording of separate stretches ([start, length] in seconds) chained at random while a stroke is held. */
interface Loop {
  slices: Slices;
  volume: number;
  /** How much of each later stretch's start to skip, so a long stroke sounds continuous. */
  attackS: number;
  crossfadeS: number;
}

const LOOPS = {
  spray: {
    slices: [
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
    ],
    volume: 0.55,
    attackS: 0.15,
    crossfadeS: 0.12,
  },
  eraser: {
    slices: [
      [0, 0.3],
      [0.4, 0.34],
      [0.84, 0.5],
      [1.44, 0.38],
      [1.92, 0.3],
      [2.32, 0.46],
      [2.88, 0.3],
      [3.28, 0.3],
      [3.68, 0.8],
    ],
    volume: 0.4,
    attackS: 0,
    crossfadeS: 0.06,
  },
} satisfies Record<string, Loop>;
export type LoopName = keyof typeof LOOPS;

const RELEASE_S = 0.06;
/** Seconds of ticking before the alarm in countdown.mp3. */
export const COUNTDOWN_S = 10;
/** The countdown starts soft and reaches full volume at the alarm. */
const COUNTDOWN_START_GAIN = 0.25;

const ONE_SHOT_VOLUME = { chicken: 0.45, clear: 0.5, applause: 0.6 };
export type OneShot = keyof typeof ONE_SHOT_VOLUME;
const VOLUME = { countdown: 0.6, cue: 0.3 };

const URLS = {
  spray: sprayUrl,
  eraser: eraserUrl,
  countdown: countdownUrl,
  chicken: chickenUrl,
  clear: clearUrl,
  applause: applauseUrl,
};
type Clip = keyof typeof URLS;

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

/** More than this left when a round ends counts as finishing early rather than on time. */
const EARLY_MS = 750;

/**
 * The cue a change of game state calls for. A round starting (from the lobby
 * or the reveal) gets the rising pair. A round ending with time still on the
 * clock means everyone finished early: the falling pair, and the countdown
 * stops before its alarm; ending on time lets the alarm play out. Reaching
 * the final results gets applause (and stops a countdown, if the host ended
 * the game mid-round). `prev` is null on the first view after loading, which
 * never cues anything: a refresh should not announce what is already there.
 */
export function roundCue(
  prev: RoundState | null,
  next: RoundState,
  msLeftAtChange: number,
): "roundStart" | "finishedEarly" | "results" | null {
  if (!prev) return null;
  if (next.phase === "guessing" && (prev.phase !== "guessing" || prev.round !== next.round)) return "roundStart";
  if (prev.phase === "guessing" && next.phase === "reveal") return msLeftAtChange > EARLY_MS ? "finishedEarly" : null;
  if (next.phase === "results" && prev.phase !== "results") return "results";
  return null;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Partial<Record<Clip, AudioBuffer>> = {};
  private loading = false;
  private stroke: { loop: LoopName; voices: Voice[]; nextAt: number; last: number; timer: number } | null = null;
  private ticking: Voice | null = null;
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
    if (this.loading) return;
    this.loading = true;
    for (const [clip, url] of Object.entries(URLS) as [Clip, string][]) {
      void this.load(url).then((b) => (this.buffers[clip] = b));
    }
  }

  private async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    return this.ctx!.decodeAudioData(await res.arrayBuffer());
  }

  private ready(): AudioContext | null {
    return soundOn.value && this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  // ---- strokes: spray and eraser ----------------------------------------------

  /** The sound for the stroke being held: a loop's name, or null for none. Safe to repeat. */
  setStroke(loop: LoopName | null): void {
    if (this.stroke && this.stroke.loop !== loop) this.stopStroke();
    if (loop) this.startStroke(loop);
  }

  private startStroke(loop: LoopName): void {
    const ctx = this.ready();
    if (!ctx || !this.buffers[loop] || this.stroke) return;
    this.stroke = { loop, voices: [], nextAt: ctx.currentTime + 0.01, last: -1, timer: 0 };
    this.scheduleStroke();
  }

  /** Keep half a second of stretches queued: random each time, never the same twice running. */
  private scheduleStroke(): void {
    const ctx = this.ctx;
    const stroke = this.stroke;
    const buffer = stroke && this.buffers[stroke.loop];
    if (!ctx || !stroke || !buffer) return;
    const loop: Loop = LOOPS[stroke.loop];
    while (stroke.nextAt < ctx.currentTime + 0.5) {
      let i: number;
      do i = Math.floor(Math.random() * loop.slices.length);
      while (i === stroke.last);
      const [offset, length] = loop.slices[i]!;
      const first = stroke.voices.length === 0;
      const skip = first ? 0 : Math.min(loop.attackS, length / 3);
      const dur = length - skip;
      const at = stroke.nextAt;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      src.connect(gain).connect(this.master!);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(loop.volume, at + (first ? 0.015 : loop.crossfadeS));
      gain.gain.setValueAtTime(loop.volume, at + dur - loop.crossfadeS);
      gain.gain.linearRampToValueAtTime(0, at + dur);
      src.start(at, offset + skip, dur);
      stroke.voices.push({ src, gain });
      // Keep only the voices that may still be sounding.
      if (stroke.voices.length > 4) stroke.voices.splice(0, stroke.voices.length - 4);
      stroke.last = i;
      stroke.nextAt = at + dur - loop.crossfadeS;
    }
    stroke.timer = window.setTimeout(() => this.scheduleStroke(), 100);
  }

  private stopStroke(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.stroke = null;
    clearTimeout(stroke.timer);
    for (const v of stroke.voices) this.fadeOut(v, RELEASE_S);
  }

  private fadeOut(v: Voice, seconds: number): void {
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
    const buffer = this.buffers.countdown;
    if (!ctx || !buffer) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
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

  // ---- one-shots and cues ------------------------------------------------------

  /** Play a recording once: the chicken for a pass, the whoosh for Clear, applause at the end. */
  play(name: OneShot): void {
    const ctx = this.ready();
    const buffer = this.buffers[name];
    if (!ctx || !buffer) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = ONE_SHOT_VOLUME[name];
    src.connect(gain).connect(this.master!);
    src.start(ctx.currentTime + 0.01);
  }

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
    this.stopStroke();
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
