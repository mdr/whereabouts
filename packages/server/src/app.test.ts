/**
 * End-to-end over a real WebSocket: boots the Fastify + Rivalis app on a
 * random port and drives it with the same browser client the real UI uses.
 * Node 22 provides global WebSocket, TextEncoder and URL; the client reads
 * them from `window`, so the test aliases window to globalThis.
 */
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { WSClient as WSClientType } from "@rivalis/browser"
import { PAINT_CELL_BUDGET, PaintLayer, compactRecord, resolutionForTolerance } from "@whereabouts/shared/paint"
import {
  PROTOCOL_VERSION,
  type ClientSend,
  type ClientTopic,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  SEAT_GRACE,
  encodeTicket,
  type Ticket,
  revealFrom,
  viewFrom,
  type GameView,
  type PaintSubmission,
  type RevealMessage,
  type RoundReveal,
  type StateMessage,
  mixOf,
  mixTotal,
  Phase
} from "@whereabouts/shared/protocol"
import { ROUND_GRACE } from "@whereabouts/shared/game"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint-wire"
import { GameViewSchema } from "@whereabouts/shared/view-schema"
import { CATALOGUE } from "@whereabouts/shared/catalogue"
import { gridDisk, h3Res, latLngToCell } from "@whereabouts/shared/h3"
import { HintAxis } from "@whereabouts/shared/hints"
import {
  placeId,
  playerToken,
  questionId,
  playerName,
  roomCode,
  wikiTitle,
  type PlayerName,
  type PlayerToken,
  type RoomCode
} from "@whereabouts/shared/ids"
import { regionCells, scoredAnswer } from "@whereabouts/shared/regions"
import {
  AnswerType,
  ClueType,
  QuestionType,
  answerCentre,
  promptOf,
  type PlaceQuestion,
  type Question
} from "@whereabouts/shared/questions"
import { createApp, MAX_PAYLOAD_BYTES, type App } from "./app.ts"
import { BANK, configureGameRooms, realClock, type Clock, type GameRoom } from "./rooms.ts"
import { CloseReason } from "@whereabouts/shared/close-reason"

// Static imports hoist above this line, so the client is loaded dynamically.
;(globalThis as unknown as { window: unknown }).window = globalThis
const { WSClient } = await import("@rivalis/browser")

function place(id: string, label: string, lat: number, lon: number, tolerance: number): PlaceQuestion {
  return {
    type: QuestionType.PLACE,
    id: questionId(id),
    place: placeId(id),
    label,
    wiki: wikiTitle(label),
    clue: { type: ClueType.NAME, prompt: `Where is ${label}?` },
    answer: { type: AnswerType.POINT, at: { lat, lon }, tolerance }
  }
}

const questions = [place("petra", "Petra", 30.3285, 35.4444, 200), place("paris", "Paris", 48.8566, 2.3522, 100)]
/** Two known place names, and the real questions of the other types. */
const bank = {
  ...BANK,
  catalogue: [...questions, ...CATALOGUE.filter((q) => q.type !== QuestionType.PLACE)]
}
const config = { mix: mixOf({ [QuestionType.PLACE]: 2 }), roundLength: 60_000 }

/** The place question a round asked. */
const askedIn = (round: GameView) => questions.find((q) => promptOf(q) === promptOf(round.round!.question))!

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
  /** The reason the server gave for closing the connection, if it did. */
  closedFor: string | undefined = undefined
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
      if (state.phase !== Phase.GUESSING) paint = undefined
      const view = viewFrom(state, reveal, paint)
      if (state.reveal && !view.reveal) this.invalidStates.push(`reveal ${state.reveal.index} came after its state`)
      this.rawStates.push(raw)
      const checked = GameViewSchema.safeParse(view)
      if (!checked.success) this.invalidStates.push(checked.error.message)
      this.states.push(view)
    })
    this.client.on("client:kicked", ({ reason }) => (this.closedFor = reason))
    this.client.on("error", (p) => this.errors.push((JSON.parse(dec.decode(p)) as { message: string }).message))
  }
  connect(ticket: { create?: boolean; code?: RoomCode; watch?: boolean }) {
    this.client.connect(encodeTicket({ v: PROTOCOL_VERSION, token: this.token, name: this.name, ...ticket }))
  }
  send<K extends ClientTopic>(...[topic, body]: ClientSend<K>) {
    this.client.send(topic, JSON.stringify(body ?? {}))
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
    await eventually(() => !this.client.connected, `${this.name}'s connection to close`, ms)
  }
}

