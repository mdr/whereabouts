/**
 * End-to-end over a real WebSocket: boots the Fastify + Rivalis app on a
 * random port and drives it with the same browser client the real UI uses.
 * Node 22 provides global WebSocket, TextEncoder and URL; the client reads
 * them from `window`, so the test aliases window to globalThis.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WSClient as WSClientType } from "@rivalis/browser";
import { PaintLayer, resolutionForTolerance, type GameView, type Question } from "@whereabouts/shared";
import { createApp, type App } from "./app.ts";
import { configureGameRooms, encodeTicket, realClock, type Clock } from "./rooms.ts";

// Static imports hoist above this line, so the client is loaded dynamically.
(globalThis as unknown as { window: unknown }).window = globalThis;
const { WSClient } = await import("@rivalis/browser");

const questions: Question[] = [
  { id: "petra", kind: "text", prompt: "Where is Petra?", answer: { lat: 30.3285, lon: 35.4444 }, toleranceKm: 200, label: "Petra", region: "world" },
  { id: "paris", kind: "text", prompt: "Where is Paris?", answer: { lat: 48.8566, lon: 2.3522 }, toleranceKm: 100, label: "Paris", region: "world" },
];

/** Real timers, but time can be jumped forward so deadlines fire immediately. */
class FakeClock implements Clock {
  offset = 0;
  private pending = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now() {
    return Date.now() + this.offset;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now() + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.pending.delete(handle as number);
  }
  /** Jump forward and fire everything now due, in order. */
  advance(ms: number) {
    this.offset += ms;
    const due = [...this.pending.entries()].filter(([, t]) => t.at <= this.now()).sort((a, b) => a[1].at - b[1].at);
    for (const [id, t] of due) {
      this.pending.delete(id);
      t.fn();
    }
  }
}

type Topics = "state" | "error";

class TestPlayer {
  readonly client: WSClientType<Topics>;
  readonly states: GameView[] = [];
  readonly errors: string[] = [];
  readonly token: string;
  readonly name: string;
  constructor(url: string, name: string) {
    this.name = name;
    this.token = `${name}-token-0123456789abcdef`;
    this.client = new WSClient<Topics>(url, { ticketSource: "protocol", reconnect: false });
    const dec = new TextDecoder();
    this.client.on("state", (p) => this.states.push(JSON.parse(dec.decode(p)) as GameView));
    this.client.on("error", (p) => this.errors.push((JSON.parse(dec.decode(p)) as { message: string }).message));
  }
  connect(ticket: { create?: boolean; code?: string }) {
    this.client.connect(encodeTicket({ v: 1, token: this.token, name: this.name, ...ticket }));
  }
  send(topic: string, body: unknown = {}) {
    this.client.send(topic, JSON.stringify(body));
  }
  get latest(): GameView {
    return this.states[this.states.length - 1]!;
  }
  /** Wait until a state arrives that satisfies the predicate. */
  async until(pred: (v: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const hit = this.states.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${this.name}: no state matched within ${ms}ms; last=${JSON.stringify(this.latest ?? null).slice(0, 300)}`);
  }
  async untilLatest(pred: (v: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.states.length && pred(this.latest)) return this.latest;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${this.name}: latest never matched; last=${JSON.stringify(this.latest ?? null).slice(0, 300)}`);
  }
  async waitClosed(ms = 3000): Promise<void> {
    const start = Date.now();
    while (this.client.connected && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 10));
  }
}

function paintAt(q: Question, lat: number, lon: number) {
  const layer = new PaintLayer(resolutionForTolerance(q.toleranceKm));
  layer.stamp({ lat, lon }, q.toleranceKm / 2, 1);
  return { cells: layer.toRecord(), floor: 0.05 };
}

