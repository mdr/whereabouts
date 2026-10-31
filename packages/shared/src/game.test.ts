import { describe, expect, it } from "vite-plus/test"
import { latLngToCell } from "./h3.ts"
import { Game, ROUND_GRACE } from "./game.ts"
import type { QuestionBank } from "./round-picking.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { PASS_SCORE } from "./scoring.ts"
import {
  AnswerType,
  ClueType,
  FLAG_POINT_PROMPT,
  QuestionType,
  promptOf,
  type LandmarkQuestion,
  type PlaceQuestion,
  type Question
} from "./questions.ts"
import { CATALOGUE, outlinesFrom } from "./catalogue.ts"
import { REVEAL_PHOTOS } from "./photos.ts"
import { regionCells, scoredAnswer, type Area } from "./regions.ts"
import {
  type ConfigurePatch,
  type GameConfig,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  type QuestionView,
  SEAT_GRACE,
  mixOf,
  mixTotal,
  MapDetail,
  Phase
} from "./protocol.ts"
import outlinesJson from "../outlines.json" with { type: "json" }
import {
  commonsFile,
  placeId,
  playerId,
  playerName,
  playerToken,
  questionId,
  roomCode,
  wikiTitle,
  type PlayerToken,
  type RoomCode
} from "./ids.ts"
import type { LatLon } from "./geo.ts"
import { PLAYER_COLOURS } from "./colours.ts"
import { GameViewSchema } from "./view-schema.ts"
import { inHintBand, HintAxis } from "./hints.ts"
import { CloseReason } from "./close-reason.ts"

const place = (label: string, at: LatLon, tolerance = 100): PlaceQuestion => ({
  type: QuestionType.PLACE,
  id: questionId(label.toLowerCase()),
  place: placeId(label.toLowerCase()),
  label,
  wiki: wikiTitle(label),
  clue: { type: ClueType.NAME, prompt: `Where is ${label}?` },
  answer: { type: AnswerType.POINT, at, tolerance }
})
const petra = place("Petra", { lat: 30.3285, lon: 35.4444 }, 200)
const paris = place("Paris", { lat: 48.8566, lon: 2.3522 })
const tokyo = place("Tokyo", { lat: 35.6762, lon: 139.6503 })
const pool = [petra, paris, tokyo]

const landmark = (id: string, image: string): LandmarkQuestion => ({
  type: QuestionType.LANDMARK,
  id: questionId(id),
  place: placeId(id),
  label: id,
  wiki: wikiTitle(id),
  clue: { type: ClueType.PHOTO, image: commonsFile(image) },
  answer: petra.answer
})

const T0 = 1_000_000
const CODE = roomCode("ABCD")

/** A test player's seat token: tok("A") is tokA. */
const tok = (name: string) => playerToken(`tok${name}`.padEnd(16, "-"))
const tokA = tok("A")
const tokB = tok("B")
const tokC = tok("C")
const tokD = tok("D")
const tokH = tok("H")
const tokLate = tok("Late")
const tokNew = tok("New")
const tokS = tok("S")
const tokW = tok("W")
const tokW1 = tok("W1")
const tokZ = tok("Z")

