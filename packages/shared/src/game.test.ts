import { describe, expect, it } from "vitest";
import { Game, generateCode } from "./game.ts";
import { PaintLayer, resolutionForTolerance } from "./paint.ts";
import type { Question } from "./questions.ts";

const petra: Question = {
  id: "petra",
  kind: "text",
  prompt: "Where is Petra?",
  answer: { lat: 30.3285, lon: 35.4444 },
  toleranceKm: 200,
  label: "Petra",
  region: "world",
};
const paris: Question = {
  id: "paris",
  kind: "text",
  prompt: "Where is Paris?",
  answer: { lat: 48.8566, lon: 2.3522 },
  toleranceKm: 100,
  label: "Paris",
  region: "world",
};
const tokyo: Question = {
  id: "tokyo",
  kind: "text",
  prompt: "Where is Tokyo?",
  answer: { lat: 35.6762, lon: 139.6503 },
  toleranceKm: 100,
  label: "Tokyo",
  region: "world",
};
const pool = [petra, paris, tokyo];

const T0 = 1_000_000;

function paintAt(q: Question, lat: number, lon: number) {
  const layer = new PaintLayer(resolutionForTolerance(q.toleranceKm));
  layer.stamp({ lat, lon }, q.toleranceKm / 2, 1);
  return { cells: layer.toRecord(), floor: 0.05 };
}

function twoPlayerGame(rounds = 2) {
  const g = new Game("ABCD", pool, { rounds, roundMs: 60_000, revealMs: 20_000 }, 42);
  expect(g.join("tokA", "Alice", T0).ok).toBe(true);
  expect(g.join("tokB", "Bob", T0 + 1).ok).toBe(true);
  return g;
}

/** The question currently being asked, read back through a view. */
function currentQuestion(g: Game, token: string, now: number): Question {
  const prompt = g.view(token, now).round!.question.prompt;
  return pool.find((q) => q.prompt === prompt)!;
}

describe("lobby", () => {
  it("first joiner is host; host passes on disconnect; lobby leavers are removed", () => {
    const g = twoPlayerGame();
    expect(g.view("tokA", T0).you.isHost).toBe(true);
    expect(g.view("tokB", T0).you.isHost).toBe(false);
    g.disconnect("tokA");
    expect(g.playerTokens).toEqual(["tokB"]);
    expect(g.view("tokB", T0).you.isHost).toBe(true);
  });

  it("only the host can start", () => {
    const g = twoPlayerGame();
    expect(g.start("tokB", T0)).toEqual({ ok: false, error: "only the host can start" });
    expect(g.start("tokA", T0).ok).toBe(true);
    expect(g.phase).toBe("guessing");
  });

  it("caps rounds at the pool size", () => {
    const g = new Game("X", pool, { rounds: 10 }, 1);
    g.join("h", "H", T0);
    g.start("h", T0);
    expect(g.view("h", T0).round!.total).toBe(3);
  });
});

describe("round loop", () => {
  it("scores at the deadline, exact hit beats blank, blank scores the baseline", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.view("tokA", T0).round!.deadline).toBe(T0 + 60_000);

    expect(g.setPaint("tokA", paintAt(q, q.answer.lat, q.answer.lon))).toEqual({ ok: true, changed: false });
    // Bob paints nothing.
    expect(g.tick(T0 + 59_999)).toBe(false);
    expect(g.tick(T0 + 60_000)).toBe(true);
    expect(g.phase).toBe("reveal");

    const reveal = g.view("tokB", T0 + 60_000).reveal!;
    expect(reveal.label).toBe(q.label);
    expect(reveal.results).toHaveLength(2);
    const [first, second] = reveal.results;
    expect(first!.playerId).toBe("p1");
    expect(first!.score).toBeGreaterThan(900);
    expect(second!.paint).toBeNull();
    expect(Math.round(second!.score)).toBeGreaterThanOrEqual(500);
    expect(Math.round(second!.score)).toBeLessThan(540);
    expect(reveal.autoAdvanceAt).toBe(T0 + 80_000);
  });

  it("paint is private during guessing and visible after the reveal", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 10, 10));
    const during = g.view("tokB", T0 + 10);
    expect(during.reveal).toBeNull();
    expect(JSON.stringify(during)).not.toContain("cells");
    g.tick(T0 + 60_000);
    const after = g.view("tokB", T0 + 60_000);
    expect(after.reveal!.results.find((r) => r.playerId === "p1")!.paint).not.toBeNull();
  });

  it("locking freezes paint; late paint is rejected", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.lock("tokA")).toEqual({ ok: false, error: "nothing painted" });
    g.setPaint("tokA", paintAt(q, 0, 0));
    expect(g.lock("tokA")).toEqual({ ok: true, changed: true });
    expect(g.view("tokA", T0).you.locked).toBe(true);
    expect(g.setPaint("tokA", paintAt(q, 1, 1))).toEqual({ ok: false, error: "already locked" });
  });

  it("host advances early; auto-advances after revealMs; ends in results", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    expect(g.next("tokB", T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" });
    expect(g.next("tokA", T0 + 61_000).ok).toBe(true);
    expect(g.phase).toBe("guessing");
    expect(g.view("tokA", T0 + 61_000).round!.index).toBe(1);
    expect(g.nextWakeAt()).toBe(T0 + 121_000);
    g.tick(T0 + 121_000);
    expect(g.phase).toBe("reveal");
    expect(g.tick(T0 + 141_000)).toBe(true);
    expect(g.phase).toBe("results");
    const results = g.view("tokA", T0 + 141_000).results!;
    expect(results).toHaveLength(2);
    expect(results[0]!.total).toBeGreaterThanOrEqual(results[1]!.total);
    expect(results[0]!.rounds).toHaveLength(2);
  });

  it("asks each question at most once per game", () => {
    const g = twoPlayerGame(3);
    g.start("tokA", T0);
    const seen = new Set<string>();
    let now = T0;
    for (let i = 0; i < 3; i++) {
      seen.add(g.view("tokA", now).round!.question.prompt);
      now += 60_000;
      g.tick(now);
      g.next("tokA", now);
    }
    expect(seen.size).toBe(3);
  });
});