describe("game server", () => {
  let app: App;
  let url: string;
  let clock: FakeClock;
  const players: TestPlayer[] = [];

  beforeEach(async () => {
    clock = new FakeClock();
    configureGameRooms({ clock, pool: questions, config: { rounds: 2, roundMs: 60_000, revealMs: 20_000 } });
    app = createApp({ staticDir: null, logLevel: "warn" });
    const address = await app.listen(0);
    url = address.replace(/^http/, "ws") + "/ws";
  });

  afterEach(async () => {
    for (const p of players) p.client.disconnect();
    players.length = 0;
    await app.close();
    configureGameRooms({ clock: realClock });
  });

  function player(name: string) {
    const p = new TestPlayer(url, name);
    players.push(p);
    return p;
  }

  it("host creates a game, a friend joins by code, both see the lobby", async () => {
    const alice = player("Alice");
    alice.connect({ create: true });
    const lobby = await alice.until((v) => v.phase === "lobby");
    expect(lobby.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(lobby.you.isHost).toBe(true);

    const bob = player("Bob");
    bob.connect({ code: lobby.code });
    const seen = await alice.until((v) => v.players.length === 2);
    expect(seen.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
    const bobView = await bob.until((v) => v.players.length === 2);
    expect(bobView.you.isHost).toBe(false);
  });

  it("rejects bad codes and malformed tickets", async () => {
    const nobody = player("Nobody");
    nobody.connect({ code: "ZZZZ" });
    await nobody.waitClosed();
    expect(nobody.client.connected).toBe(false);
    expect(nobody.states).toHaveLength(0);

    const garbage = player("Garbage");
    garbage.client.connect("not-a-ticket");
    await garbage.waitClosed();
    expect(garbage.client.connected).toBe(false);
  });

  it("plays a full two-round game with a deadline, reveal, and results", async () => {
    const alice = player("Alice");
    alice.connect({ create: true });
    const lobby = await alice.until((v) => v.phase === "lobby");
    const bob = player("Bob");
    bob.connect({ code: lobby.code });
    await alice.until((v) => v.players.length === 2);

    bob.send("start");
    expect(await pollErrors(bob)).toContain("only the host can start");

    alice.send("start");
    const round = await bob.until((v) => v.phase === "guessing");
    expect(round.round!.total).toBe(2);
    const q = questions.find((x) => x.prompt === round.round!.question.prompt)!;

    alice.send("paint", paintAt(q, q.answer.lat, q.answer.lon));
    bob.send("paint", paintAt(q, -30, -60));
    bob.send("lock");
    await bob.untilLatest((v) => v.you.locked);
    // Nobody else learns about Bob's paint yet.
    expect(JSON.stringify(alice.latest)).not.toContain("cells");

    clock.advance(60_000);
    const reveal = await alice.until((v) => v.phase === "reveal");
    expect(reveal.reveal!.label).toBe(q.label);
    const byName = Object.fromEntries(reveal.players.map((p) => [p.name, p.id]));
    const scores = Object.fromEntries(reveal.reveal!.results.map((r) => [r.playerId, r.score]));
    expect(scores[byName.Alice!]).toBeGreaterThan(scores[byName.Bob!]!);
    expect(reveal.reveal!.results.every((r) => r.paint !== null)).toBe(true);

    alice.send("next");
    await bob.until((v) => v.phase === "guessing" && v.round!.index === 1);
    clock.advance(60_000);
    await bob.until((v) => v.phase === "reveal" && v.reveal!.index === 1);
    clock.advance(20_000);
    const results = await bob.until((v) => v.phase === "results");
    expect(results.results).toHaveLength(2);
    expect(results.results![0]!.playerId).toBe(byName.Alice);
  });

  it("a reconnecting player keeps their seat", async () => {
    const alice = player("Alice");
    alice.connect({ create: true });
    const lobby = await alice.until((v) => v.phase === "lobby");
    const bob = player("Bob");
    bob.connect({ code: lobby.code });
    await alice.until((v) => v.players.length === 2);
    alice.send("start");
    await bob.until((v) => v.phase === "guessing");

    bob.client.disconnect();
    await alice.until((v) => v.players.some((p) => p.name === "Bob" && !p.connected));

    const bobAgain = player("Bob"); // same name => same deterministic token
    bobAgain.connect({ code: lobby.code });
    const back = await alice.untilLatest((v) => v.players.length === 2 && v.players.every((p) => p.connected));
    expect(back.players.filter((p) => p.name === "Bob")).toHaveLength(1);
    const own = await bobAgain.until((v) => v.phase === "guessing");
    expect(own.you.spectating).toBe(false);
  });

  it("frees the room when everyone leaves", async () => {
    const alice = player("Alice");
    alice.connect({ create: true });
    const lobby = await alice.until((v) => v.phase === "lobby");
    expect(app.rivalis.rooms.get(lobby.code)).not.toBeNull();
    alice.client.disconnect();
    const start = Date.now();
    while (app.rivalis.rooms.get(lobby.code) && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10));
    expect(app.rivalis.rooms.get(lobby.code)).toBeNull();
  });
});

async function pollErrors(p: TestPlayer, ms = 2000): Promise<string[]> {
  const start = Date.now();
  while (p.errors.length === 0 && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 10));
  return p.errors;
}