function paintAt(q: Question, lat: number, lon: number) {
  const layer = new PaintLayer(resolutionForTolerance(q.answer.tolerance))
  layer.stamp({ lat, lon }, q.answer.tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

/** Paint on a place's answer. */
const paintOn = (q: PlaceQuestion) => paintAt(q, q.answer.at.lat, q.answer.at.lon)

/** The three test places and no outlines. */
const makeBank = (bank: Partial<QuestionBank> = {}): QuestionBank => ({ catalogue: pool, outlines: new Map(), ...bank })

function makeGame({
  code = CODE,
  bank,
  config,
  seed = 42
}: { code?: RoomCode; bank?: Partial<QuestionBank>; config?: Partial<GameConfig>; seed?: number } = {}): Game {
  return new Game(code, makeBank(bank), { config, seed })
}

function twoPlayerGame(rounds = 2) {
  // The test pool is place names only.
  const mix = mixOf({ [QuestionType.PLACE]: rounds })
  const g = makeGame({ config: { mix, roundLength: 60_000 } })
  expect(g.join(tokA, playerName("Alice"), T0).ok).toBe(true)
  expect(g.join(tokB, playerName("Bob"), T0 + 1).ok).toBe(true)
  return g
}

/** The question currently being asked, read back through a view. */
function currentQuestion(g: Game, token: PlayerToken, now: number): PlaceQuestion {
  const prompt = promptOf(g.view(token, now).round!.question)
  return pool.find((q) => q.clue.prompt === prompt)!
}

describe("lobby", () => {
  it("first joiner is host; while the host is away the next player acts as host; a lobby seat left empty is freed", () => {
    const g = twoPlayerGame()
    expect(g.view(tokA, T0).you.isHost).toBe(true)
    expect(g.view(tokB, T0).you.isHost).toBe(false)
    g.disconnect(tokA, T0)
    expect(g.view(tokB, T0).you.isHost).toBe(true)
    expect(g.playerTokens).toEqual([tokA, tokB])
    expect(g.nextWakeAt()).toBe(T0 + SEAT_GRACE)
    expect(g.tick(T0 + SEAT_GRACE - 1)).toBe(false)
    expect(g.tick(T0 + SEAT_GRACE)).toBe(true)
    expect(g.playerTokens).toEqual([tokB])
    expect(g.nextWakeAt()).toBeUndefined()
  })

  it("a refresh in the lobby keeps the seat, colour and host role", () => {
    const g = twoPlayerGame()
    const before = g.view(tokA, T0).players.find((p) => p.name === "Alice")!
    g.disconnect(tokA, T0)
    g.join(tokA, playerName("Alice"), T0 + 2_000)
    const after = g.view(tokA, T0 + 2_000).players.find((p) => p.name === "Alice")!
    expect(after).toMatchObject({ id: before.id, colour: before.colour, connected: true, isHost: true })
    expect(g.view(tokB, T0 + 2_000).you.isHost).toBe(false)
    // Back in time, so nothing is left to free.
    expect(g.nextWakeAt()).toBeUndefined()
    expect(g.tick(T0 + SEAT_GRACE)).toBe(false)
    expect(g.playerTokens).toContain(tokA)
  })

  it("leaving frees the seat at once and passes the host role to the longest-standing online player", () => {
    const g = twoPlayerGame()
    g.join(tokC, playerName("Cara"), T0 + 2)
    g.join(tokD, playerName("Dev"), T0 + 3)
    g.disconnect(tokB, T0 + 4) // Bob is away, so he is passed over
    const cara = g.view(tokC, T0 + 4).you.id
    expect(g.view(tokA, T0 + 4).you.nextHost).toBe(cara)
    expect(g.view(tokC, T0 + 4).you.nextHost).toBeUndefined()
    expect(g.leave(tokA)).toEqual({ ok: true, changed: true })
    expect(g.playerTokens).toEqual([tokB, tokC, tokD])
    expect(g.view(tokC, T0 + 5).you.isHost).toBe(true)
    // Nothing waits on a grace period for Alice.
    expect(g.nextWakeAt()).toBe(T0 + 4 + SEAT_GRACE)
    expect(g.leave(tokA)).toEqual({ ok: false, error: "unknown player" })
  })

  it("the last player leaving empties the game; nobody leaves mid-game", () => {
    const g = twoPlayerGame()
    expect(g.view(tokA, T0).you.nextHost).toBe(g.view(tokB, T0).you.id)
    g.leave(tokB)
    expect(g.view(tokA, T0).you.nextHost).toBeUndefined()
    g.leave(tokA)
    expect(g.playerCount).toBe(0)

    const h = twoPlayerGame()
    h.start(tokA, T0)
    expect(h.leave(tokB)).toEqual({ ok: false, error: "you can only leave from the lobby" })
  })

  it("the host can hand the role to another connected player, for good", () => {
    const g = twoPlayerGame()
    g.join(tokC, playerName("Cara"), T0)
    const id = (name: string) => g.view(tokA, T0).players.find((p) => p.name === name)!.id
    expect(g.makeHost(tokB, id("Cara"))).toEqual({ ok: false, error: "only the host can hand over" })
    expect(g.makeHost(tokA, id("Alice"))).toEqual({ ok: false, error: "you are already the host" })
    expect(g.makeHost(tokA, playerId("p99"))).toEqual({ ok: false, error: "unknown player" })
    g.disconnect(tokC, T0)
    expect(g.makeHost(tokA, id("Cara"))).toEqual({ ok: false, error: "that player is offline" })
    expect(g.makeHost(tokA, id("Bob"))).toEqual({ ok: true, changed: true })
    expect(g.view(tokB, T0).you.isHost).toBe(true)
    expect(g.view(tokA, T0).you.isHost).toBe(false)
    // Alice leaving and coming back does not bring the role with her.
    g.disconnect(tokA, T0 + 1)
    g.join(tokA, playerName("Alice"), T0 + 2)
    expect(g.view(tokA, T0 + 2).you.isHost).toBe(false)
  })

  it("an acting host can hand over too, and the absent host does not get it back", () => {
    const g = twoPlayerGame()
    g.join(tokC, playerName("Cara"), T0 + 2)
    g.start(tokA, T0)
    g.disconnect(tokA, T0 + 1)
    const cara = g.view(tokB, T0 + 1).players.find((p) => p.name === "Cara")!
    expect(g.makeHost(tokB, cara.id).ok).toBe(true)
    g.join(tokA, playerName("Alice"), T0 + 5)
    expect(g.view(tokC, T0 + 5).you.isHost).toBe(true)
    expect(g.view(tokA, T0 + 5).you.isHost).toBe(false)
  })

  it("only the host can start", () => {
    const g = twoPlayerGame()
    expect(g.start(tokB, T0)).toEqual({ ok: false, error: "only the host can start" })
    expect(g.start(tokA, T0).ok).toBe(true)
    expect(g.phase).toBe(Phase.GUESSING)
  })
})

describe("round loop", () => {
  it("scores at the deadline, exact hit beats blank, blank scores as a pass", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.view(tokA, T0).round!.deadline).toBe(T0 + 60_000)

    expect(g.setPaint(tokA, paintOn(q))).toEqual({ ok: true, changed: false })
    // Bob paints nothing.
    expect(g.tick(T0 + 60_000 + ROUND_GRACE - 1)).toBe(false)
    expect(g.tick(T0 + 60_000 + ROUND_GRACE)).toBe(true)
    expect(g.phase).toBe(Phase.REVEAL)

    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(reveal.label).toBe(q.label)
    expect(reveal.wiki).toBe(q.wiki)
    expect(reveal.results).toHaveLength(2)
    const [first, second] = reveal.results
    expect(first!.playerId).toBe("p1")
    expect(first!.score).toBeGreaterThan(900)
    expect(second!.paint).toBeUndefined()
    expect(second!.score).toBe(PASS_SCORE.score)
    expect(reveal.ready).toEqual([])
    expect(g.nextWakeAt()).toBeUndefined()
  })

  it("paint is private during guessing and visible after the reveal", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 10, 10))
    const during = g.view(tokB, T0 + 10)
    expect(during.reveal).toBeUndefined()
    expect(JSON.stringify(during)).not.toContain("cells")
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const after = g.view(tokB, T0 + 60_000)
    expect(after.reveal!.results.find((r) => r.playerId === "p1")!.paint).not.toBeUndefined()
  })

  it("locking freezes paint; late paint is rejected", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    expect(g.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(g.view(tokA, T0).you.locked).toBe(true)
    expect(g.setPaint(tokA, paintAt(q, 1, 1))).toEqual({ ok: true, changed: false }) // stale upload, ignored
  })

  it("unlocking after Done lets the guess change, only while the round runs", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.unlock(tokA)).toEqual({ ok: true, changed: false }) // not locked: nothing to undo
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    expect(g.unlock(tokA)).toEqual({ ok: true, changed: true })
    expect(g.view(tokA, T0).you.locked).toBe(false)
    // The new guess replaces the old one and is what gets scored.
    g.setPaint(tokA, paintOn(q))
    g.lock(tokA, T0 + 1)
    g.setPaint(tokB, paintAt(q, 0, 0))
    g.lock(tokB, T0 + 2) // everyone done: the round ends
    expect(g.phase).toBe(Phase.REVEAL)
    const mine = g.view(tokA, T0 + 2).reveal!.results.find((r) => r.playerId === "p1")!
    expect(mine.score).toBeGreaterThan(900)
    expect(g.unlock(tokA)).toEqual({ ok: true, changed: false }) // too late: ignored
    expect(g.lock(tokA, T0 + 3)).toEqual({ ok: true, changed: false })
  })

  it("locking with nothing painted is a pass: the pass score, no paint, and the round can end early", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(g.view(tokA, T0).you.locked).toBe(true)
    // Paint arriving after a pass is a stale upload and changes nothing.
    expect(g.setPaint(tokA, paintAt(q, 0, 0))).toEqual({ ok: true, changed: false })
    g.setPaint(tokB, paintAt(q, 0, 0))
    g.lock(tokB, T0 + 5)
    expect(g.phase).toBe(Phase.REVEAL)
    const mine = g.view(tokA, T0 + 5).reveal!.results.find((r) => r.playerId === "p1")!
    expect(mine.paint).toBeUndefined()
    expect(mine.score).toBe(250)
  })

  it("the round ends as soon as every active connected player has locked in", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.join(tokC, playerName("Cara"), T0 + 5) // sitting this round out: must not hold it up
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.setPaint(tokB, paintAt(q, 1, 1))
    g.lock(tokA, T0 + 10)
    expect(g.phase).toBe(Phase.GUESSING)
    g.lock(tokB, T0 + 20)
    expect(g.phase).toBe(Phase.REVEAL)
    expect(g.view(tokA, T0 + 20).reveal!.results).toHaveLength(2)
  })

  it("a dropped player does not hold up a round the others have locked", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0 + 10)
    expect(g.phase).toBe(Phase.GUESSING)
    g.disconnect(tokB, T0 + 20)
    expect(g.phase).toBe(Phase.REVEAL)
    // Bob still gets scored (blank) and keeps his seat.
    expect(g.view(tokA, T0 + 20).reveal!.results).toHaveLength(2)
    expect(g.playerTokens).toContain(tokB)
  })

  it("the reveal advances when everyone is ready, or when the host says so; ends in results", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.nextWakeAt()).toBeUndefined()
    expect(g.next(tokB, T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" })
    expect(g.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: true })
    expect(g.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: false })
    expect(g.phase).toBe(Phase.REVEAL)
    expect(g.view(tokA, T0 + 61_000).reveal!.ready).toEqual(["p2"])
    expect(g.ready(tokA, T0 + 62_000).ok).toBe(true)
    expect(g.phase).toBe(Phase.GUESSING)
    expect(g.view(tokA, T0 + 62_000).round!.index).toBe(1)
    expect(g.nextWakeAt()).toBe(T0 + 122_000 + ROUND_GRACE)
    g.tick(T0 + 122_000 + ROUND_GRACE)
    expect(g.phase).toBe(Phase.REVEAL)
    expect(g.view(tokA, T0 + 122_000).reveal!.ready).toEqual([])
    expect(g.ready(tokA, T0 + 123_000)).toEqual({ ok: true, changed: true })
    // The host need not wait for Bob.
    expect(g.next(tokA, T0 + 124_000).ok).toBe(true)
    expect(g.phase).toBe(Phase.RESULTS)
    const results = g.view(tokA, T0 + 124_000).results!
    expect(results).toHaveLength(2)
    expect(results[0]!.total).toBeGreaterThanOrEqual(results[1]!.total)
    expect(results[0]!.rounds).toHaveLength(2)
  })

  it("hands out awards at the end, and clears them for the next game", () => {
    const g = twoPlayerGame(3)
    g.start(tokA, T0)
    let now = T0
    for (let i = 0; i < 3; i++) {
      // Alice passes straight away; Bob paints one confident dab in the Gulf of Guinea.
      g.lock(tokA, now + 1_000)
      g.setPaint(tokB, paintAt(petra, 0, 0))
      g.lock(tokB, now + 2_000)
      now += 3_000
      g.next(tokA, now)
    }
    expect(g.phase).toBe(Phase.RESULTS)
    const awards = g.view(tokA, now).awards!
    expect(awards.length).toBeGreaterThanOrEqual(2)
    expect(awards.find((a) => a.title === "Chicken")?.playerIds).toEqual(["p1"])
    expect(awards.some((a) => a.playerIds.includes(playerId("p2")))).toBe(true)
    g.again(tokA, now)
    expect(g.view(tokA, now).awards).toBeUndefined()
  })

  it("paint arriving just after the deadline still counts, and an empty upload takes paint back", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    // Alice painted, then erased it all: the empty upload replaces her paint.
    g.setPaint(tokA, paintOn(q))
    g.setPaint(tokA, { cells: {}, floor: 0.05 })
    // Bob's last stroke, sent at zero, lands within the grace period.
    expect(g.tick(T0 + 60_000)).toBe(false)
    g.setPaint(tokB, paintOn(q))
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const results = g.view(tokA, T0 + 61_000).reveal!.results
    const alice = results.find((r) => r.playerId === "p1")!
    expect(alice.score).toBe(PASS_SCORE.score)
    expect(alice.paint).toBeUndefined()
    expect(results.find((r) => r.playerId === "p2")!.score).toBeGreaterThan(900)
  })
})