describe("joining and leaving mid-game", () => {
  it("late joiner spectates the current round and plays the next", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    expect(g.join("tokC", "Cara", T0 + 5).ok).toBe(true);
    expect(g.view("tokC", T0 + 5).you.spectating).toBe(true);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.setPaint("tokC", paintAt(q, 0, 0))).toEqual({ ok: false, error: "spectating this round" });
    g.tick(T0 + 60_000);
    expect(g.view("tokC", T0 + 60_000).reveal!.results.map((r) => r.playerId)).not.toContain("p3");
    g.next("tokA", T0 + 60_001);
    expect(g.view("tokC", T0 + 60_001).you.spectating).toBe(false);
    const q2 = currentQuestion(g, "tokC", T0 + 60_001);
    expect(g.setPaint("tokC", paintAt(q2, 0, 0)).ok).toBe(true);
  });

  it("a reconnecting player gets their own paint back, and only their own", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    const mine = paintAt(q, 10, 10);
    g.setPaint("tokA", mine);
    g.disconnect("tokA");
    g.join("tokA", "Alice", T0 + 5);
    expect(g.view("tokA", T0 + 5).you.paint).toEqual(mine);
    expect(g.view("tokB", T0 + 5).you.paint).toBeNull();
    expect(JSON.stringify(g.view("tokB", T0 + 5))).not.toContain(Object.keys(mine.cells)[0]);
    g.tick(T0 + 60_000);
    expect(g.view("tokA", T0 + 60_000).you.paint).toBeNull();
  });

  it("a disconnected player keeps their seat and score, and reclaims it by token", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    g.disconnect("tokB");
    expect(g.playerTokens).toContain("tokB");
    expect(g.view("tokA", T0 + 60_001).players.find((p) => p.id === "p2")!.connected).toBe(false);
    g.join("tokB", "Bob", T0 + 70_000);
    const bob = g.view("tokB", T0 + 70_000).players.find((p) => p.id === "p2")!;
    expect(bob.connected).toBe(true);
    expect(bob.score).toBeGreaterThan(0);
  });

  it("while the host is away the longest-standing player acts as host; the host regains it on return", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.disconnect("tokA");
    expect(g.view("tokB", T0 + 1).you.isHost).toBe(true);
    expect(g.view("tokB", T0 + 1).players.find((p) => p.id === "p2")!.isHost).toBe(true);
    g.tick(T0 + 60_000);
    expect(g.next("tokA", T0 + 60_000)).toEqual({ ok: false, error: "only the host can advance" });
    expect(g.next("tokB", T0 + 60_000).ok).toBe(true);
    // A refresh brings the original host straight back.
    g.join("tokA", "Alice", T0 + 61_000);
    expect(g.view("tokA", T0 + 61_000).you.isHost).toBe(true);
    expect(g.view("tokB", T0 + 61_000).you.isHost).toBe(false);
  });

  it("in the lobby a departing host hands over for good", () => {
    const g = twoPlayerGame(2);
    g.disconnect("tokA");
    g.join("tokA", "Alice", T0 + 5);
    expect(g.view("tokA", T0 + 5).you.isHost).toBe(false);
    expect(g.view("tokB", T0 + 5).you.isHost).toBe(true);
  });

  it("play again returns to the lobby with scores reset and dropped players pruned", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    g.tick(T0 + 80_000);
    expect(g.phase).toBe("results");
    expect(g.join("tokZ", "Zed", T0 + 80_001)).toEqual({ ok: false, error: "game has finished" });
    g.disconnect("tokB");
    expect(g.again("tokA", T0 + 81_000).ok).toBe(true);
    expect(g.phase).toBe("lobby");
    expect(g.playerTokens).toEqual(["tokA"]);
    expect(g.view("tokA", T0 + 81_000).players[0]!.score).toBe(0);
  });
});

describe("ranks", () => {
  it("ranks share on ties and record the previous rank for arrows", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, q.answer.lat, q.answer.lon));
    g.tick(T0 + 60_000);
    const v = g.view("tokA", T0 + 60_000);
    const a = v.players.find((p) => p.id === "p1")!;
    const b = v.players.find((p) => p.id === "p2")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(2);
    expect(a.previousRank).toBe(1);
    expect(b.previousRank).toBe(1);
  });
});

describe("generateCode", () => {
  it("uses the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });
});
