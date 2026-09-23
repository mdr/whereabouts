// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { countdownPlan, roundCue } from "./sound";

describe("countdownPlan", () => {
  it("waits until ten seconds are left, then plays from the start", () => {
    expect(countdownPlan(60_000)).toEqual({ delayMs: 50_000, offsetS: 0 });
    expect(countdownPlan(10_000)).toEqual({ delayMs: 0, offsetS: 0 });
  });

  it("joins partway when arriving with less than ten seconds left, so the alarm still lands on zero", () => {
    expect(countdownPlan(6_000)).toEqual({ delayMs: 0, offsetS: 4 });
    expect(countdownPlan(500)).toEqual({ delayMs: 0, offsetS: 9.5 });
  });

  it("plays nothing once time is up", () => {
    expect(countdownPlan(0)).toBeNull();
    expect(countdownPlan(-200)).toBeNull();
  });
});

describe("roundCue", () => {
  const lobby = { phase: "lobby", round: null };
  const guessing = (round: number) => ({ phase: "guessing", round });
  const reveal = (round: number) => ({ phase: "reveal", round });

  it("says nothing on the first view, so a refresh mid-round is not announced", () => {
    expect(roundCue(null, guessing(2), 30_000)).toBeNull();
  });

  it("cues a round starting, from the lobby or from the reveal", () => {
    expect(roundCue(lobby, guessing(0), 60_000)).toBe("roundStart");
    expect(roundCue(reveal(0), guessing(1), 60_000)).toBe("roundStart");
  });

  it("cues finishing early when the round ends with time on the clock", () => {
    expect(roundCue(guessing(0), reveal(0), 20_000)).toBe("finishedEarly");
  });

  it("leaves the alarm to play when the round ends on time", () => {
    expect(roundCue(guessing(0), reveal(0), 100)).toBeNull();
    expect(roundCue(guessing(0), reveal(0), -300)).toBeNull();
  });

  it("stops the countdown when the host ends the game mid-round", () => {
    expect(roundCue(guessing(1), { phase: "results", round: null }, 30_000)).toBe("stop");
  });

  it("stays quiet for changes within a phase", () => {
    expect(roundCue(guessing(1), guessing(1), 30_000)).toBeNull();
    expect(roundCue(reveal(1), reveal(1), 0)).toBeNull();
  });
});