describe("player cap", () => {
  function fullGame(): Game {
    const g = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) expect(g.join(tok(`${i}`), playerName(`P${i}`), T0).ok).toBe(true)
    return g
  }

  it("has a colour for every player it allows", () => {
    expect(PLAYER_COLOURS.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it("seats a newcomer to a full game as a spectator, and turns people away once the spectators are full too", () => {
    const g = fullGame()
    expect(g.view(tokA, T0).players).toHaveLength(MAX_PLAYERS)
    for (let i = 1; i <= MAX_SPECTATORS; i++) expect(g.join(tok(`W${i}`), playerName(`W${i}`), T0).ok).toBe(true)
    const w1 = g.view(tokW1, T0)
    expect(w1.you.watching).toBe(true)
    expect(w1.players.find((p) => p.name === "W1")).toMatchObject({ watching: true, colour: undefined, rank: 0 })
    expect(g.join(tokLate, playerName("Late"), T0)).toEqual({ ok: false, reason: CloseReason.FULL })
  })

  it("still lets a player who dropped out back in", () => {
    const g = fullGame()
    g.disconnect(tokB, T0)
    expect(g.join(tokB, playerName("Bob"), T0).ok).toBe(true)
  })

  it("frees the seat and the colour when the host removes someone", () => {
    const g = fullGame()
    const bob = g.view(tokA, T0).players.find((p) => p.name === "Bob")!
    g.kick(tokA, bob.id, T0)
    expect(g.join(tokNew, playerName("Nine"), T0).ok).toBe(true)
    const nine = g.view(tokA, T0).players.find((p) => p.name === "Nine")!
    expect(nine.colour).toBe(bob.colour)
    const colours = g.view(tokA, T0).players.map((p) => p.colour)
    expect(new Set(colours).size).toBe(MAX_PLAYERS)
  })
})

describe("spectators", () => {
  const T1 = T0 + 60_000
  function withSpectator(): Game {
    const g = twoPlayerGame(2)
    expect(g.join(tokS, playerName("Sam"), T0 + 2, true).ok).toBe(true)
    return g
  }
  const sam = (g: Game) => g.view(tokA, T0).players.find((p) => p.name === "Sam")!

  it("joins to watch when asked, with no colour, listed after the players", () => {
    const g = withSpectator()
    const v = g.view(tokS, T0)
    expect(v.you.watching).toBe(true)
    expect(v.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Sam"])
    expect(sam(g)).toMatchObject({ watching: true, colour: undefined })
  })

  it("does not paint, finish, get scored or hold up either waiting phase", () => {
    const g = withSpectator()
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.setPaint(tokS, paintAt(q, 0, 0))).toEqual({ ok: false, error: "you are watching" })
    expect(g.lock(tokS, T0)).toEqual({ ok: false, error: "you are watching" })
    // The two players finishing ends the round; Sam is not waited on.
    g.lock(tokA, T0 + 1)
    g.lock(tokB, T0 + 2)
    expect(g.phase).toBe(Phase.REVEAL)
    const reveal = g.view(tokS, T0 + 2).reveal!
    expect(reveal.results.map((r) => r.playerId).sort()).toEqual(["p1", "p2"])
    expect(g.ready(tokS, T0 + 3)).toEqual({ ok: false, error: "you are watching" })
    g.ready(tokA, T0 + 3)
    g.ready(tokB, T0 + 4)
    expect(g.phase).toBe(Phase.GUESSING)
    g.tick(T1 + 10_000 + ROUND_GRACE)
    g.next(tokA, T1 + 10_000)
    expect(
      g
        .view(tokS, T1 + 10_000)
        .results!.map((r) => r.playerId)
        .sort()
    ).toEqual(["p1", "p2"])
  })

  it("switches role in the lobby only, taking or giving up a colour", () => {
    const g = withSpectator()
    expect(g.setRole(tokS, false)).toEqual({ ok: true, changed: true })
    expect(sam(g)).toMatchObject({ watching: false, colour: 2 })
    expect(g.setRole(tokB, true)).toEqual({ ok: true, changed: true })
    expect(g.view(tokB, T0).players.find((p) => p.name === "Bob")).toMatchObject({ watching: true, colour: undefined })
    expect(g.setRole(tokB, true)).toEqual({ ok: true, changed: false })
    g.start(tokA, T0)
    expect(g.setRole(tokA, true)).toEqual({ ok: false, error: "you can only switch to watching in the lobby" })
  })

  it("a spectator can take a free seat mid-round, sitting that round out and playing from the next", () => {
    const g = withSpectator()
    g.start(tokA, T0)
    expect(g.setRole(tokS, false)).toEqual({ ok: true, changed: true })
    const v = g.view(tokS, T0 + 1)
    expect(v.you).toMatchObject({ watching: false, sittingOut: true })
    expect(sam(g).colour).toBeGreaterThanOrEqual(0)
    expect(g.lock(tokS, T0 + 1)).toEqual({ ok: false, error: "sitting this round out" })
    // Alice and Bob finishing still ends the round without Sam.
    g.lock(tokA, T0 + 2)
    g.lock(tokB, T0 + 3)
    expect(g.phase).toBe(Phase.REVEAL)
    // Sam is a player now, so the reveal waits for his Ready too.
    g.ready(tokA, T0 + 4)
    g.ready(tokB, T0 + 5)
    expect(g.phase).toBe(Phase.REVEAL)
    g.ready(tokS, T0 + 6)
    expect(g.phase).toBe(Phase.GUESSING)
    expect(g.view(tokS, T0 + 6).you.sittingOut).toBe(false)
    g.tick(T0 + 6 + 60_000 + ROUND_GRACE)
    g.next(tokA, T0 + 6 + 60_000)
    const standing = g.view(tokS, T0 + 6 + 60_000).results!.find((r) => r.playerId === sam(g).id)!
    expect(standing.rounds).toEqual([{}, { score: 250 }])
  })

  it("taking a seat at the reveal means playing from the next round", () => {
    const g = withSpectator()
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.phase).toBe(Phase.REVEAL)
    g.setRole(tokS, false)
    g.ready(tokA, T0 + 60_001)
    g.ready(tokB, T0 + 60_002)
    g.ready(tokS, T0 + 60_003)
    expect(g.view(tokS, T0 + 60_003).you.sittingOut).toBe(false)
  })

  it("nobody switches on the final results", () => {
    const g = withSpectator()
    g.start(tokA, T0)
    g.end(tokA)
    expect(g.setRole(tokS, false)).toEqual({ ok: false, error: "game has finished" })
  })

  it("cannot take a seat when all the player seats are taken", () => {
    const g = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) g.join(tok(`${i}`), playerName(`P${i}`), T0)
    g.join(tokS, playerName("Sam"), T0, true)
    expect(g.setRole(tokS, false)).toEqual({ ok: false, error: "game is full" })
    expect(g.join(tokW, playerName("Wes"), T0, true).ok).toBe(true)
  })

  it("a host can watch and still run the game, but a game needs a player to start", () => {
    const g = twoPlayerGame(1)
    g.setRole(tokA, true)
    expect(g.view(tokA, T0).you.isHost).toBe(true)
    expect(g.start(tokA, T0).ok).toBe(true)
    const h = makeGame({ code: roomCode("WXYZ") })
    h.join(tokH, playerName("Hana"), T0, true)
    expect(h.start(tokH, T0)).toEqual({ ok: false, error: "no players" })
  })

  it("a spectator reclaims their seat as a spectator after a refresh", () => {
    const g = withSpectator()
    g.disconnect(tokS, T0 + 5)
    g.join(tokS, playerName("Sam"), T0 + 6)
    expect(g.view(tokS, T0 + 6).you.watching).toBe(true)
  })
})

