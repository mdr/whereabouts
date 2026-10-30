/**
 * End-to-end over a real WebSocket: boots the Fastify + Rivalis app on a
 * random port and drives it with the same browser client the real UI uses.
 * Node 22 provides global WebSocket, TextEncoder and URL; the client reads
 * them from `window`, so the test aliases window to globalThis.
 */
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { WSClient as WSClientType } from "@rivalis/browser"
import {
  PAINT_CELL_BUDGET,
  PROTOCOL_VERSION,
  PaintLayer,
  ROUND_GRACE_MS,
  SEAT_GRACE_MS,
  compactRecord,
  decodePaint,
  encodePaint,
  GameViewSchema,
  encodeTicket,
  flagFrom,
  gridDisk,
  h3Res,
  latLngToCell,
  playerToken,
  questionId,
  regionCells,
  regionFrom,
  playerName,
  roomCode,
  resolutionForTolerance,
  revealFrom,
  viewFrom,
  type FlagData,
  type GameView,
  type PaintSubmission,
  type PlayerName,
  type PlayerToken,
  type Question,
  type RegionData,
  type RevealMessage,
  type RoomCode,
  type RoundReveal,
  type StateMessage
} from "@whereabouts/shared"
import regionsJson from "@whereabouts/shared/regions.json" with { type: "json" }
import flagsJson from "@whereabouts/shared/flags.json" with { type: "json" }
import { createApp, type App } from "./app.ts"
import { configureGameRooms, realClock, type Clock } from "./rooms.ts"

// Static imports hoist above this line, so the client is loaded dynamically.
;(globalThis as unknown as { window: unknown }).window = globalThis
const { WSClient } = await import("@rivalis/browser")

const questions: Question[] = [
  {
    id: questionId("petra"),
    kind: "text",
    prompt: "Where is Petra?",
    answer: { lat: 30.3285, lon: 35.4444 },
    toleranceKm: 200,
    label: "Petra",
    region: "world"
  },
  {
    id: questionId("paris"),
    kind: "text",
    prompt: "Where is Paris?",
    answer: { lat: 48.8566, lon: 2.3522 },
    toleranceKm: 100,
    label: "Paris",
    region: "world"
  }
]

/** Real timers, but time can be jumped forward so deadlines fire immediately. */
class FakeClock implements Clock {
  offset = 0
  private pending = new Map<number, { at: number; fn: () => void }>()
  private seq = 0
  now() {
    return Date.now() + this.offset
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq
    this.pending.set(id, { at: this.now() + ms, fn })
    return id
  }
  clearTimeout(handle: unknown) {
    this.pending.delete(handle as number)
  }
  /** Jump forward and fire everything now due, in order. */
  advance(ms: number) {
    this.offset += ms
    const due = [...this.pending.entries()].filter(([, t]) => t.at <= this.now()).sort((a, b) => a[1].at - b[1].at)
    for (const [id, t] of due) {
      this.pending.delete(id)
      t.fn()
    }
  }
}

type Topics = "state" | "reveal" | "paint" | "error"

