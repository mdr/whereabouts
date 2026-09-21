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
  const g = new Game("ABCD", pool, { rounds, roundMs: 60_000 }, 42);
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
    g.disconnect("tokA", T0);
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
    expect(reveal.ready).toEqual([]);
    expect(g.nextWakeAt()).toBeNull();
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
    g.setPaint("tokA", paintAt(q, 0, 0));
    expect(g.lock("tokA", T0)).toEqual({ ok: true, changed: true });
    expect(g.view("tokA", T0).you.locked).toBe(true);
    expect(g.setPaint("tokA", paintAt(q, 1, 1))).toEqual({ ok: true, changed: false }); // stale upload, ignored
  });

  it("locking with nothing painted is a pass: baseline score, no paint, and the round can end early", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.lock("tokA", T0)).toEqual({ ok: true, changed: true });
    expect(g.view("tokA", T0).you.locked).toBe(true);
    // Paint arriving after a pass is a stale upload and changes nothing.
    expect(g.setPaint("tokA", paintAt(q, 0, 0))).toEqual({ ok: true, changed: false });
    g.setPaint("tokB", paintAt(q, 0, 0));
    g.lock("tokB", T0 + 5);
    expect(g.phase).toBe("reveal");
    const mine = g.view("tokA", T0 + 5).reveal!.results.find((r) => r.playerId === "p1")!;
    expect(mine.paint).toBeNull();
    expect(Math.round(mine.score)).toBeGreaterThanOrEqual(500);
    expect(Math.round(mine.score)).toBeLessThan(540);
  });

  it("the round ends as soon as every active connected player has locked in", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.join("tokC", "Cara", T0 + 5); // spectating: must not hold the round up
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.setPaint("tokB", paintAt(q, 1, 1));
    g.lock("tokA", T0 + 10);
    expect(g.phase).toBe("guessing");
    g.lock("tokB", T0 + 20);
    expect(g.phase).toBe("reveal");
    expect(g.view("tokA", T0 + 20).reveal!.results).toHaveLength(2);
  });

  it("a dropped player does not hold up a round the others have locked", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.lock("tokA", T0 + 10);
    expect(g.phase).toBe("guessing");
    g.disconnect("tokB", T0 + 20);
    expect(g.phase).toBe("reveal");
    // Bob still gets scored (blank) and keeps his seat.
    expect(g.view("tokA", T0 + 20).reveal!.results).toHaveLength(2);
    expect(g.playerTokens).toContain("tokB");
  });

  it("the reveal advances when everyone is ready, or when the host says so; ends in results", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    expect(g.nextWakeAt()).toBeNull();
    expect(g.next("tokB", T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" });
    expect(g.ready("tokB", T0 + 61_000)).toEqual({ ok: true, changed: true });
    expect(g.ready("tokB", T0 + 61_000)).toEqual({ ok: true, changed: false });
    expect(g.phase).toBe("reveal");
    expect(g.view("tokA", T0 + 61_000).reveal!.ready).toEqual(["p2"]);
    expect(g.ready("tokA", T0 + 62_000).ok).toBe(true);
    expect(g.phase).toBe("guessing");
    expect(g.view("tokA", T0 + 62_000).round!.index).toBe(1);
    expect(g.nextWakeAt()).toBe(T0 + 122_000);
    g.tick(T0 + 122_000);
    expect(g.phase).toBe("reveal");
    expect(g.view("tokA", T0 + 122_000).reveal!.ready).toEqual([]);
    expect(g.ready("tokA", T0 + 123_000)).toEqual({ ok: true, changed: true });
    // The host need not wait for Bob.
    expect(g.next("tokA", T0 + 124_000).ok).toBe(true);
    expect(g.phase).toBe("results");
    const results = g.view("tokA", T0 + 124_000).results!;
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
    g.disconnect("tokA", T0 + 1);
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
    g.disconnect("tokB", T0 + 60_001);
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
    g.disconnect("tokA", T0 + 1);
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
    g.disconnect("tokA", T0 + 1);
    g.join("tokA", "Alice", T0 + 5);
    expect(g.view("tokA", T0 + 5).you.isHost).toBe(false);
    expect(g.view("tokB", T0 + 5).you.isHost).toBe(true);
  });

  it("play again returns to the lobby with scores reset and dropped players pruned", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    g.next("tokA", T0 + 80_000);
    expect(g.phase).toBe("results");
    expect(g.join("tokZ", "Zed", T0 + 80_001)).toEqual({ ok: false, error: "game has finished" });
    g.disconnect("tokB", T0 + 80_002);
    expect(g.again("tokA", T0 + 81_000).ok).toBe(true);
    expect(g.phase).toBe("lobby");
    expect(g.playerTokens).toEqual(["tokA"]);
    expect(g.view("tokA", T0 + 81_000).players[0]!.score).toBe(0);
  });
});