describe("joining and leaving mid-game", () => {
  it("late joiner spectates the current round and plays the next", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    expect(g.join(tokC, playerName("Cara"), T0 + 5).ok).toBe(true)
    expect(g.view(tokC, T0 + 5).you.sittingOut).toBe(true)
    const q = currentQuestion(g, tokA, T0)
    expect(g.setPaint(tokC, paintAt(q, 0, 0))).toEqual({ ok: false, error: "sitting this round out" })
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.view(tokC, T0 + 60_000).reveal!.results.map((r) => r.playerId)).not.toContain("p3")
    g.next(tokA, T0 + 60_001)
    expect(g.view(tokC, T0 + 60_001).you.sittingOut).toBe(false)
    const q2 = currentQuestion(g, tokC, T0 + 60_001)
    expect(g.setPaint(tokC, paintAt(q2, 0, 0)).ok).toBe(true)
  })

  it("a late joiner's total counts the rounds they played", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.join(tokC, playerName("Cara"), T0 + 5)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.next(tokA, T0 + 60_001)
    g.tick(T0 + 120_001 + ROUND_GRACE)
    const cara = g.view(tokC, T0 + 120_001).players.find((p) => p.id === "p3")!
    expect(cara.score).toBeGreaterThan(0)
    g.next(tokA, T0 + 120_002)
    const standing = g.view(tokC, T0 + 120_002).results!.find((s) => s.playerId === "p3")!
    expect(standing.total).toBe(cara.score)
    expect(standing.rounds).toEqual([{}, { score: cara.score }])
  })

  it("a reconnecting player gets their own paint back, and only their own", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    const mine = paintAt(q, 10, 10)
    g.setPaint(tokA, mine)
    g.disconnect(tokA, T0 + 1)
    g.join(tokA, playerName("Alice"), T0 + 5)
    expect(g.view(tokA, T0 + 5).you.paint).toEqual(mine)
    expect(g.view(tokB, T0 + 5).you.paint).toBeUndefined()
    expect(JSON.stringify(g.view(tokB, T0 + 5))).not.toContain(Object.keys(mine.cells)[0])
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.view(tokA, T0 + 60_000).you.paint).toBeUndefined()
  })

  it("a disconnected player keeps their seat and score, and reclaims it by token", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.disconnect(tokB, T0 + 60_001)
    expect(g.playerTokens).toContain(tokB)
    expect(g.view(tokA, T0 + 60_001).players.find((p) => p.id === "p2")!.connected).toBe(false)
    g.join(tokB, playerName("Bob"), T0 + 70_000)
    const bob = g.view(tokB, T0 + 70_000).players.find((p) => p.id === "p2")!
    expect(bob.connected).toBe(true)
    expect(bob.score).toBeGreaterThan(0)
  })

  it("while the host is away the longest-standing player acts as host; the host regains it on return", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.disconnect(tokA, T0 + 1)
    expect(g.view(tokB, T0 + 1).you.isHost).toBe(true)
    expect(g.view(tokB, T0 + 1).players.find((p) => p.id === "p2")!.isHost).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.next(tokA, T0 + 60_000)).toEqual({ ok: false, error: "only the host can advance" })
    expect(g.next(tokB, T0 + 60_000).ok).toBe(true)
    // A refresh brings the original host straight back.
    g.join(tokA, playerName("Alice"), T0 + 61_000)
    expect(g.view(tokA, T0 + 61_000).you.isHost).toBe(true)
    expect(g.view(tokB, T0 + 61_000).you.isHost).toBe(false)
  })

  it("in the lobby a host gone longer than the grace period hands over for good", () => {
    const g = twoPlayerGame(2)
    g.disconnect(tokA, T0 + 1)
    g.tick(T0 + 1 + SEAT_GRACE)
    g.join(tokA, playerName("Alice"), T0 + 1 + SEAT_GRACE + 5)
    expect(g.view(tokA, T0 + SEAT_GRACE + 6).you.isHost).toBe(false)
    expect(g.view(tokB, T0 + SEAT_GRACE + 6).you.isHost).toBe(true)
  })

  it("play again returns to the lobby with scores reset", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.next(tokA, T0 + 80_000)
    expect(g.phase).toBe(Phase.RESULTS)
    expect(g.join(tokZ, playerName("Zed"), T0 + 80_001)).toEqual({ ok: false, reason: CloseReason.FINISHED })
    expect(g.again(tokA, T0 + 81_000).ok).toBe(true)
    expect(g.phase).toBe(Phase.LOBBY)
    expect(g.view(tokA, T0 + 81_000).players.map((p) => p.score)).toEqual([0, 0])
  })

  it("play again keeps a player who is away their seat for the lobby's grace, from then", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    g.disconnect(tokB, T0 + 1)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.next(tokA, T0 + 80_000)
    const again = T0 + 81_000
    g.again(tokA, again)
    g.tick(again + SEAT_GRACE - 1)
    g.join(tokB, playerName("Bob"), again + SEAT_GRACE - 1)
    expect(g.view(tokB, again + SEAT_GRACE).you.id).toBe("p2")

    g.disconnect(tokB, again + SEAT_GRACE)
    g.tick(again + 2 * SEAT_GRACE)
    expect(g.playerTokens).toEqual([tokA])
  })

  it("play again keeps an absent host the host, with the presser acting for them", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    g.disconnect(tokA, T0 + 1)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.next(tokB, T0 + 80_000)
    g.again(tokB, T0 + 81_000)
    g.join(tokA, playerName("Alice"), T0 + 82_000)
    expect(g.view(tokA, T0 + 82_000).you.isHost).toBe(true)
  })

  it("play again leaves each player as a new joiner would be, but for who they are", () => {
    const seat = new Set(["id", "token", "name", "colour", "watching", "connected", "leftAt", "joinedAt"])
    const record = (g: Game, token: PlayerToken) =>
      Object.fromEntries(
        Object.entries((g as unknown as { seats: { get(t: PlayerToken): object } }).seats.get(token)).filter(
          ([k]) => !seat.has(k)
        )
      )
    const fresh = twoPlayerGame(1)
    const g = makeGame({ config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000, hints: 1 } })
    g.join(tokA, playerName("Alice"), T0)
    g.join(tokB, playerName("Bob"), T0 + 1)
    g.start(tokA, T0)
    g.hint(tokA, HintAxis.LATITUDE)
    g.setPaint(tokA, paintOn(currentQuestion(g, tokA, T0)))
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.next(tokA, T0 + 80_000)
    g.again(tokA, T0 + 81_000)
    expect(record(g, tokA)).toEqual(record(fresh, tokA))
    expect(record(g, tokB)).toEqual(record(fresh, tokB))
  })
})

