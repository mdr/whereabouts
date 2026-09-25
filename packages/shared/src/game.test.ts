import { describe, expect, it } from "vitest";
import { Game, generateCode, nextHostAfter } from "./game.ts";
import { PaintLayer, resolutionForTolerance } from "./paint.ts";
import { PASS_SCORE } from "./scoring.ts";
import type { Question } from "./questions.ts";
import { MAX_PLAYERS, MAX_SPECTATORS, SEAT_GRACE_MS } from "./protocol.ts";
import { PLAYER_COLOURS } from "./colours.ts";

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
  it("first joiner is host; while the host is away the next player acts as host; a lobby seat left empty is freed", () => {
    const g = twoPlayerGame();
    expect(g.view("tokA", T0).you.isHost).toBe(true);
    expect(g.view("tokB", T0).you.isHost).toBe(false);
    g.disconnect("tokA", T0);
    expect(g.view("tokB", T0).you.isHost).toBe(true);
    expect(g.playerTokens).toEqual(["tokA", "tokB"]);
    expect(g.nextWakeAt()).toBe(T0 + SEAT_GRACE_MS);
    expect(g.tick(T0 + SEAT_GRACE_MS - 1)).toBe(false);
    expect(g.tick(T0 + SEAT_GRACE_MS)).toBe(true);
    expect(g.playerTokens).toEqual(["tokB"]);
    expect(g.nextWakeAt()).toBeNull();
  });

  it("a refresh in the lobby keeps the seat, colour and host role", () => {
    const g = twoPlayerGame();
    const before = g.view("tokA", T0).players.find((p) => p.name === "Alice")!;
    g.disconnect("tokA", T0);
    g.join("tokA", "Alice", T0 + 2_000);
    const after = g.view("tokA", T0 + 2_000).players.find((p) => p.name === "Alice")!;
    expect(after).toMatchObject({ id: before.id, colour: before.colour, connected: true, isHost: true });
    expect(g.view("tokB", T0 + 2_000).you.isHost).toBe(false);
    // Back in time, so nothing is left to free.
    expect(g.nextWakeAt()).toBeNull();
    expect(g.tick(T0 + SEAT_GRACE_MS)).toBe(false);
    expect(g.playerTokens).toContain("tokA");
  });

  it("leaving frees the seat at once and passes the host role to the longest-standing online player", () => {
    const g = twoPlayerGame();
    g.join("tokC", "Cara", T0 + 2);
    g.join("tokD", "Dev", T0 + 3);
    g.disconnect("tokB", T0 + 4); // Bob is away, so he is passed over
    const before = g.view("tokA", T0 + 4);
    const predicted = nextHostAfter(before.players, before.you.id);
    expect(predicted?.name).toBe("Cara");
    expect(g.leave("tokA")).toEqual({ ok: true, changed: true });
    expect(g.playerTokens).toEqual(["tokB", "tokC", "tokD"]);
    expect(g.view("tokC", T0 + 5).you.isHost).toBe(true);
    // Nothing waits on a grace period for Alice.
    expect(g.nextWakeAt()).toBe(T0 + 4 + SEAT_GRACE_MS);
    expect(g.leave("tokA")).toEqual({ ok: false, error: "unknown player" });
  });

  it("the last player leaving empties the game; nobody leaves mid-game", () => {
    const g = twoPlayerGame();
    expect(nextHostAfter(g.view("tokB", T0).players, "p1")?.name).toBe("Bob");
    g.leave("tokB");
    expect(nextHostAfter(g.view("tokA", T0).players, "p1")).toBeUndefined();
    g.leave("tokA");
    expect(g.playerCount).toBe(0);

    const h = twoPlayerGame();
    h.start("tokA", T0);
    expect(h.leave("tokB")).toEqual({ ok: false, error: "you can only leave from the lobby" });
  });

  it("the host can hand the role to another connected player, for good", () => {
    const g = twoPlayerGame();
    g.join("tokC", "Cara", T0);
    const id = (name: string) => g.view("tokA", T0).players.find((p) => p.name === name)!.id;
    expect(g.makeHost("tokB", id("Cara"))).toEqual({ ok: false, error: "only the host can hand over" });
    expect(g.makeHost("tokA", id("Alice"))).toEqual({ ok: false, error: "you are already the host" });
    expect(g.makeHost("tokA", "p99")).toEqual({ ok: false, error: "unknown player" });
    g.disconnect("tokC", T0);
    expect(g.makeHost("tokA", id("Cara"))).toEqual({ ok: false, error: "that player is offline" });
    expect(g.makeHost("tokA", id("Bob"))).toEqual({ ok: true, changed: true });
    expect(g.view("tokB", T0).you.isHost).toBe(true);
    expect(g.view("tokA", T0).you.isHost).toBe(false);
    // Alice leaving and coming back does not bring the role with her.
    g.disconnect("tokA", T0 + 1);
    g.join("tokA", "Alice", T0 + 2);
    expect(g.view("tokA", T0 + 2).you.isHost).toBe(false);
  });

  it("an acting host can hand over too, and the absent host does not get it back", () => {
    const g = twoPlayerGame();
    g.join("tokC", "Cara", T0 + 2);
    g.start("tokA", T0);
    g.disconnect("tokA", T0 + 1);
    const cara = g.view("tokB", T0 + 1).players.find((p) => p.name === "Cara")!;
    expect(g.makeHost("tokB", cara.id).ok).toBe(true);
    g.join("tokA", "Alice", T0 + 5);
    expect(g.view("tokC", T0 + 5).you.isHost).toBe(true);
    expect(g.view("tokA", T0 + 5).you.isHost).toBe(false);
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
  it("scores at the deadline, exact hit beats blank, blank scores as a pass", () => {
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
    expect(second!.score).toBe(PASS_SCORE.score);
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

  it("unlocking after Done lets the guess change, only while the round runs", () => {
    const g = twoPlayerGame(1);
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.unlock("tokA")).toEqual({ ok: true, changed: false }); // not locked: nothing to undo
    g.setPaint("tokA", paintAt(q, 0, 0));
    g.lock("tokA", T0);
    expect(g.unlock("tokA")).toEqual({ ok: true, changed: true });
    expect(g.view("tokA", T0).you.locked).toBe(false);
    // The new guess replaces the old one and is what gets scored.
    g.setPaint("tokA", paintAt(q, q.answer.lat, q.answer.lon));
    g.lock("tokA", T0 + 1);
    g.setPaint("tokB", paintAt(q, 0, 0));
    g.lock("tokB", T0 + 2); // everyone done: the round ends
    expect(g.phase).toBe("reveal");
    const mine = g.view("tokA", T0 + 2).reveal!.results.find((r) => r.playerId === "p1")!;
    expect(mine.score).toBeGreaterThan(900);
    expect(g.unlock("tokA")).toEqual({ ok: false, error: "not guessing" });
  });

  it("locking with nothing painted is a pass: the pass score, no paint, and the round can end early", () => {
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
    expect(mine.score).toBe(250);
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

describe("player cap", () => {
  function fullGame(): Game {
    const g = twoPlayerGame(2);
    for (let i = 3; i <= MAX_PLAYERS; i++) expect(g.join(`tok${i}`, `P${i}`, T0).ok).toBe(true);
    return g;
  }

  it("has a colour for every player it allows", () => {
    expect(PLAYER_COLOURS.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
  });

  it("seats a newcomer to a full game as a spectator, and turns people away once the spectators are full too", () => {
    const g = fullGame();
    expect(g.view("tokA", T0).players).toHaveLength(MAX_PLAYERS);
    for (let i = 1; i <= MAX_SPECTATORS; i++) expect(g.join(`tokW${i}`, `W${i}`, T0).ok).toBe(true);
    const w1 = g.view("tokW1", T0);
    expect(w1.you.watching).toBe(true);
    expect(w1.players.find((p) => p.name === "W1")).toMatchObject({ watching: true, colour: -1, rank: 0 });
    expect(g.join("tokLate", "Late", T0)).toEqual({ ok: false, error: "game is full" });
  });

  it("still lets a player who dropped out back in", () => {
    const g = fullGame();
    g.disconnect("tokB", T0);
    expect(g.join("tokB", "Bob", T0).ok).toBe(true);
  });

  it("frees the seat and the colour when the host removes someone", () => {
    const g = fullGame();
    const bob = g.view("tokA", T0).players.find((p) => p.name === "Bob")!;
    g.kick("tokA", bob.id, T0);
    expect(g.join("tokNew", "Nine", T0).ok).toBe(true);
    const nine = g.view("tokA", T0).players.find((p) => p.name === "Nine")!;
    expect(nine.colour).toBe(bob.colour);
    const colours = g.view("tokA", T0).players.map((p) => p.colour);
    expect(new Set(colours).size).toBe(MAX_PLAYERS);
  });
});

describe("spectators", () => {
  const T1 = T0 + 60_000;
  function withSpectator(): Game {
    const g = twoPlayerGame(2);
    expect(g.join("tokS", "Sam", T0 + 2, true).ok).toBe(true);
    return g;
  }
  const sam = (g: Game) => g.view("tokA", T0).players.find((p) => p.name === "Sam")!;

  it("joins to watch when asked, with no colour, listed after the players", () => {
    const g = withSpectator();
    const v = g.view("tokS", T0);
    expect(v.you.watching).toBe(true);
    expect(v.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Sam"]);
    expect(sam(g)).toMatchObject({ watching: true, colour: -1 });
  });

  it("does not paint, finish, get scored or hold up either waiting phase", () => {
    const g = withSpectator();
    g.start("tokA", T0);
    const q = currentQuestion(g, "tokA", T0);
    expect(g.setPaint("tokS", paintAt(q, 0, 0))).toEqual({ ok: false, error: "you are watching" });
    expect(g.lock("tokS", T0)).toEqual({ ok: false, error: "you are watching" });
    // The two players finishing ends the round; Sam is not waited on.
    g.lock("tokA", T0 + 1);
    g.lock("tokB", T0 + 2);
    expect(g.phase).toBe("reveal");
    const reveal = g.view("tokS", T0 + 2).reveal!;
    expect(reveal.results.map((r) => r.playerId).sort()).toEqual(["p1", "p2"]);
    expect(g.ready("tokS", T0 + 3)).toEqual({ ok: false, error: "you are watching" });
    g.ready("tokA", T0 + 3);
    g.ready("tokB", T0 + 4);
    expect(g.phase).toBe("guessing");
    g.tick(T1 + 10_000);
    g.next("tokA", T1 + 10_000);
    expect(
      g
        .view("tokS", T1 + 10_000)
        .results!.map((r) => r.playerId)
        .sort(),
    ).toEqual(["p1", "p2"]);
  });

  it("switches role in the lobby only, taking or giving up a colour", () => {
    const g = withSpectator();
    expect(g.setRole("tokS", false)).toEqual({ ok: true, changed: true });
    expect(sam(g)).toMatchObject({ watching: false, colour: 2 });
    expect(g.setRole("tokB", true)).toEqual({ ok: true, changed: true });
    expect(g.view("tokB", T0).players.find((p) => p.name === "Bob")).toMatchObject({ watching: true, colour: -1 });
    expect(g.setRole("tokB", true)).toEqual({ ok: true, changed: false });
    g.start("tokA", T0);
    expect(g.setRole("tokA", true)).toEqual({ ok: false, error: "you can only switch to watching in the lobby" });
  });

  it("a spectator can take a free seat mid-round, sitting that round out and playing from the next", () => {
    const g = withSpectator();
    g.start("tokA", T0);
    expect(g.setRole("tokS", false)).toEqual({ ok: true, changed: true });
    const v = g.view("tokS", T0 + 1);
    expect(v.you).toMatchObject({ watching: false, spectating: true });
    expect(sam(g).colour).toBeGreaterThanOrEqual(0);
    expect(g.lock("tokS", T0 + 1)).toEqual({ ok: false, error: "spectating this round" });
    // Alice and Bob finishing still ends the round without Sam.
    g.lock("tokA", T0 + 2);
    g.lock("tokB", T0 + 3);
    expect(g.phase).toBe("reveal");
    // Sam is a player now, so the reveal waits for his Ready too.
    g.ready("tokA", T0 + 4);
    g.ready("tokB", T0 + 5);
    expect(g.phase).toBe("reveal");
    g.ready("tokS", T0 + 6);
    expect(g.phase).toBe("guessing");
    expect(g.view("tokS", T0 + 6).you.spectating).toBe(false);
    g.tick(T0 + 6 + 60_000);
    g.next("tokA", T0 + 6 + 60_000);
    const standing = g.view("tokS", T0 + 6 + 60_000).results!.find((r) => r.playerId === sam(g).id)!;
    expect(standing.rounds).toEqual([null, 250]);
  });

  it("taking a seat at the reveal means playing from the next round", () => {
    const g = withSpectator();
    g.start("tokA", T0);
    g.tick(T0 + 60_000);
    expect(g.phase).toBe("reveal");
    g.setRole("tokS", false);
    g.ready("tokA", T0 + 60_001);
    g.ready("tokB", T0 + 60_002);
    g.ready("tokS", T0 + 60_003);
    expect(g.view("tokS", T0 + 60_003).you.spectating).toBe(false);
  });

  it("nobody switches on the final results", () => {
    const g = withSpectator();
    g.start("tokA", T0);
    g.end("tokA");
    expect(g.setRole("tokS", false)).toEqual({ ok: false, error: "game has finished" });
  });

  it("cannot take a seat when all the player seats are taken", () => {
    const g = twoPlayerGame(2);
    for (let i = 3; i <= MAX_PLAYERS; i++) g.join(`tok${i}`, `P${i}`, T0);
    g.join("tokS", "Sam", T0, true);
    expect(g.setRole("tokS", false)).toEqual({ ok: false, error: "game is full" });
    expect(g.join("tokW", "Wes", T0, true).ok).toBe(true);
  });

  it("a host can watch and still run the game, but a game needs a player to start", () => {
    const g = twoPlayerGame(1);
    g.setRole("tokA", true);
    expect(g.view("tokA", T0).you.isHost).toBe(true);
    expect(g.start("tokA", T0).ok).toBe(true);
    const h = new Game("WXYZ", pool, {}, 1);
    h.join("tokH", "Hana", T0, true);
    expect(h.start("tokH", T0)).toEqual({ ok: false, error: "no players" });
  });

  it("a spectator reclaims their seat as a spectator after a refresh", () => {
    const g = withSpectator();
    g.disconnect("tokS", T0 + 5);
    g.join("tokS", "Sam", T0 + 6);
    expect(g.view("tokS", T0 + 6).you.watching).toBe(true);
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

  it("in the lobby a host gone longer than the grace period hands over for good", () => {
    const g = twoPlayerGame(2);
    g.disconnect("tokA", T0 + 1);
    g.tick(T0 + 1 + SEAT_GRACE_MS);
    g.join("tokA", "Alice", T0 + 1 + SEAT_GRACE_MS + 5);
    expect(g.view("tokA", T0 + SEAT_GRACE_MS + 6).you.isHost).toBe(false);
    expect(g.view("tokB", T0 + SEAT_GRACE_MS + 6).you.isHost).toBe(true);
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

  it("the question mix reaches the picker", () => {
    const photo: Question = {
      ...petra,
      id: "petra-photo",
      kind: "photo",
      prompt: "Where is this?",
      image: "Petra.jpg",
    };
    const g = new Game("ABCD", [...pool, photo], { rounds: 1 }, 42);
    g.join("tokA", "Alice", T0);
    expect(g.configure("tokA", { photoShare: 1 })).toEqual({ ok: true, changed: true });
    expect(g.configure("tokA", { photoShare: 1 })).toEqual({ ok: true, changed: false });
    expect(g.view("tokA", T0).config.photoShare).toBe(1);
    g.start("tokA", T0);
    // One round, all photos: it must be the one photo question in the pool.
    expect(g.view("tokA", T0).round!.question.image).toBe("Petra.jpg");
  });

  it("starts on minimal map detail and lets the host change it in the lobby", () => {
    const g = twoPlayerGame(1);
    expect(g.view("tokB", T0).config.mapDetail).toBe("minimal");
    expect(g.configure("tokB", { mapDetail: "water" }).ok).toBe(false);
    expect(g.configure("tokA", { mapDetail: "physical" })).toEqual({ ok: true, changed: true });
    expect(g.configure("tokA", { mapDetail: "physical" })).toEqual({ ok: true, changed: false });
    expect(g.view("tokB", T0).config.mapDetail).toBe("physical");
    g.start("tokA", T0);
    expect(g.configure("tokA", { mapDetail: "political" }).ok).toBe(false);
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