describe("rename", () => {
  it("changes the visible name for everyone, in any phase", () => {
    const g = twoPlayerGame(1);
    expect(g.rename("tokB", "Robert")).toEqual({ ok: true, changed: true });
    expect(
      g
        .view("tokA", T0)
        .players.map((p) => p.name)
        .sort(),
    ).toEqual(["Alice", "Robert"]);
    g.start("tokA", T0);
    expect(g.rename("tokB", "Bobby").ok).toBe(true);
    expect(g.rename("tokB", "Bobby")).toEqual({ ok: true, changed: false });
    expect(g.rename("nobody", "X")).toEqual({ ok: false, error: "unknown player" });
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

describe("ready-up edge cases", () => {
  it("a player leaving during the reveal does not hold the others up", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    g.ready("tokA", T0 + 61_000);
    expect(g.phase).toBe("reveal");
    g.disconnect("tokB", T0 + 62_000);
    expect(g.phase).toBe("guessing");
  });

  it("nobody left connected means nothing advances", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    g.disconnect("tokA", T0 + 61_000);
    g.disconnect("tokB", T0 + 61_001);
    expect(g.phase).toBe("reveal");
  });

  it("ready is only meaningful during the reveal, and resets each round", () => {
    const g = twoPlayerGame(2);
    g.start("tokA", T0);
    expect(g.ready("tokA", T0)).toEqual({ ok: false, error: "nothing to be ready for" });
    g.tick(T0 + 60_000);
    g.ready("tokA", T0 + 61_000);
    g.ready("tokB", T0 + 61_000);
    g.tick(T0 + 121_000);
    expect(g.view("tokA", T0 + 121_000).reveal!.ready).toEqual([]);
  });
});

describe("configure", () => {
  it("lets the host change rounds and round length in the lobby only", () => {
    const g = twoPlayerGame();
    expect(g.configure("tokB", { rounds: 3 })).toEqual({ ok: false, error: "only the host can change settings" });
    expect(g.configure("tokA", { rounds: 3 })).toEqual({ ok: true, changed: true });
    expect(g.configure("tokA", { rounds: 3 })).toEqual({ ok: true, changed: false });
    expect(g.configure("tokA", { roundMs: 30_000 }).ok).toBe(true);
    const v = g.view("tokB", T0);
    expect(v.config.rounds).toBe(3);
    expect(v.config.roundMs).toBe(30_000);
    g.start("tokA", T0);
    expect(g.view("tokA", T0).round!.total).toBe(3);
    expect(g.view("tokA", T0).round!.deadline).toBe(T0 + 30_000);
    expect(g.configure("tokA", { rounds: 5 })).toEqual({
      ok: false,
      error: "settings are locked once the game starts",
    });
  });

  it("reports who has locked in", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.lock("tokA", T0 + 1);
    const players = g.view("tokB", T0 + 1).players;
    expect(players.find((p) => p.id === "p1")!.locked).toBe(true);
    expect(players.find((p) => p.id === "p2")!.locked).toBe(false);
  });
});

describe("host removes a player", () => {
  it("drops their seat and paint, bans the token, and lets a fresh token in", () => {
    const g = twoPlayerGame();
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokB", paintAt(q, q.answer.lat, q.answer.lon));
    const bobId = g.view("tokB", T0).you.id;
    expect(g.kick("tokB", g.view("tokA", T0).you.id, T0)).toEqual({
      ok: false,
      error: "only the host can remove players",
    });
    expect(g.kick("tokA", g.view("tokA", T0).you.id, T0)).toEqual({ ok: false, error: "you cannot remove yourself" });
    expect(g.kick("tokA", "nope", T0)).toEqual({ ok: false, error: "unknown player" });
    expect(g.kick("tokA", bobId, T0).ok).toBe(true);
    expect(g.playerTokens).toEqual(["tokA"]);
    expect(g.join("tokB", "Bob again", T0)).toEqual({ ok: false, error: "removed by the host" });
    expect(g.join("tokC", "Carol", T0).ok).toBe(true);
    // Bob's paint must not surface when the round ends.
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.lock("tokA", T0);
    expect(g.phase).toBe("reveal");
    expect(g.view("tokA", T0).reveal!.results.map((r) => r.playerId)).not.toContain(bobId);
  });

  it("removing the last unlocked player ends the round; removing an absent host passes the role", () => {
    const g = twoPlayerGame();
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.lock("tokA", T0);
    expect(g.phase).toBe("guessing");
    g.kick("tokA", g.view("tokB", T0).you.id, T0);
    expect(g.phase).toBe("reveal");

    const h = twoPlayerGame();
    h.start("tokA", T0);
    h.disconnect("tokA", T0);
    // Bob acts as host while Alice is away, and may remove her for good.
    const alice = h.view("tokB", T0).players.find((p) => !p.connected)!;
    expect(h.kick("tokB", alice.id, T0).ok).toBe(true);
    expect(h.playerTokens).toEqual(["tokB"]);
    expect(h.view("tokB", T0).you.isHost).toBe(true);
    // Alice reconnecting does not get her seat or the role back.
    expect(h.join("tokA", "Alice", T0).ok).toBe(false);
  });
});

describe("host ends the game early", () => {
  it("scores the running round and jumps to results; only the host; nothing to end in the lobby", () => {
    const g = twoPlayerGame(3);
    expect(g.end("tokA")).toEqual({ ok: false, error: "nothing to end" });
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, q.answer.lat, q.answer.lon));
    expect(g.end("tokB")).toEqual({ ok: false, error: "only the host can end the game" });
    expect(g.end("tokA").ok).toBe(true);
    expect(g.phase).toBe("results");
    const results = g.view("tokA", T0).results!;
    expect(results[0]!.rounds).toHaveLength(1);
    expect(results[0]!.total).toBeGreaterThan(500);
  });

  it("works from the reveal too", () => {
    const g = twoPlayerGame(3);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.setPaint("tokB", paintAt(q, 0, 0));
    g.lock("tokA", T0);
    g.lock("tokB", T0);
    expect(g.phase).toBe("reveal");
    expect(g.end("tokA").ok).toBe(true);
    expect(g.phase).toBe("results");
  });
});