describe("rename", () => {
  it("changes the visible name for everyone, in any phase", () => {
    const g = twoPlayerGame(1)
    expect(g.rename(tokB, playerName("Robert"))).toEqual({ ok: true, changed: true })
    expect(
      g
        .view(tokA, T0)
        .players.map((p) => p.name)
        .sort()
    ).toEqual(["Alice", "Robert"])
    g.start(tokA, T0)
    expect(g.rename(tokB, playerName("Bobby")).ok).toBe(true)
    expect(g.rename(tokB, playerName("Bobby"))).toEqual({ ok: true, changed: false })
    expect(g.rename(tok("nobody"), playerName("X"))).toEqual({ ok: false, error: "unknown player" })
  })
})

describe("ranks", () => {
  it("ranks share on ties and record the previous rank for arrows", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintOn(q))
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const v = g.view(tokA, T0 + 60_000)
    const a = v.players.find((p) => p.id === "p1")!
    const b = v.players.find((p) => p.id === "p2")!
    expect(a.rank).toBe(1)
    expect(b.rank).toBe(2)
    expect(a.previousRank).toBe(1)
    expect(b.previousRank).toBe(1)
  })
})

describe("ready-up edge cases", () => {
  it("a player leaving during the reveal does not hold the others up", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.ready(tokA, T0 + 61_000)
    expect(g.phase).toBe(Phase.REVEAL)
    g.disconnect(tokB, T0 + 62_000)
    expect(g.phase).toBe(Phase.GUESSING)
  })

  it("nobody left connected means nothing advances", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.disconnect(tokA, T0 + 61_000)
    g.disconnect(tokB, T0 + 61_001)
    expect(g.phase).toBe(Phase.REVEAL)
  })

  it("ready is only meaningful during the reveal, and resets each round", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    expect(g.ready(tokA, T0)).toEqual({ ok: true, changed: false })
    g.tick(T0 + 60_000 + ROUND_GRACE)
    g.ready(tokA, T0 + 61_000)
    g.ready(tokB, T0 + 61_000)
    g.tick(T0 + 121_000 + ROUND_GRACE)
    expect(g.view(tokA, T0 + 121_000).reveal!.ready).toEqual([])
  })
})