/** Wait until `done` holds, failing with what was awaited. */
async function eventually(done: () => boolean, what: string, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!done()) {
    if (Date.now() - start > ms) throw new Error(`gave up waiting ${ms}ms for ${what}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

function paintAt(q: Question, lat: number, lon: number) {
  const { tolerance } = q.answer
  const layer = new PaintLayer(resolutionForTolerance(tolerance))
  layer.stamp({ lat, lon }, tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

describe("game server", () => {
  let app: App
  let url: string
  let clock: FakeClock
  const players: TestPlayer[] = []

  beforeEach(async () => {
    clock = new FakeClock()
    configureGameRooms({ clock, bank, config })
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
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    expect(lobby.code).toMatch(/^[A-Z0-9]{4}$/)
    expect(lobby.you.isHost).toBe(true)

    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    const seen = await alice.until((v) => v.players.length === 2)
    expect(seen.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"])
    const bobView = await bob.until((v) => v.players.length === 2)
    expect(bobView.you.isHost).toBe(false)
  })

  it("rejects bad codes and malformed tickets, and tells an outdated client so", async () => {
    const nobody = player("Nobody")
    nobody.connect({ code: roomCode("ZZZZ") })
    await nobody.waitClosed()
    expect(nobody.client.connected).toBe(false)
    expect(nobody.states).toHaveLength(0)
    expect(nobody.closedFor).toBe(CloseReason.NO_SUCH_GAME)

    const old = player("Old")
    old.client.connect(encodeTicket({ v: PROTOCOL_VERSION - 1, token: old.token, name: old.name } as unknown as Ticket))
    await old.waitClosed()
    expect(old.closedFor).toBe(CloseReason.OUTDATED)

    const garbage = player("Garbage")
    garbage.client.connect("not-a-ticket")
    await garbage.waitClosed()
    expect(garbage.client.connected).toBe(false)
  })

  it("hosts a game under a code no game has, and joins it if someone just did", async () => {
    const alice = player("Alice")
    alice.connect({ create: true, code: roomCode("VWZR") })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
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
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)

    bob.send("start")
    expect(await pollErrors(bob)).toContain("only the host can start")

    alice.send("start")
    const round = await bob.until((v) => v.phase === Phase.GUESSING)
    expect(round.round!.total).toBe(2)
    const q = askedIn(round)
    const at = answerCentre(q.answer)

    alice.sendPaint(paintAt(q, at.lat, at.lon))
    const bobPaint = paintAt(q, -30, -60)
    bob.sendPaint(bobPaint)
    bob.send("lock")
    await bob.untilLatest((v) => v.you.locked)
    // Nobody else learns about Bob's paint before the reveal.
    const aBobCell = Object.keys(bobPaint.cells)[0]!
    expect(JSON.stringify(alice.latest)).not.toContain(aBobCell)

    clock.advance(60_000 + ROUND_GRACE)
    const reveal = await alice.until((v) => v.phase === Phase.REVEAL)
    expect(reveal.reveal!.label).toBe(q.label)
    const byName = Object.fromEntries(reveal.players.map((p) => [p.name, p.id]))
    const scores = Object.fromEntries(reveal.reveal!.results.map((r) => [r.playerId, r.score]))
    expect(scores[byName.Alice!]).toBeGreaterThan(scores[byName.Bob!]!)
    expect(reveal.reveal!.results.every((r) => r.paint !== undefined)).toBe(true)

    alice.send("next")
    await bob.until((v) => v.phase === Phase.GUESSING && v.round!.index === 1)
    clock.advance(60_000 + ROUND_GRACE)
    await bob.until((v) => v.phase === Phase.REVEAL && v.reveal!.index === 1)
    // No timer on the reveal: it advances when everyone is ready.
    bob.send("ready")
    await alice.until((v) => v.phase === Phase.REVEAL && v.reveal!.ready.length === 1)
    alice.send("ready")
    const results = await bob.until((v) => v.phase === Phase.RESULTS)
    expect(results.results).toHaveLength(2)
    expect(results.results![0]!.playerId).toBe(byName.Alice)
  })

  it("plays a country round: scored against the outline, with coverage and precision", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("configure", { mix: mixOf({ [QuestionType.COUNTRY]: 1 }) })
    await bob.until((v) => v.config.mix[QuestionType.COUNTRY] === 1 && mixTotal(v.config.mix) === 1)

    alice.send("start")
    const round = await bob.until((v) => v.phase === Phase.GUESSING)
    const shown = round.round!.question.answer
    expect(shown.type).toBe(AnswerType.AREA)
    expect(promptOf(round.round!.question)).toMatch(/^Paint the whole of /)
    const country = CATALOGUE.find(
      (q) => q.type === QuestionType.COUNTRY && shown.type === AnswerType.AREA && q.answer.outline === shown.outline
    )!
    const area = scoredAnswer(country.answer, BANK.outlines)
    if (area.type !== AnswerType.AREA) throw new Error("a country is an area")
    // Paint it exactly, compacted the way the client sends paint.
    const res = resolutionForTolerance(shown.tolerance)
    const cells = compactRecord(Object.fromEntries(regionCells(area, res).map((h) => [h, 1])))
    alice.sendPaint({ cells, floor: 0.05 })
    alice.send("lock")
    await alice.untilLatest((v) => v.you.locked)

    clock.advance(60_000 + ROUND_GRACE)
    const reveal = await bob.until((v) => v.phase === Phase.REVEAL)
    expect(reveal.reveal!.question.answer).toEqual(shown)
    expect(reveal.reveal!.label).toBe(country.label)
    const byName = Object.fromEntries(reveal.players.map((p) => [p.name, p.id]))
    const aliceResult = reveal.reveal!.results.find((r) => r.playerId === byName.Alice)!
    expect(aliceResult.score).toBeGreaterThan(980)
    expect(aliceResult.parts.type === AnswerType.AREA && aliceResult.parts.coverage).toBeGreaterThan(0.95)
    const bobResult = reveal.reveal!.results.find((r) => r.playerId === byName.Bob)!
    expect(bobResult.score).toBe(250)
  })

  it("plays a flag round: the flag is shown, the name only at the reveal", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    await alice.until((v) => v.phase === Phase.LOBBY)
    alice.send("configure", { mix: mixOf({ [QuestionType.FLAG]: 1 }) })
    await alice.until((v) => v.config.mix[QuestionType.FLAG] === 1 && mixTotal(v.config.mix) === 1)

    alice.send("start")
    const round = await alice.until((v) => v.phase === Phase.GUESSING)
    const { clue } = round.round!.question
    if (clue.type !== ClueType.FLAG) throw new Error("a flag round shows a flag")
    expect(clue.flag).toMatch(/^[a-z]{2}$/)
    const f = CATALOGUE.find((x) => x.clue.type === ClueType.FLAG && x.clue.flag === clue.flag)!
    expect(JSON.stringify(round)).not.toContain(f.label)

    clock.advance(60_000 + ROUND_GRACE)
    const reveal = await alice.until((v) => v.phase === Phase.REVEAL)
    expect(reveal.reveal!.label).toBe(f.label)
    expect(reveal.reveal!.question.clue).toEqual(clue)
  })

  it("answers bad messages with errors instead of dropping the player", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    await alice.until((v) => v.phase === Phase.LOBBY)
    alice.send("start")
    await alice.until((v) => v.phase === Phase.GUESSING)

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
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)

    // Just over the limit. ws rejects it with close code 1009.
    const huge = "x".repeat(MAX_PAYLOAD_BYTES + 1)
    bob.client.send("paint", huge)
    await bob.waitClosed()
    expect(bob.client.connected).toBe(false)

    // The process is alive and the room still works. Bob shows offline, and
    // his lobby seat is freed once the grace period passes.
    expect(alice.client.connected).toBe(true)
    await alice.untilLatest((v) => v.players.some((p) => p.name === "Bob" && !p.connected))
    clock.advance(SEAT_GRACE)
    await alice.untilLatest((v) => v.players.length === 1)
    const cara = player("Cara")
    cara.connect({ code: lobby.code })
    await cara.until((v) => v.phase === Phase.LOBBY)
  })

  it("sends a round's reveal once, and again only to a player who reconnects", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("start")
    const round = await bob.until((v) => v.phase === Phase.GUESSING)
    const q = askedIn(round)
    const at = answerCentre(q.answer)
    const paint = paintAt(q, at.lat, at.lon)
    alice.sendPaint(paint)
    alice.send("lock")
    bob.send("lock")
    await alice.until((v) => v.phase === Phase.REVEAL)

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
    const back = await bobAgain.until((v) => v.phase === Phase.REVEAL)
    expect(back.reveal!.results).toHaveLength(2)
    expect(bobAgain.reveals).toHaveLength(1)
    await alice.untilLatest((v) => v.players.every((p) => p.connected))
    expect(alice.reveals).toHaveLength(1)
  })

  it("closes a connection that floods messages, and only that one", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
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
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("start")
    const round = await bob.until((v) => v.phase === Phase.GUESSING)
    const q = askedIn(round)
    const at = answerCentre(q.answer)
    const bobPaint = paintAt(q, at.lat, at.lon)
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
    const own = await bobAgain.until((v) => v.phase === Phase.GUESSING)
    expect(own.you.sittingOut).toBe(false)
    expect(own.you.paint).toEqual(decodePaint(encodePaint(bobPaint)))
  })

  it("frees the room once it has been empty for the grace period", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
    const room = app.rivalis.rooms.get(lobby.code) as GameRoom
    alice.client.disconnect()
    await eventually(() => room.state.connectedCount === 0, "the server to see Alice go")
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
    clock.advance(SEAT_GRACE)
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).toBeUndefined()
  })

  it("a lone host who refreshes in the lobby gets the game, and the host role, back", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    alice.client.disconnect()
    await alice.waitClosed()
    clock.advance(SEAT_GRACE - 1_000)
    const again = player("Alice") // same name => same token, like a refreshed tab
    again.connect({ code: lobby.code })
    const back = await again.until((v) => v.phase === Phase.LOBBY)
    expect(back.you.isHost).toBe(true)
    expect(back.players).toHaveLength(1)
    // The empty-room timer was cancelled on the way back in.
    clock.advance(SEAT_GRACE)
    expect(app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
  })

  it("a host who leaves the lobby frees their seat at once and hands over", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    await alice.until((v) => v.players.length === 2)
    alice.send("leave")
    await alice.waitClosed()
    expect(alice.client.connected).toBe(false)
    expect(alice.closedFor).toBe(CloseReason.LEFT)
    const after = await bob.untilLatest((v) => v.players.length === 1)
    expect(after.you.isHost).toBe(true)
  })

  it("shutting the server down tells players it restarted", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    await alice.until((v) => v.phase === Phase.LOBBY)
    await app.close()
    await alice.waitClosed()
    expect(alice.closedFor).toBe(CloseReason.SERVER_RESTARTED)
  })

  it("the last player leaving closes the game without waiting", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    alice.send("leave")
    await alice.waitClosed()
    await eventually(() => !app.rivalis.rooms.get(lobby.code), "the room to close")
  })

  it("a spectator joins to watch, and can take a seat in the lobby", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
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
    const lobby = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code: lobby.code })
    const two = await alice.until((v) => v.players.length === 2)
    alice.send("makeHost", { playerId: two.players.find((p) => p.name === "Bob")!.id })
    await bob.until((v) => v.you.isHost)
    await alice.untilLatest((v) => !v.you.isHost)
  })

  /** Alice hosting and Bob joined, both seen in the lobby. */
  async function aliceAndBob() {
    const alice = player("Alice")
    alice.connect({ create: true })
    const { code } = await alice.until((v) => v.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect({ code })
    const lobby = await alice.until((v) => v.players.length === 2)
    await bob.until((v) => v.players.length === 2)
    const bobId = lobby.players.find((p) => p.name === "Bob")!.id
    return { alice, bob, code, bobId }
  }

  it("the host removes a player: their connection closes as removed, and that seat cannot come back", async () => {
    const { alice, bob, code, bobId } = await aliceAndBob()
    alice.send("kick", { playerId: bobId })
    await bob.waitClosed()
    expect(bob.closedFor).toBe(CloseReason.REMOVED)
    await alice.untilLatest((v) => v.players.length === 1)

    const bobAgain = player("Bob")
    bobAgain.connect({ code })
    await bobAgain.waitClosed()
    expect(bobAgain.closedFor).toBe(CloseReason.REMOVED)
  })

  it("a second tab replaces the first, whose closing then leaves the seat alone", async () => {
    const { alice, bob, code } = await aliceAndBob()
    const bobTab2 = player("Bob")
    bobTab2.connect({ code })
    await bob.waitClosed()
    expect(bob.closedFor).toBe(CloseReason.REPLACED)

    bobTab2.send("rename", { name: "Bobby" })
    await alice.untilLatest((v) => v.players.some((p) => p.name === "Bobby" && p.connected))
    clock.advance(SEAT_GRACE)
    bobTab2.send("rename", { name: "Bob" })
    const after = await alice.untilLatest((v) => v.players.some((p) => p.name === "Bob"))
    expect(after.players).toHaveLength(2)
    expect(after.players.every((p) => p.connected)).toBe(true)
  })

  it("while the host is away the next player acts as host, until the host is back", async () => {
    const { alice, bob, code } = await aliceAndBob()
    alice.client.disconnect()
    await bob.untilLatest((v) => v.you.isHost)

    const aliceAgain = player("Alice")
    aliceAgain.connect({ code })
    await aliceAgain.untilLatest((v) => v.you.isHost)
    await bob.untilLatest((v) => !v.you.isHost)
  })

  it("a full game turns a newcomer away", async () => {
    const alice = player("Alice")
    alice.connect({ create: true })
    const { code } = await alice.until((v) => v.phase === Phase.LOBBY)
    for (let i = 1; i < MAX_PLAYERS + MAX_SPECTATORS; i++) {
      const p = player(`P${i}`)
      p.connect({ code, watch: i >= MAX_PLAYERS })
    }
    await alice.until((v) => v.players.length === MAX_PLAYERS + MAX_SPECTATORS, 10_000)
    const late = player("Late")
    late.connect({ code })
    await late.waitClosed()
    expect(late.closedFor).toBe(CloseReason.FULL)
  })

  it("once the game is over, a newcomer is told so, and a player who dropped can come back to the results", async () => {
    const { alice, bob, code } = await aliceAndBob()
    alice.send("start")
    await bob.until((v) => v.phase === Phase.GUESSING)
    alice.send("end")
    await bob.until((v) => v.phase === Phase.RESULTS)

    const late = player("Late")
    late.connect({ code })
    await late.waitClosed()
    expect(late.closedFor).toBe(CloseReason.FINISHED)

    bob.client.disconnect()
    await alice.untilLatest((v) => v.players.some((p) => p.name === "Bob" && !p.connected))
    const bobAgain = player("Bob")
    bobAgain.connect({ code })
    await bobAgain.until((v) => v.phase === Phase.RESULTS)
  })

  it("plays a round with a hint, unlocking, and the host ending early, then again", async () => {
    const { alice, bob } = await aliceAndBob()
    alice.send("start")
    await bob.until((v) => v.phase === Phase.GUESSING)

    alice.send("hint", { axis: HintAxis.LATITUDE })
    const hinted = await alice.untilLatest((v) => v.you.hint !== undefined)
    expect(hinted.you.hint!.axis).toBe(HintAxis.LATITUDE)
    alice.send("hint", { axis: HintAxis.LONGITUDE })
    expect(await pollErrors(alice)).toContain("one hint per round")

    bob.send("lock")
    await bob.untilLatest((v) => v.you.locked)
    bob.send("unlock")
    await bob.untilLatest((v) => !v.you.locked)

    bob.send("end")
    expect(await pollErrors(bob)).toContain("only the host can end the game")
    alice.send("end")
    const results = await bob.until((v) => v.phase === Phase.RESULTS)
    expect(results.results!.every((r) => r.rounds.length === 1)).toBe(true)

    alice.send("again")
    const lobby = await bob.until((v) => v.phase === Phase.LOBBY && v.results === undefined)
    expect(lobby.players).toHaveLength(2)
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

  it("answers 404 for an asset this build does not have, as for an old tab after a deploy", async () => {
    expect((await fetch(`${base}/assets/regions-old.json`)).status).toBe(404)
  })
})

describe("connections per address", () => {
  let app: App
  let url: string
  const players: TestPlayer[] = []

  beforeEach(async () => {
    configureGameRooms({
      clock: new FakeClock(),
      bank,
      config
    })
    app = createApp({
      staticDir: undefined,
      logLevel: "error",
      addressLimits: { maxOpen: 2, burst: 100, perSecond: 1 }
    })
    url = (await app.listen(0)).replace(/^http/, "ws") + "/ws"
  })

  afterEach(async () => {
    for (const p of players) p.client.disconnect()
    players.length = 0
    await app.close()
    configureGameRooms({ clock: realClock })
  })

  it("refuses connections over the limit, and lets them in once one closes", async () => {
    const [alice, bob, carol] = ["Alice", "Bob", "Carol"].map((n) => new TestPlayer(url, n))
    players.push(alice!, bob!, carol!)
    alice!.connect({ create: true })
    const { code } = await alice!.until((v) => v.phase === Phase.LOBBY)
    bob!.connect({ code })
    await alice!.until((v) => v.players.length === 2)

    carol!.connect({ code })
    await carol!.waitClosed()
    expect(carol!.states).toEqual([])

    bob!.client.disconnect()
    await alice!.untilLatest((v) => v.players.some((p) => p.name === "Bob" && !p.connected))
    carol!.connect({ code })
    await alice!.until((v) => v.players.some((p) => p.name === "Carol"))
  })
})