class TestPlayer {
  readonly client: WSClientType<Topics>
  /** Views as the client puts them together from state, reveal and paint messages. */
  readonly states: GameView[] = []
  readonly rawStates: string[] = []
  readonly reveals: RoundReveal[] = []
  readonly errors: string[] = []
  /** Why each state message that did not match GameViewSchema failed: checked after every test. */
  readonly invalidStates: string[] = []
  readonly token: PlayerToken
  readonly name: PlayerName
  constructor(url: string, name: string) {
    this.name = playerName(name)
    this.token = playerToken(`${name}-token-0123456789abcdef`)
    this.client = new WSClient<Topics>(url, { ticketSource: "protocol", reconnect: false })
    const dec = new TextDecoder()
    let reveal: RoundReveal | undefined = undefined
    let paint: PaintSubmission | undefined = undefined
    this.client.on("reveal", (p) => {
      reveal = revealFrom(JSON.parse(dec.decode(p)) as RevealMessage)
      this.reveals.push(reveal)
    })
    this.client.on("paint", (p) => {
      paint = decodePaint(p)
    })
    this.client.on("state", (p) => {
      const raw = dec.decode(p)
      const state = JSON.parse(raw) as StateMessage
      if (!state.reveal) reveal = undefined
      if (state.phase !== "guessing") paint = undefined
      const view = viewFrom(state, reveal, paint)
      if (state.reveal && !view.reveal) this.invalidStates.push(`reveal ${state.reveal.index} came after its state`)
      this.rawStates.push(raw)
      const checked = GameViewSchema.safeParse(view)
      if (!checked.success) this.invalidStates.push(checked.error.message)
      this.states.push(view)
    })
    this.client.on("error", (p) => this.errors.push((JSON.parse(dec.decode(p)) as { message: string }).message))
  }
  connect(ticket: { create?: boolean; code?: RoomCode; watch?: boolean }) {
    this.client.connect(encodeTicket({ v: PROTOCOL_VERSION, token: this.token, name: this.name, ...ticket }))
  }
  send(topic: string, body: unknown = {}) {
    this.client.send(topic, JSON.stringify(body))
  }
  sendPaint(paint: PaintSubmission) {
    this.client.send("paint", encodePaint(paint))
  }
  get latest(): GameView {
    return this.states[this.states.length - 1]!
  }
  /** Wait until a state arrives that satisfies the predicate. */
  async until(pred: (v: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const hit = this.states.find(pred)
      if (hit) return hit
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(
      `${this.name}: no state matched within ${ms}ms; last=${JSON.stringify(this.states.at(-1)).slice(0, 300)}`
    )
  }
  async untilLatest(pred: (v: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (this.states.length && pred(this.latest)) return this.latest
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`${this.name}: latest never matched; last=${JSON.stringify(this.states.at(-1)).slice(0, 300)}`)
  }
  async waitClosed(ms = 3000): Promise<void> {
    const start = Date.now()
    while (this.client.connected && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 10))
  }
}