describe("configure", () => {
  const places = (n: number) => mixOf({ [QuestionType.PLACE]: n })
  const landmarks = (n: number) => mixOf({ [QuestionType.LANDMARK]: n })

  it("lets the host change the mix, and so the rounds, and round length in the lobby only", () => {
    const g = twoPlayerGame()
    expect(g.configure(tokB, { mix: places(3) })).toEqual({ ok: false, error: "only the host can change settings" })
    expect(g.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: false })
    expect(g.configure(tokA, { roundLength: 30_000 }).ok).toBe(true)
    const v = g.view(tokB, T0)
    expect(mixTotal(v.config.mix)).toBe(3)
    expect(v.config.roundLength).toBe(30_000)
    g.start(tokA, T0)
    expect(g.view(tokA, T0).round!.total).toBe(3)
    expect(g.view(tokA, T0).round!.deadline).toBe(T0 + 30_000)
    expect(g.configure(tokA, { mix: places(5) })).toEqual({
      ok: false,
      error: "settings are locked once the game starts"
    })
  })

  it("sees a change to any setting the host may make, and no change when it is set to what it was", () => {
    // Typed so that a new setting must be added here.
    const changes: Required<ConfigurePatch> = {
      roundLength: 30_000,
      mix: places(3),
      mapDetail: MapDetail.PHYSICAL,
      hints: 3
    }
    for (const [key, value] of Object.entries(changes)) {
      const g = twoPlayerGame()
      expect(g.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: true })
      expect(g.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: false })
    }
  })

  it("the question mix reaches the picker", () => {
    const g = makeGame({
      bank: { catalogue: [...pool, landmark("petra-photo", "Petra.jpg")] },
      config: { mix: places(1) }
    })
    g.join(tokA, playerName("Alice"), T0)
    expect(g.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: false })
    expect(g.view(tokA, T0).config.mix).toEqual(landmarks(1))
    g.start(tokA, T0)
    // One round, a landmark: it must be the one landmark in the catalogue.
    expect(g.view(tokA, T0).round!.question.clue).toEqual({ type: ClueType.PHOTO, image: "Petra.jpg" })
  })

  it("starts on minimal map detail and lets the host change it in the lobby", () => {
    const g = twoPlayerGame(1)
    expect(g.view(tokB, T0).config.mapDetail).toBe(MapDetail.MINIMAL)
    expect(g.configure(tokB, { mapDetail: MapDetail.WATER }).ok).toBe(false)
    expect(g.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: false })
    expect(g.view(tokB, T0).config.mapDetail).toBe(MapDetail.PHYSICAL)
    g.start(tokA, T0)
    expect(g.configure(tokA, { mapDetail: MapDetail.POLITICAL }).ok).toBe(false)
  })

  it("reports who has locked in", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0 + 1)
    const players = g.view(tokB, T0 + 1).players
    expect(players.find((p) => p.id === "p1")!.locked).toBe(true)
    expect(players.find((p) => p.id === "p2")!.locked).toBe(false)
  })
})

describe("host removes a player", () => {
  it("drops their seat and paint, bans the token, and lets a fresh token in", () => {
    const g = twoPlayerGame()
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokB, paintOn(q))
    const bobId = g.view(tokB, T0).you.id!
    expect(g.kick(tokB, g.view(tokA, T0).you.id!, T0)).toEqual({
      ok: false,
      error: "only the host can remove players"
    })
    expect(g.kick(tokA, g.view(tokA, T0).you.id!, T0)).toEqual({ ok: false, error: "you cannot remove yourself" })
    expect(g.kick(tokA, playerId("p99"), T0)).toEqual({ ok: false, error: "unknown player" })
    expect(g.kick(tokA, bobId, T0).ok).toBe(true)
    expect(g.playerTokens).toEqual([tokA])
    expect(g.join(tokB, playerName("Bob again"), T0)).toEqual({ ok: false, reason: CloseReason.REMOVED })
    expect(g.join(tokC, playerName("Carol"), T0).ok).toBe(true)
    // Bob's paint must not surface when the round ends.
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    expect(g.phase).toBe(Phase.REVEAL)
    expect(g.view(tokA, T0).reveal!.results.map((r) => r.playerId)).not.toContain(bobId)
  })

  it("removing the last unlocked player ends the round; removing an absent host passes the role", () => {
    const g = twoPlayerGame()
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    expect(g.phase).toBe(Phase.GUESSING)
    g.kick(tokA, g.view(tokB, T0).you.id!, T0)
    expect(g.phase).toBe(Phase.REVEAL)

    const h = twoPlayerGame()
    h.start(tokA, T0)
    h.disconnect(tokA, T0)
    // Bob acts as host while Alice is away, and may remove her for good.
    const alice = h.view(tokB, T0).players.find((p) => !p.connected)!
    expect(h.kick(tokB, alice.id, T0).ok).toBe(true)
    expect(h.playerTokens).toEqual([tokB])
    expect(h.view(tokB, T0).you.isHost).toBe(true)
    // Alice reconnecting does not get her seat or the role back.
    expect(h.join(tokA, playerName("Alice"), T0).ok).toBe(false)
  })
})

describe("host ends the game early", () => {
  it("scores the running round and jumps to results; only the host; nothing to end in the lobby", () => {
    const g = twoPlayerGame(3)
    expect(g.end(tokA)).toEqual({ ok: false, error: "nothing to end" })
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintOn(q))
    expect(g.end(tokB)).toEqual({ ok: false, error: "only the host can end the game" })
    expect(g.end(tokA).ok).toBe(true)
    expect(g.phase).toBe(Phase.RESULTS)
    const results = g.view(tokA, T0).results!
    expect(results[0]!.rounds).toHaveLength(1)
    expect(results[0]!.total).toBeGreaterThan(500)
  })

  it("works from the reveal too", () => {
    const g = twoPlayerGame(3)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.setPaint(tokB, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    g.lock(tokB, T0)
    expect(g.phase).toBe(Phase.REVEAL)
    expect(g.end(tokA).ok).toBe(true)
    expect(g.phase).toBe(Phase.RESULTS)
  })
})

describe("the question mix", () => {
  const OUTLINES = outlinesFrom(outlinesJson)
  const byId = (id: string) => CATALOGUE.find((q) => q.id === id)!
  const areaOf = (q: Question) => scoredAnswer(q.answer, OUTLINES) as Area
  const germany = byId("germany-region")

  function game(config: Partial<GameConfig>, bank: Partial<QuestionBank> = {}) {
    const g = makeGame({
      bank: { catalogue: CATALOGUE, outlines: OUTLINES, ...bank },
      config: { roundLength: 60_000, ...config }
    })
    g.join(tokA, playerName("Alice"), T0)
    g.join(tokB, playerName("Bob"), T0 + 1)
    return g
  }

  const outlineOf = (q: QuestionView) => (q.answer.type === AnswerType.AREA ? q.answer.outline : undefined)

  it("defaults to 2 of each type but the extras", () => {
    expect(makeGame().config.mix).toEqual(
      mixOf({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 2, [QuestionType.COUNTRY]: 2, [QuestionType.FLAG]: 2 })
    )
  })

  it("sends every player and spectator views that match GameViewSchema, through every type of round", () => {
    const mix = mixOf(Object.fromEntries(Object.values(QuestionType).map((t) => [t, 1])))
    const g = game({ mix, mapDetail: MapDetail.WATER })
    g.join(tokS, playerName("Sam"), T0 + 2, true)
    let now = T0
    const check = () => {
      for (const token of [tokA, tokB, tokS]) {
        const checked = GameViewSchema.safeParse(g.view(token, now))
        expect(checked.success, JSON.stringify(checked.error?.issues)).toBe(true)
      }
    }
    check()
    g.start(tokA, now)
    while (g.phase !== Phase.RESULTS) {
      const { tolerance } = g.view(tokA, now).round!.question.answer
      const layer = new PaintLayer(resolutionForTolerance(tolerance))
      layer.stamp({ lat: 10, lon: 10 }, tolerance, 1)
      g.setPaint(tokA, { cells: layer.toRecord(), floor: 0.05 })
      g.lock(tokB, now)
      check()
      now += 60_000 + ROUND_GRACE
      g.tick(now)
      check()
      g.next(tokA, now)
    }
    check()
    expect(g.view(tokA, now).awards!.length).toBeGreaterThan(0)
  })

  it("scores a country round against the outline, which it never sends; a pass still scores 250", () => {
    const g = game({ mix: mixOf({ [QuestionType.COUNTRY]: 1 }) }, { catalogue: [germany] })
    g.start(tokA, T0)
    const q = g.view(tokA, T0).round!.question
    expect(outlineOf(q)).toBe("germany-region")
    expect(JSON.stringify(g.view(tokA, T0).round)).not.toContain("[[")
    const res = resolutionForTolerance(q.answer.tolerance)
    const cells = Object.fromEntries(regionCells(areaOf(germany), res).map((h) => [h, 1]))
    expect(g.setPaint(tokA, { cells, floor: 0.05 }).ok).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(outlineOf(reveal.question)).toBe("germany-region")
    expect(reveal.label).toBe("Germany")
    const alice = reveal.results.find((r) => r.playerId === "p1")!
    expect(alice.score).toBeGreaterThan(985)
    const fit = alice.parts.type === AnswerType.AREA ? alice.parts : { coverage: 0, precision: 0 }
    expect(fit.coverage).toBeGreaterThan(0.95)
    expect(fit.precision).toBeGreaterThan(0.95)
    const bob = reveal.results.find((r) => r.playerId === "p2")!
    expect(bob.score).toBe(PASS_SCORE.score)
    expect(bob.parts).toEqual({ type: AnswerType.POINT, A: PASS_SCORE.A, B: PASS_SCORE.B })
  })

  it("scores a small country's flag as a point and reveals its name", () => {
    const monaco = byId("flag-mc")
    const g = game({ mix: mixOf({ [QuestionType.FLAG]: 1 }) }, { catalogue: [monaco] })
    g.start(tokA, T0)
    const q = g.view(tokA, T0).round!.question
    expect(q).toEqual({
      type: QuestionType.FLAG,
      clue: { type: ClueType.FLAG, flag: "mc" },
      answer: { type: AnswerType.POINT, tolerance: 15 }
    })
    expect(promptOf(q)).toBe(FLAG_POINT_PROMPT)
    if (monaco.answer.type !== AnswerType.POINT) throw new Error("Monaco is asked as a point")
    const { at } = monaco.answer
    const cell = latLngToCell(at.lat, at.lon, resolutionForTolerance(q.answer.tolerance))
    expect(g.setPaint(tokA, { cells: { [cell]: 1 }, floor: 0.05 }).ok).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(reveal.label).toBe("Monaco")
    expect(reveal.question.clue).toEqual({ type: ClueType.FLAG, flag: "mc" })
    expect(reveal.results.find((r) => r.playerId === "p1")!.score).toBeGreaterThan(900)
  })
})