function paintAt(q: Question, lat: number, lon: number) {
  const layer = new PaintLayer(resolutionForTolerance(q.toleranceKm))
  layer.stamp({ lat, lon }, q.toleranceKm / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

describe("game server", () => {
  let app: App
  let url: string
  let clock: FakeClock
  const players: TestPlayer[] = []

  beforeEach(async () => {
    clock = new FakeClock()
    configureGameRooms({ clock, pool: questions, config: { rounds: 2, roundMs: 60_000 } })
    app = createApp({ staticDir: undefined, logLevel: "warning" })
    const address = await app.listen(0)
    url = address.replace(/^http/, "ws") + "/ws"
  })

  afterEach(async () => {
    // Every state the server sent matched the schema the client's cast trusts.
    const invalid = players.flatMap((p) => p.invalidStates.map((why) => `${p.name}: ${why}`))
    if (invalid.length > 0) throw new Error(`state did not match GameViewSchema:\n${invalid.join("\n")}`)
    for (const p of players) p.client.disconnect()
    players.length = 0
    await app.close()
    configureGameRooms({ clock: realClock })
  })

  function player(name: string) {
    const p = new TestPlayer(url, name)
    players.push(p)
    return p
  }

  it("host creates a game, a friend joins by code, both see the lobby", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    expect(lobby.code).toMatch(/^[A-Z0-9]{4}$/)
    expect(lobby.you.isHost).toBe(true)

    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    const seen = await alice.until((v) => v.players.length === 2)
    expect(seen.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"])
    const bobView = await bob.until((v) => v.players.length === 2)
    expect(bobView.you.isHost).toBe(false)
  })

  it("rejects bad codes and malformed tickets", async () => {
    const nobody = player("Nobody")
    nobody.connect({ code: roomCode("ZZZZ") })
    await nobody.waitClosed()
    expect(nobody.client.connected).toBe(false)
    expect(nobody.states).toHaveLength(0)

    const garbage = player("Garbage")
    garbage.client.connect("not-a-ticket")
    await garbage.waitClosed()
    expect(garbage.client.connected).toBe(false)
  })

  it("hosts a game under a code no game has, and joins it if someone just did", async () => {
    const alice = player("Alice")
    alice.connect({ create: true, code: roomCode("VWZR") })
    const lobby = await alice.until((v) => v.phase === "lobby")
    expect(lobby.code).toBe("VWZR")
    expect(lobby.you.isHost).toBe(true)

    const bob = player("Bob")
    bob.connect({ create: true, code: roomCode("VWZR") })
    const bobView = await bob.until((v) => v.players.length === 2)
    expect(bobView.you.isHost).toBe(false)
  })

  it("plays a full two-round game with a deadline, reveal, and results", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)

    bob.send("start")
    expect(await pollErrors(bob)).toContain("only the host can start")

    alice.send("start")
    const round = await bob.until((v) => v.phase === "guessing")
    expect(round.round!.total).toBe(2)
    const q = questions.find((x) => x.prompt === round.round!.question.prompt)!

    alice.sendPaint(paintAt(q, q.answer.lat, q.answer.lon))
    const bobPaint = paintAt(q, -30, -60)
    bob.sendPaint(bobPaint)
    bob.send("lock")
    await bob.untilLatest((v) => v.you.locked)
    // Nobody else learns about Bob's paint before the reveal.
    const aBobCell = Object.keys(bobPaint.cells)[0]!
    expect(JSON.stringify(alice.latest)).not.toContain(aBobCell)

    clock.advance(60_000 + ROUND_GRACE_MS)
    const reveal = await alice.until((v) => v.phase === "reveal")
    expect(reveal.reveal!.label).toBe(q.label)
    const byName = Object.fromEntries(reveal.players.map((p) => [p.name, p.id]))
    const scores = Object.fromEntries(reveal.reveal!.results.map((r) => [r.playerId, r.score]))
    expect(scores[byName.Alice!]).toBeGreaterThan(scores[byName.Bob!]!)
    expect(reveal.reveal!.results.every((r) => r.paint !== undefined)).toBe(true)

    alice.send("next")
    await bob.until((v) => v.phase === "guessing" && v.round!.index === 1)
    clock.advance(60_000 + ROUND_GRACE_MS)
    await bob.until((v) => v.phase === "reveal" && v.reveal!.index === 1)
    // No timer on the reveal: it advances when everyone is ready.
    bob.send("ready")
    await alice.until((v) => v.phase === "reveal" && v.reveal!.ready.length === 1)
    alice.send("ready")
    const results = await bob.until((v) => v.phase === "results")
    expect(results.results).toHaveLength(2)
    expect(results.results![0]!.playerId).toBe(byName.Alice)
  })

  it("plays a country round: scored against the outline, with coverage and precision", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("configure", { mix: { landmarks: 0, places: 0, countries: 1, flags: 0 } })
    await bob.until((v) => v.config.mix.countries === 1 && v.config.rounds === 1)

    alice.send("start")
    const round = await bob.until((v) => v.phase === "guessing")
    const id = round.round!.question.regionId!
    expect(round.round!.question.prompt).toMatch(/^Paint the whole of /)
    const country = (regionsJson as RegionData[]).map(regionFrom).find((q) => q.id === id)!
    // Paint it exactly, compacted the way the client sends paint.
    const res = resolutionForTolerance(round.round!.question.toleranceKm)
    const cells = compactRecord(Object.fromEntries(regionCells(country, res).map((h) => [h, 1])))
    alice.sendPaint({ cells, floor: 0.05 })
    alice.send("lock")
    await alice.untilLatest((v) => v.you.locked)

    clock.advance(60_000 + ROUND_GRACE_MS)
    const reveal = await bob.until((v) => v.phase === "reveal")
    expect(reveal.reveal!.question.regionId).toBe(id)
    expect(reveal.reveal!.label).toBe(country.label)
    const byName = Object.fromEntries(reveal.players.map((p) => [p.name, p.id]))
    const aliceResult = reveal.reveal!.results.find((r) => r.playerId === byName.Alice)!
    expect(aliceResult.score).toBeGreaterThan(980)
    expect(aliceResult.region!.coverage).toBeGreaterThan(0.95)
    const bobResult = reveal.reveal!.results.find((r) => r.playerId === byName.Bob)!
    expect(bobResult.score).toBe(250)
  })

  it("plays a flag round: the flag is shown, the name only at the reveal", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    await alice.until((v) => v.phase === "lobby")
    alice.send("configure", { mix: { landmarks: 0, places: 0, countries: 0, flags: 1 } })
    await alice.until((v) => v.config.mix.flags === 1 && v.config.rounds === 1)

    alice.send("start")
    const round = await alice.until((v) => v.phase === "guessing")
    const q = round.round!.question
    expect(q.flag).toMatch(/^[a-z]{2}$/)
    const f = (flagsJson as FlagData[]).map(flagFrom).find((x) => x.flag === q.flag)!
    expect(JSON.stringify(round)).not.toContain(f.label)

    clock.advance(60_000 + ROUND_GRACE_MS)
    const reveal = await alice.until((v) => v.phase === "reveal")
    expect(reveal.reveal!.label).toBe(f.label)
    expect(reveal.reveal!.question.flag).toBe(q.flag)
  })

  it("answers bad messages with errors instead of dropping the player", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    await alice.until((v) => v.phase === "lobby")
    alice.send("start")
    await alice.until((v) => v.phase === "guessing")

    alice.client.send("rename", "this is not json")
    expect(await pollErrors(alice)).toContain("malformed message")
    alice.errors.length = 0

    alice.client.send("paint", "this is not paint")
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    const tooMany = gridDisk(latLngToCell(0, 0, h3Res(7)), 45).slice(0, PAINT_CELL_BUDGET + 1)
    alice.sendPaint({ cells: Object.fromEntries(tooMany.map((h) => [h, 1])), floor: 0 })
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    // Not a cell: scoring it would throw.
    const notACell = encodePaint({ cells: { [latLngToCell(0, 0, h3Res(5))]: 1 }, floor: 0 })
    notACell.fill(0xff, 8, 16)
    alice.client.send("paint", notACell)
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    // A game-level rejection (as opposed to a schema one) also comes back as an error.
    alice.send("ready")
    expect(await pollErrors(alice)).toContain("nothing to be ready for")
    alice.errors.length = 0

    // Unknown topics are dropped silently rather than kicking (version skew tolerance).
    alice.client.send("no-such-topic", "{}")
    await new Promise((r) => setTimeout(r, 200))
    expect(alice.client.connected).toBe(true)
    expect(alice.errors).toHaveLength(0)
  })

  it("survives an oversized frame: the sender is dropped, everyone else carries on", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)

    // Well over the 1 MiB transport limit. ws rejects it with close code 1009.
    const huge = "x".repeat(2 * 1024 * 1024)
    bob.client.send("paint", huge)
    await bob.waitClosed()
    expect(bob.client.connected).toBe(false)

    // The process is alive and the room still works. Bob shows offline, and
    // his lobby seat is freed once the grace period passes.
    expect(alice.client.connected).toBe(true)
    await alice.untilLatest((v) => v.players.some((p) => p.name === "Bob" && !p.connected))
    clock.advance(SEAT_GRACE_MS)
    await alice.untilLatest((v) => v.players.length === 1)
    const cara = player("Cara")
    cara.connect({ code: lobby.code })
    await cara.until((v) => v.phase === "lobby")
  })

  it("sends a round's reveal once, and again only to a player who reconnects", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("start")
    const round = await bob.until((v) => v.phase === "guessing")
    const q = questions.find((x) => x.prompt === round.round!.question.prompt)!
    const paint = paintAt(q, q.answer.lat, q.answer.lon)
    alice.sendPaint(paint)
    alice.send("lock")
    bob.send("lock")
    await alice.until((v) => v.phase === "reveal")

    bob.send("rename", { name: "Bobby" })
    const renamed = await alice.untilLatest((v) => v.players.some((p) => p.name === "Bobby"))
    expect(renamed.reveal!.results).toHaveLength(2)
    expect(alice.reveals).toHaveLength(1)
    const aCell = Object.keys(paint.cells)[0]!
    expect(alice.rawStates.at(-1)).not.toContain(aCell)

    bob.client.disconnect()
    await alice.until((v) => v.players.some((p) => p.name === "Bobby" && !p.connected))
    const bobAgain = player("Bob")
    bobAgain.connect({ code: lobby.code })
    const back = await bobAgain.until((v) => v.phase === "reveal")
    expect(back.reveal!.results).toHaveLength(2)
    expect(bobAgain.reveals).toHaveLength(1)
    await alice.untilLatest((v) => v.players.every((p) => p.connected))
    expect(alice.reveals).toHaveLength(1)
  })

  it("closes a connection that floods messages, and only that one", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)

    for (let i = 0; i < 40; i++) bob.send("rename", { name: i % 2 ? "Bob" : "Bobby" })
    await bob.waitClosed()
    expect(bob.client.connected).toBe(false)
    expect(alice.client.connected).toBe(true)
  })

  it("a reconnecting player keeps their seat, and gets their paint back", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("start")
    const round = await bob.until((v) => v.phase === "guessing")
    const q = questions.find((x) => x.prompt === round.round!.question.prompt)!
    const bobPaint = paintAt(q, q.answer.lat, q.answer.lon)
    bob.sendPaint(bobPaint)
    bob.send("lock")
    await bob.untilLatest((v) => v.you.locked)
    // Paint goes back only to a player who rejoins, not with every state.
    expect(bob.latest.you.paint).toBeUndefined()

    bob.client.disconnect()
    await alice.until((v) => v.players.some((p) => p.name === "Bob" && !p.connected))

    const bobAgain = player("Bob") // same name => same deterministic token
    bobAgain.connect({ code: lobby.code })
    const back = await alice.untilLatest((v) => v.players.length === 2 && v.players.every((p) => p.connected))
    expect(back.players.filter((p) => p.name === "Bob")).toHaveLength(1)
    const own = await bobAgain.until((v) => v.phase === "guessing")
    expect(own.you.spectating).toBe(false)
    expect(own.you.paint).toEqual(decodePaint(encodePaint(bobPaint)))
  })

  it("frees the room once it has been empty for the grace period", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
    alice.client.disconnect()
    await new Promise((r) => setTimeout(r, 100))
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
    clock.advance(SEAT_GRACE_MS)
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).toBeUndefined()
  })

  it("a lone host who refreshes in the lobby gets the game, and the host role, back", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    alice.client.disconnect()
    await alice.waitClosed()
    clock.advance(SEAT_GRACE_MS - 1_000)
    const again = player("Alice") // same name => same token, like a refreshed tab
    again.connect({ code: lobby.code })
    const back = await again.until((v) => v.phase === "lobby")
    expect(back.you.isHost).toBe(true)
    expect(back.players).toHaveLength(1)
    // The empty-room timer was cancelled on the way back in.
    clock.advance(SEAT_GRACE_MS)
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
  })

  it("a host who leaves the lobby frees their seat at once and hands over", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("leave")
    await alice.waitClosed()
    expect(alice.client.connected).toBe(false)
    const after = await bob.untilLatest((v) => v.players.length === 1)
    expect(after.you.isHost).toBe(true)
  })

  it("the last player leaving closes the game without waiting", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    alice.send("leave")
    await alice.waitClosed()
    const start = Date.now()
    while (app.rivalis.rooms.get(lobby.code) && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10))
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).toBeUndefined()
  })

  it("a spectator joins to watch, and can take a seat in the lobby", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const sam = player("Sam")
    sam.connect({ code: lobby.code, watch: true })
    const watching = await sam.until((v) => v.players.length === 2)
    expect(watching.you.watching).toBe(true)
    const samSeen = watching.players.find((p) => p.name === "Sam")
    expect(samSeen).toMatchObject({ watching: true })
    expect(samSeen).not.toHaveProperty("colour")
    sam.send("setRole", { watch: false })
    const seated = await alice.untilLatest((v) => v.players.some((p) => p.name === "Sam" && !p.watching))
    expect(seated.players.find((p) => p.name === "Sam")!.colour).toBeGreaterThanOrEqual(0)
  })

  it("the host hands over to another player", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === "lobby")
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    const two = await alice.until((v) => v.players.length === 2)
    alice.send("makeHost", { playerId: two.players.find((p) => p.name === "Bob")!.id })
    await bob.until((v) => v.you.isHost)
    await alice.untilLatest((v) => !v.you.isHost)
  })
})