describe("upcoming pictures", () => {
  const photos = [landmark("one", "One.jpg"), landmark("two", "Two.jpg"), landmark("three", "Three.jpg")]
  const mix = mixOf({ [QuestionType.LANDMARK]: 2 })
  const imageOf = (g: Game, at: number) => {
    const clue = g.view(tokA, at).round?.question.clue
    return clue?.type === ClueType.PHOTO ? clue.image : undefined
  }

  it("sends round 1's photo in the lobby, the next round's while one is played, and nothing after the last", () => {
    const g = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    g.join(tokA, playerName("Alice"), T0)
    const first = g.view(tokA, T0).upcoming?.image
    expect(first).toBeDefined()
    g.start(tokA, T0)
    expect(imageOf(g, T0)).toBe(first)
    const second = g.view(tokA, T0).upcoming?.image
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    g.tick(T0 + 60_000 + ROUND_GRACE)
    expect(g.view(tokA, T0 + 61_000).upcoming?.image).toBe(second)
    g.next(tokA, T0 + 62_000)
    expect(imageOf(g, T0 + 62_000)).toBe(second)
    expect(g.view(tokA, T0 + 62_000).upcoming).toBeUndefined()
  })

  it("sends a place-name round's reveal photo with its pictures, and shows it at the reveal", () => {
    const paris = CATALOGUE.find((q) => q.id === "paris")!
    const g = makeGame({
      bank: { catalogue: [paris] },
      config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000 }
    })
    g.join(tokA, playerName("Alice"), T0)
    const photo = g.view(tokA, T0).upcoming?.revealPhoto
    expect(photo).toBeDefined()
    expect(photo).toBe(REVEAL_PHOTOS[paris.place])
    g.start(tokA, T0)
    expect(imageOf(g, T0)).toBeUndefined()
    g.tick(T0 + 60_000 + ROUND_GRACE)
    const view = g.view(tokA, T0 + 61_000)
    expect(view.reveal?.photo).toBe(photo)
    g.next(tokA, T0 + 62_000)
    expect(g.view(tokA, T0 + 62_000).playedRounds?.[0]?.revealPhoto).toBe(photo)
  })

  it("picks the rounds again when the host changes the setup, so round 1's photo is still the one asked", () => {
    const g = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    g.join(tokA, playerName("Alice"), T0)
    g.configure(tokA, { mix: mixOf({ [QuestionType.LANDMARK]: 3 }) })
    const first = g.view(tokA, T0).upcoming?.image
    g.start(tokA, T0)
    expect(imageOf(g, T0)).toBe(first)
  })
})

describe("hints", () => {
  it("gives a band holding the answer, the same one to everyone, one per round and as many as the host allows", () => {
    const g = makeGame({
      config: { mix: mixOf({ [QuestionType.PLACE]: 3 }), hints: 2 }
    })
    g.join(tokA, playerName("Alice"), T0)
    g.join(tokB, playerName("Bob"), T0)
    expect(g.view(tokA, T0).you.hintsLeft).toBe(2)
    expect(g.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no round to hint" })
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: true, changed: true })
    expect(g.hint(tokA, HintAxis.LONGITUDE)).toEqual({ ok: false, error: "one hint per round" })
    expect(g.hint(tokB, HintAxis.LATITUDE).ok).toBe(true)
    const band = g.view(tokA, T0).you.hint!
    expect(band.axis).toBe(HintAxis.LATITUDE)
    expect(inHintBand(band, q.answer.at)).toBe(true)
    expect(g.view(tokB, T0).you.hint).toEqual(band)
    expect(g.view(tokA, T0).you.hintsLeft).toBe(1)

    g.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = g.view(tokA, T0 + 61_000)
    expect(reveal.you.hint).toEqual(band)
    expect(reveal.reveal!.results.map((r) => r.hint)).toEqual([HintAxis.LATITUDE, HintAxis.LATITUDE])

    g.next(tokA, T0 + 62_000)
    expect(g.view(tokA, T0 + 62_000).you.hint).toBeUndefined()
    expect(g.hint(tokA, HintAxis.LONGITUDE).ok).toBe(true)
    g.tick(T0 + 122_000 + ROUND_GRACE)
    g.next(tokA, T0 + 124_000)
    expect(g.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no hints left" })
    expect(g.view(tokA, T0 + 124_000).you.hintsLeft).toBe(0)
  })

  it("lets the host set 0 to 3, and gives spectators none", () => {
    const g = twoPlayerGame()
    expect(g.configure(tokA, { hints: 0 })).toEqual({ ok: true, changed: true })
    expect(g.view(tokA, T0).you.hintsLeft).toBe(0)
    g.join(tokW, playerName("Wes"), T0, true)
    g.configure(tokA, { hints: 3 })
    expect(g.view(tokW, T0).you.hintsLeft).toBe(0)
    g.start(tokA, T0)
    expect(g.hint(tokW, HintAxis.LATITUDE)).toEqual({ ok: false, error: "you are not playing this round" })
  })
})