async function pollErrors(p: TestPlayer, ms = 2000): Promise<string[]> {
  const start = Date.now()
  while (p.errors.length === 0 && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 10))
  return p.errors
}

describe("static serving", () => {
  let app: App
  let base: string
  let dir: string

  beforeEach(async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const path = await import("node:path")
    dir = mkdtempSync(path.join(tmpdir(), "wa-static-"))
    mkdirSync(path.join(dir, "assets"))
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>")
    writeFileSync(path.join(dir, "assets", "index-abc123.js"), "export {};")
    app = createApp({ staticDir: dir, logLevel: "warning" })
    base = await app.listen(0)
  })
  afterEach(async () => {
    await app.close()
  })

  it("serves the bundle immutable and index.html with revalidation, and falls back for app routes", async () => {
    const asset = await fetch(`${base}/assets/index-abc123.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toContain("javascript")
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")

    const index = await fetch(`${base}/`)
    expect(index.headers.get("cache-control")).toBe("no-cache")
    expect(index.headers.has("etag")).toBe(false)
    expect(index.headers.has("last-modified")).toBe(false)

    const fallback = await fetch(`${base}/some/app/route`)
    expect(fallback.status).toBe(200)
    expect(fallback.headers.get("content-type")).toContain("text/html")
    expect(fallback.headers.get("cache-control")).toBe("no-cache")
  })
})
