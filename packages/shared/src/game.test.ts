import { describe, expect, it } from "vite-plus/test"
import { latLngToCell } from "./h3.ts"
import { Game, ROUND_GRACE_MS, generateCode, nextHostAfter } from "./game.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { PASS_SCORE } from "./scoring.ts"
import { pickQuestions, type Question, type QuestionData } from "./questions.ts"
import { featureFrom, regionCells, type RegionData, regionFrom, type RegionQuestion } from "./regions.ts"
import { type GameConfig, MAX_PLAYERS, MAX_SPECTATORS, type QuestionView, SEAT_GRACE_MS } from "./protocol.ts"
import regionsJson from "../regions.json" with { type: "json" }
import flagsJson from "../flags.json" with { type: "json" }
import featuresJson from "../features.json" with { type: "json" }
import { FLAG_POINT_PROMPT, type FlagData, flagFrom } from "./flags.ts"
import { playerId, playerName, playerToken, questionId, roomCode, type PlayerToken } from "./ids.ts"
import { PLAYER_COLOURS } from "./colours.ts"
import { GameViewSchema } from "./view-schema.ts"
import { inHintBand } from "./hints.ts"

const petra: Question = {
  id: questionId("petra"),
  kind: "text",
  prompt: "Where is Petra?",
  answer: { lat: 30.3285, lon: 35.4444 },
  toleranceKm: 200,
  label: "Petra",
  region: "world"
}
const paris: Question = {
  id: questionId("paris"),
  kind: "text",
  prompt: "Where is Paris?",
  answer: { lat: 48.8566, lon: 2.3522 },
  toleranceKm: 100,
  label: "Paris",
  region: "world"
}
const tokyo: Question = {
  id: questionId("tokyo"),
  kind: "text",
  prompt: "Where is Tokyo?",
  answer: { lat: 35.6762, lon: 139.6503 },
  toleranceKm: 100,
  label: "Tokyo",
  region: "world"
}
const pool = [petra, paris, tokyo]

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
  const layer = new PaintLayer(resolutionForTolerance(q.toleranceKm))
  layer.stamp({ lat, lon }, q.toleranceKm / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

function twoPlayerGame(rounds = 2) {
  // The test pool is place names only.
  const mix = { landmarks: 0, places: rounds, countries: 0, flags: 0, features: 0, states: 0 }
  const g = new Game(CODE, pool, { mix, roundMs: 60_000 }, 42)
  expect(g.join(tokA, playerName("Alice"), T0).ok).toBe(true)
  expect(g.join(tokB, playerName("Bob"), T0 + 1).ok).toBe(true)
  return g
}

/** The question currently being asked, read back through a view. */
function currentQuestion(g: Game, token: PlayerToken, now: number): Question {
  const prompt = g.view(token, now).round!.question.prompt
  return pool.find((q) => q.prompt === prompt)!
}

describe("lobby", () => {
  it("first joiner is host; while the host is away the next player acts as host; a lobby seat left empty is freed", () => {
    const g = twoPlayerGame()
    expect(g.view(tokA, T0).you.isHost).toBe(true)
    expect(g.view(tokB, T0).you.isHost).toBe(false)
    g.disconnect(tokA, T0)
    expect(g.view(tokB, T0).you.isHost).toBe(true)
    expect(g.playerTokens).toEqual([tokA, tokB])
    expect(g.nextWakeAt()).toBe(T0 + SEAT_GRACE_MS)
    expect(g.tick(T0 + SEAT_GRACE_MS - 1)).toBe(false)
    expect(g.tick(T0 + SEAT_GRACE_MS)).toBe(true)
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
    expect(g.tick(T0 + SEAT_GRACE_MS)).toBe(false)
    expect(g.playerTokens).toContain(tokA)
  })

  it("leaving frees the seat at once and passes the host role to the longest-standing online player", () => {
    const g = twoPlayerGame()
    g.join(tokC, playerName("Cara"), T0 + 2)
    g.join(tokD, playerName("Dev"), T0 + 3)
    g.disconnect(tokB, T0 + 4) // Bob is away, so he is passed over
    const before = g.view(tokA, T0 + 4)
    const predicted = nextHostAfter(before.players, before.you.id)
    expect(predicted?.name).toBe("Cara")
    expect(g.leave(tokA)).toEqual({ ok: true, changed: true })
    expect(g.playerTokens).toEqual([tokB, tokC, tokD])
    expect(g.view(tokC, T0 + 5).you.isHost).toBe(true)
    // Nothing waits on a grace period for Alice.
    expect(g.nextWakeAt()).toBe(T0 + 4 + SEAT_GRACE_MS)
    expect(g.leave(tokA)).toEqual({ ok: false, error: "unknown player" })
  })

  it("the last player leaving empties the game; nobody leaves mid-game", () => {
    const g = twoPlayerGame()
    expect(nextHostAfter(g.view(tokB, T0).players, playerId("p1"))?.name).toBe("Bob")
    g.leave(tokB)
    expect(nextHostAfter(g.view(tokA, T0).players, playerId("p1"))).toBeUndefined()
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
    expect(g.phase).toBe("guessing")
  })

  it("caps rounds at the pool size", () => {
    const g = new Game(CODE, pool, { rounds: 10 }, 1)
    g.join(tokH, playerName("H"), T0)
    g.start(tokH, T0)
    expect(g.view(tokH, T0).round!.total).toBe(3)
  })
})

describe("round loop", () => {
  it("scores at the deadline, exact hit beats blank, blank scores as a pass", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.view(tokA, T0).round!.deadline).toBe(T0 + 60_000)

    expect(g.setPaint(tokA, paintAt(q, q.answer.lat, q.answer.lon))).toEqual({ ok: true, changed: false })
    // Bob paints nothing.
    expect(g.tick(T0 + 60_000 + ROUND_GRACE_MS - 1)).toBe(false)
    expect(g.tick(T0 + 60_000 + ROUND_GRACE_MS)).toBe(true)
    expect(g.phase).toBe("reveal")

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
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
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
    g.setPaint(tokA, paintAt(q, q.answer.lat, q.answer.lon))
    g.lock(tokA, T0 + 1)
    g.setPaint(tokB, paintAt(q, 0, 0))
    g.lock(tokB, T0 + 2) // everyone done: the round ends
    expect(g.phase).toBe("reveal")
    const mine = g.view(tokA, T0 + 2).reveal!.results.find((r) => r.playerId === "p1")!
    expect(mine.score).toBeGreaterThan(900)
    expect(g.unlock(tokA)).toEqual({ ok: false, error: "not guessing" })
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
    expect(g.phase).toBe("reveal")
    const mine = g.view(tokA, T0 + 5).reveal!.results.find((r) => r.playerId === "p1")!
    expect(mine.paint).toBeUndefined()
    expect(mine.score).toBe(250)
  })

  it("the round ends as soon as every active connected player has locked in", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.join(tokC, playerName("Cara"), T0 + 5) // spectating: must not hold the round up
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.setPaint(tokB, paintAt(q, 1, 1))
    g.lock(tokA, T0 + 10)
    expect(g.phase).toBe("guessing")
    g.lock(tokB, T0 + 20)
    expect(g.phase).toBe("reveal")
    expect(g.view(tokA, T0 + 20).reveal!.results).toHaveLength(2)
  })

  it("a dropped player does not hold up a round the others have locked", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0 + 10)
    expect(g.phase).toBe("guessing")
    g.disconnect(tokB, T0 + 20)
    expect(g.phase).toBe("reveal")
    // Bob still gets scored (blank) and keeps his seat.
    expect(g.view(tokA, T0 + 20).reveal!.results).toHaveLength(2)
    expect(g.playerTokens).toContain(tokB)
  })

  it("the reveal advances when everyone is ready, or when the host says so; ends in results", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    expect(g.nextWakeAt()).toBeUndefined()
    expect(g.next(tokB, T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" })
    expect(g.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: true })
    expect(g.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: false })
    expect(g.phase).toBe("reveal")
    expect(g.view(tokA, T0 + 61_000).reveal!.ready).toEqual(["p2"])
    expect(g.ready(tokA, T0 + 62_000).ok).toBe(true)
    expect(g.phase).toBe("guessing")
    expect(g.view(tokA, T0 + 62_000).round!.index).toBe(1)
    expect(g.nextWakeAt()).toBe(T0 + 122_000 + ROUND_GRACE_MS)
    g.tick(T0 + 122_000 + ROUND_GRACE_MS)
    expect(g.phase).toBe("reveal")
    expect(g.view(tokA, T0 + 122_000).reveal!.ready).toEqual([])
    expect(g.ready(tokA, T0 + 123_000)).toEqual({ ok: true, changed: true })
    // The host need not wait for Bob.
    expect(g.next(tokA, T0 + 124_000).ok).toBe(true)
    expect(g.phase).toBe("results")
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
    expect(g.phase).toBe("results")
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
    g.setPaint(tokA, paintAt(q, q.answer.lat, q.answer.lon))
    g.setPaint(tokA, { cells: {}, floor: 0.05 })
    // Bob's last stroke, sent at zero, lands within the grace period.
    expect(g.tick(T0 + 60_000)).toBe(false)
    g.setPaint(tokB, paintAt(q, q.answer.lat, q.answer.lon))
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const results = g.view(tokA, T0 + 61_000).reveal!.results
    const alice = results.find((r) => r.playerId === "p1")!
    expect(alice.score).toBe(PASS_SCORE.score)
    expect(alice.paint).toBeUndefined()
    expect(results.find((r) => r.playerId === "p2")!.score).toBeGreaterThan(900)
  })

  it("asks each question at most once per game", () => {
    const g = twoPlayerGame(3)
    g.start(tokA, T0)
    const seen = new Set<string>()
    let now = T0
    for (let i = 0; i < 3; i++) {
      seen.add(g.view(tokA, now).round!.question.prompt)
      now += 60_000 + ROUND_GRACE_MS
      g.tick(now)
      g.next(tokA, now)
    }
    expect(seen.size).toBe(3)
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
    expect(g.join(tokLate, playerName("Late"), T0)).toEqual({ ok: false, error: "game is full" })
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
    expect(g.phase).toBe("reveal")
    const reveal = g.view(tokS, T0 + 2).reveal!
    expect(reveal.results.map((r) => r.playerId).sort()).toEqual(["p1", "p2"])
    expect(g.ready(tokS, T0 + 3)).toEqual({ ok: false, error: "you are watching" })
    g.ready(tokA, T0 + 3)
    g.ready(tokB, T0 + 4)
    expect(g.phase).toBe("guessing")
    g.tick(T1 + 10_000 + ROUND_GRACE_MS)
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
    expect(v.you).toMatchObject({ watching: false, spectating: true })
    expect(sam(g).colour).toBeGreaterThanOrEqual(0)
    expect(g.lock(tokS, T0 + 1)).toEqual({ ok: false, error: "spectating this round" })
    // Alice and Bob finishing still ends the round without Sam.
    g.lock(tokA, T0 + 2)
    g.lock(tokB, T0 + 3)
    expect(g.phase).toBe("reveal")
    // Sam is a player now, so the reveal waits for his Ready too.
    g.ready(tokA, T0 + 4)
    g.ready(tokB, T0 + 5)
    expect(g.phase).toBe("reveal")
    g.ready(tokS, T0 + 6)
    expect(g.phase).toBe("guessing")
    expect(g.view(tokS, T0 + 6).you.spectating).toBe(false)
    g.tick(T0 + 6 + 60_000 + ROUND_GRACE_MS)
    g.next(tokA, T0 + 6 + 60_000)
    const standing = g.view(tokS, T0 + 6 + 60_000).results!.find((r) => r.playerId === sam(g).id)!
    expect(standing.rounds).toEqual([{}, { score: 250 }])
  })

  it("taking a seat at the reveal means playing from the next round", () => {
    const g = withSpectator()
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    expect(g.phase).toBe("reveal")
    g.setRole(tokS, false)
    g.ready(tokA, T0 + 60_001)
    g.ready(tokB, T0 + 60_002)
    g.ready(tokS, T0 + 60_003)
    expect(g.view(tokS, T0 + 60_003).you.spectating).toBe(false)
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
    const h = new Game(roomCode("WXYZ"), pool, {}, 1)
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
    expect(g.view(tokC, T0 + 5).you.spectating).toBe(true)
    const q = currentQuestion(g, tokA, T0)
    expect(g.setPaint(tokC, paintAt(q, 0, 0))).toEqual({ ok: false, error: "spectating this round" })
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    expect(g.view(tokC, T0 + 60_000).reveal!.results.map((r) => r.playerId)).not.toContain("p3")
    g.next(tokA, T0 + 60_001)
    expect(g.view(tokC, T0 + 60_001).you.spectating).toBe(false)
    const q2 = currentQuestion(g, tokC, T0 + 60_001)
    expect(g.setPaint(tokC, paintAt(q2, 0, 0)).ok).toBe(true)
  })

  it("a late joiner's total counts the rounds they played", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.join(tokC, playerName("Cara"), T0 + 5)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    g.next(tokA, T0 + 60_001)
    g.tick(T0 + 120_001 + ROUND_GRACE_MS)
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
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    expect(g.view(tokA, T0 + 60_000).you.paint).toBeUndefined()
  })

  it("a disconnected player keeps their seat and score, and reclaims it by token", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
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
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
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
    g.tick(T0 + 1 + SEAT_GRACE_MS)
    g.join(tokA, playerName("Alice"), T0 + 1 + SEAT_GRACE_MS + 5)
    expect(g.view(tokA, T0 + SEAT_GRACE_MS + 6).you.isHost).toBe(false)
    expect(g.view(tokB, T0 + SEAT_GRACE_MS + 6).you.isHost).toBe(true)
  })

  it("play again returns to the lobby with scores reset and dropped players pruned", () => {
    const g = twoPlayerGame(1)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    g.next(tokA, T0 + 80_000)
    expect(g.phase).toBe("results")
    expect(g.join(tokZ, playerName("Zed"), T0 + 80_001)).toEqual({ ok: false, error: "game has finished" })
    g.disconnect(tokB, T0 + 80_002)
    expect(g.again(tokA, T0 + 81_000).ok).toBe(true)
    expect(g.phase).toBe("lobby")
    expect(g.playerTokens).toEqual([tokA])
    expect(g.view(tokA, T0 + 81_000).players[0]!.score).toBe(0)
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
    g.setPaint(tokA, paintAt(q, q.answer.lat, q.answer.lon))
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const v = g.view(tokA, T0 + 60_000)
    const a = v.players.find((p) => p.id === "p1")!
    const b = v.players.find((p) => p.id === "p2")!
    expect(a.rank).toBe(1)
    expect(b.rank).toBe(2)
    expect(a.previousRank).toBe(1)
    expect(b.previousRank).toBe(1)
  })
})

describe("generateCode", () => {
  it("uses the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
  })
})

describe("ready-up edge cases", () => {
  it("a player leaving during the reveal does not hold the others up", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    g.ready(tokA, T0 + 61_000)
    expect(g.phase).toBe("reveal")
    g.disconnect(tokB, T0 + 62_000)
    expect(g.phase).toBe("guessing")
  })

  it("nobody left connected means nothing advances", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    g.disconnect(tokA, T0 + 61_000)
    g.disconnect(tokB, T0 + 61_001)
    expect(g.phase).toBe("reveal")
  })

  it("ready is only meaningful during the reveal, and resets each round", () => {
    const g = twoPlayerGame(2)
    g.start(tokA, T0)
    expect(g.ready(tokA, T0)).toEqual({ ok: false, error: "nothing to be ready for" })
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    g.ready(tokA, T0 + 61_000)
    g.ready(tokB, T0 + 61_000)
    g.tick(T0 + 121_000 + ROUND_GRACE_MS)
    expect(g.view(tokA, T0 + 121_000).reveal!.ready).toEqual([])
  })
})

describe("configure", () => {
  const mix = (landmarks: number, places: number, countries = 0, flags = 0, features = 0, states = 0) => ({
    landmarks,
    places,
    countries,
    flags,
    features,
    states
  })

  it("lets the host change the mix, and so the rounds, and round length in the lobby only", () => {
    const g = twoPlayerGame()
    expect(g.configure(tokB, { mix: mix(0, 3) })).toEqual({ ok: false, error: "only the host can change settings" })
    expect(g.configure(tokA, { mix: mix(0, 3) })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mix: mix(0, 3) })).toEqual({ ok: true, changed: false })
    expect(g.configure(tokA, { roundMs: 30_000 }).ok).toBe(true)
    const v = g.view(tokB, T0)
    expect(v.config.rounds).toBe(3)
    expect(v.config.roundMs).toBe(30_000)
    g.start(tokA, T0)
    expect(g.view(tokA, T0).round!.total).toBe(3)
    expect(g.view(tokA, T0).round!.deadline).toBe(T0 + 30_000)
    expect(g.configure(tokA, { mix: mix(0, 5) })).toEqual({
      ok: false,
      error: "settings are locked once the game starts"
    })
  })

  it("the question mix reaches the picker", () => {
    const photo: Question = {
      ...petra,
      id: questionId("petra-photo"),
      kind: "photo",
      prompt: "Where is this?",
      image: "Petra.jpg"
    }
    const g = new Game(CODE, [...pool, photo], { mix: mix(0, 1) }, 42)
    g.join(tokA, playerName("Alice"), T0)
    expect(g.configure(tokA, { mix: mix(1, 0) })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mix: mix(1, 0) })).toEqual({ ok: true, changed: false })
    expect(g.view(tokA, T0).config.mix).toEqual(mix(1, 0))
    g.start(tokA, T0)
    // One round, all photos: it must be the one photo question in the pool.
    expect(g.view(tokA, T0).round!.question.image).toBe("Petra.jpg")
  })

  it("starts on minimal map detail and lets the host change it in the lobby", () => {
    const g = twoPlayerGame(1)
    expect(g.view(tokB, T0).config.mapDetail).toBe("minimal")
    expect(g.configure(tokB, { mapDetail: "water" }).ok).toBe(false)
    expect(g.configure(tokA, { mapDetail: "physical" })).toEqual({ ok: true, changed: true })
    expect(g.configure(tokA, { mapDetail: "physical" })).toEqual({ ok: true, changed: false })
    expect(g.view(tokB, T0).config.mapDetail).toBe("physical")
    g.start(tokA, T0)
    expect(g.configure(tokA, { mapDetail: "political" }).ok).toBe(false)
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
    g.setPaint(tokB, paintAt(q, q.answer.lat, q.answer.lon))
    const bobId = g.view(tokB, T0).you.id!
    expect(g.kick(tokB, g.view(tokA, T0).you.id!, T0)).toEqual({
      ok: false,
      error: "only the host can remove players"
    })
    expect(g.kick(tokA, g.view(tokA, T0).you.id!, T0)).toEqual({ ok: false, error: "you cannot remove yourself" })
    expect(g.kick(tokA, playerId("p99"), T0)).toEqual({ ok: false, error: "unknown player" })
    expect(g.kick(tokA, bobId, T0).ok).toBe(true)
    expect(g.playerTokens).toEqual([tokA])
    expect(g.join(tokB, playerName("Bob again"), T0)).toEqual({ ok: false, error: "removed by the host" })
    expect(g.join(tokC, playerName("Carol"), T0).ok).toBe(true)
    // Bob's paint must not surface when the round ends.
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    expect(g.phase).toBe("reveal")
    expect(g.view(tokA, T0).reveal!.results.map((r) => r.playerId)).not.toContain(bobId)
  })

  it("removing the last unlocked player ends the round; removing an absent host passes the role", () => {
    const g = twoPlayerGame()
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    g.setPaint(tokA, paintAt(q, 0, 0))
    g.lock(tokA, T0)
    expect(g.phase).toBe("guessing")
    g.kick(tokA, g.view(tokB, T0).you.id!, T0)
    expect(g.phase).toBe("reveal")

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
    g.setPaint(tokA, paintAt(q, q.answer.lat, q.answer.lon))
    expect(g.end(tokB)).toEqual({ ok: false, error: "only the host can end the game" })
    expect(g.end(tokA).ok).toBe(true)
    expect(g.phase).toBe("results")
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
    expect(g.phase).toBe("reveal")
    expect(g.end(tokA).ok).toBe(true)
    expect(g.phase).toBe("results")
  })
})

describe("the question mix", () => {
  const REGIONS = (regionsJson as RegionData[]).map(regionFrom)
  const FLAGS = (flagsJson as FlagData[]).map(flagFrom)
  const FEATURES = (featuresJson as (QuestionData | RegionData)[]).map(featureFrom)
  const germany = REGIONS.find((q) => q.id === "germany-region")!
  const mix = (landmarks: number, places: number, countries = 0, flags = 0, features = 0, states = 0) => ({
    landmarks,
    places,
    countries,
    flags,
    features,
    states
  })

  function game(config: Partial<GameConfig>, regions = REGIONS, flags = FLAGS, features = FEATURES) {
    const g = new Game(CODE, pool, { roundMs: 60_000, ...config }, 42, regions, flags, features)
    g.join(tokA, playerName("Alice"), T0)
    g.join(tokB, playerName("Bob"), T0 + 1)
    return g
  }

  /** Play every round through, passing, and collect each round's question. */
  function questions(g: Game): QuestionView[] {
    g.start(tokA, T0)
    const seen: QuestionView[] = []
    let now = T0
    while (g.phase !== "results") {
      seen.push(g.view(tokA, now).round!.question)
      now += 60_000 + ROUND_GRACE_MS
      g.tick(now)
      g.next(tokA, now)
    }
    return seen
  }

  it("defaults to 2 of each kind; a length alone is an even mix of that length", () => {
    expect(new Game(CODE, pool, {}, 42).config.mix).toEqual(mix(2, 2, 2, 2))
    const g = new Game(CODE, pool, { rounds: 5 }, 42)
    expect(g.config.mix).toEqual(mix(2, 1, 1, 1))
    expect(g.config.rounds).toBe(5)
  })

  it("with only landmarks and place names, a game asks what pickQuestions picks", () => {
    const seen = questions(game({ mix: mix(0, 3) })).map((q) => q.prompt)
    expect(seen.sort()).toEqual(
      pickQuestions(pool, 3, 42, 0)
        .map((q) => q.prompt)
        .sort()
    )
  })

  it("asks as many of each kind as the mix says, never a country twice", () => {
    const seen = questions(game({ mix: mix(0, 3, 4, 5) }))
    const flags = seen.filter((q) => q.flag)
    const countries = seen.filter((q) => q.regionId && !q.flag)
    expect(flags).toHaveLength(5)
    expect(countries).toHaveLength(4)
    expect(countries.every((q) => q.prompt.startsWith("Paint the whole of"))).toBe(true)
    expect(seen).toHaveLength(12)
    const regionIds = seen.flatMap((q) => (q.regionId ? [q.regionId] : []))
    expect(new Set(regionIds).size).toBe(regionIds.length)
    // Without the countries on hand (a test pool, say), there are only the places.
    expect(questions(game({ mix: mix(0, 3, 3) }, [], []))).toHaveLength(3)
  })

  it("asks islands, lakes and seas, and US states, as many as the mix says", () => {
    const seen = questions(game({ mix: mix(0, 0, 0, 0, 6, 7), mapDetail: "water" }))
    expect(seen).toHaveLength(13)
    const topics = seen.map((q) => q.topic)
    expect(topics.filter((t) => t === "state")).toHaveLength(7)
    expect(topics.filter((t) => t === "island" || t === "lake" || t === "sea")).toHaveLength(6)
    expect(new Set(seen.map((q) => q.prompt)).size).toBe(13)
  })

  it("sends every player and spectator views that match GameViewSchema, through every kind of round", () => {
    const g = game({ mix: mix(1, 1, 1, 1, 1, 1), mapDetail: "water" })
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
    while (g.phase !== "results") {
      const q = g.view(tokA, now).round!.question
      const layer = new PaintLayer(resolutionForTolerance(q.toleranceKm))
      layer.stamp({ lat: 10, lon: 10 }, q.toleranceKm, 1)
      g.setPaint(tokA, { cells: layer.toRecord(), floor: 0.05 })
      g.lock(tokB, now)
      check()
      now += 60_000 + ROUND_GRACE_MS
      g.tick(now)
      check()
      g.next(tokA, now)
    }
    check()
    expect(g.view(tokA, now).awards!.length).toBeGreaterThan(0)
  })

  it("asks a lake only when the map shows lakes", () => {
    const lake = FEATURES.find((q) => q.topic === "lake")!
    const island = FEATURES.find((q) => q.topic === "island")!
    const asked = (mapDetail: GameConfig["mapDetail"]) =>
      questions(game({ mix: mix(0, 0, 0, 0, 2), mapDetail }, REGIONS, FLAGS, [lake, island])).map((q) => q.topic)
    expect(asked("minimal")).toEqual(["island"])
    expect(asked("water").sort()).toEqual(["island", "lake"])
  })

  it("scores an island against its outline, as a country", () => {
    const borneo = FEATURES.find((q): q is RegionQuestion => q.id === "island-borneo")!
    const g = game({ mix: mix(0, 0, 0, 0, 1) }, REGIONS, FLAGS, [borneo])
    g.start(tokA, T0)
    const q = g.view(tokA, T0).round!.question
    expect(q).toMatchObject({ prompt: "Paint the whole of Borneo", regionId: "island-borneo", topic: "island" })
    const cells = Object.fromEntries(regionCells(borneo, resolutionForTolerance(q.toleranceKm)).map((h) => [h, 1]))
    expect(g.setPaint(tokA, { cells, floor: 0.05 }).ok).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(reveal.label).toBe("Borneo")
    expect(reveal.results.find((r) => r.playerId === "p1")!.score).toBeGreaterThan(985)
  })

  it("does not ask a place's country again as a flag", () => {
    const monacoPlace: Question = { ...petra, id: questionId("monaco"), label: "Monaco", prompt: "Where is Monaco?" }
    const monacoFlag = FLAGS.find((f) => f.flag === "mc")!
    const g = new Game(CODE, [monacoPlace], { mix: mix(0, 1, 0, 1) }, 42, REGIONS, [monacoFlag])
    g.join(tokA, playerName("Alice"), T0)
    expect(questions(g).map((q) => q.prompt)).toEqual(["Where is Monaco?"])
  })

  it("scores a country round against the outline; a pass still scores 250", () => {
    const g = game({ mix: mix(0, 0, 1) }, [germany])
    g.start(tokA, T0)
    const q = g.view(tokA, T0).round!.question
    expect(q.regionId).toBe("germany-region")
    expect(JSON.stringify(g.view(tokA, T0).round)).not.toContain("outline")
    const res = resolutionForTolerance(q.toleranceKm)
    const cells = Object.fromEntries(regionCells(germany, res).map((h) => [h, 1]))
    expect(g.setPaint(tokA, { cells, floor: 0.05 }).ok).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(reveal.question.regionId).toBe("germany-region")
    expect(reveal.label).toBe("Germany")
    const alice = reveal.results.find((r) => r.playerId === "p1")!
    expect(alice.score).toBeGreaterThan(985)
    expect(alice.region!.coverage).toBeGreaterThan(0.95)
    expect(alice.region!.precision).toBeGreaterThan(0.95)
    const bob = reveal.results.find((r) => r.playerId === "p2")!
    expect(bob.score).toBe(PASS_SCORE.score)
    expect(bob.region).toBeUndefined()
  })

  it("flag rounds show a flag, never the name, and say whether to paint the country or a point", () => {
    const seen = questions(game({ mix: mix(0, 0, 0, 15) }))
    expect(seen.every((q) => q.flag)).toBe(true)
    expect(new Set(seen.map((q) => q.flag)).size).toBe(15)
    for (const q of seen) {
      const f = FLAGS.find((x) => x.flag === q.flag)!
      expect(q.regionId).toBe(f.regionId)
      expect(q.prompt).not.toContain(f.label)
      if (!f.regionId) expect(q.prompt).toBe(FLAG_POINT_PROMPT)
    }
  })

  it("scores a small country's flag as a point and reveals its name", () => {
    const monaco = FLAGS.find((f) => f.flag === "mc")!
    const g = game({ mix: mix(0, 0, 0, 1) }, REGIONS, [monaco])
    g.start(tokA, T0)
    const q = g.view(tokA, T0).round!.question
    expect(q).toEqual({ prompt: FLAG_POINT_PROMPT, toleranceKm: 15, flag: "mc" })
    const res = resolutionForTolerance(q.toleranceKm)
    const cell = latLngToCell(monaco.answer.lat, monaco.answer.lon, res)
    expect(g.setPaint(tokA, { cells: { [cell]: 1 }, floor: 0.05 }).ok).toBe(true)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const reveal = g.view(tokB, T0 + 60_000).reveal!
    expect(reveal.label).toBe("Monaco")
    expect(reveal.question.flag).toBe("mc")
    expect(reveal.results.find((r) => r.playerId === "p1")!.score).toBeGreaterThan(900)
  })
})

describe("upcoming pictures", () => {
  const photo = (id: string, image: string): Question => ({
    ...petra,
    id: questionId(id),
    kind: "photo",
    prompt: "Where is this?",
    label: id,
    image
  })
  const photos = [photo("one", "One.jpg"), photo("two", "Two.jpg"), photo("three", "Three.jpg")]
  const mix = { landmarks: 2, places: 0, countries: 0, flags: 0, features: 0, states: 0 }
  const imageOf = (g: Game, at: number) => g.view(tokA, at).round?.question.image

  it("sends round 1's photo in the lobby, the next round's while one is played, and nothing after the last", () => {
    const g = new Game(CODE, photos, { mix, roundMs: 60_000 }, 7)
    g.join(tokA, playerName("Alice"), T0)
    const first = g.view(tokA, T0).upcoming?.image
    expect(first).toBeDefined()
    g.start(tokA, T0)
    expect(imageOf(g, T0)).toBe(first)
    const second = g.view(tokA, T0).upcoming?.image
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    expect(g.view(tokA, T0 + 61_000).upcoming?.image).toBe(second)
    g.next(tokA, T0 + 62_000)
    expect(imageOf(g, T0 + 62_000)).toBe(second)
    expect(g.view(tokA, T0 + 62_000).upcoming).toBeUndefined()
  })

  it("picks the rounds again when the host changes the setup, so round 1's photo is still the one asked", () => {
    const g = new Game(CODE, photos, { mix, roundMs: 60_000 }, 7)
    g.join(tokA, playerName("Alice"), T0)
    g.configure(tokA, { mix: { ...mix, landmarks: 3 } })
    const first = g.view(tokA, T0).upcoming?.image
    g.start(tokA, T0)
    expect(imageOf(g, T0)).toBe(first)
  })
})

describe("hints", () => {
  it("gives a band holding the answer, the same one to everyone, one per round and as many as the host allows", () => {
    const g = new Game(
      CODE,
      pool,
      { mix: { landmarks: 0, places: 3, countries: 0, flags: 0, features: 0, states: 0 }, hints: 2 },
      42
    )
    g.join(tokA, playerName("Alice"), T0)
    g.join(tokB, playerName("Bob"), T0)
    expect(g.view(tokA, T0).you.hintsLeft).toBe(2)
    expect(g.hint(tokA, "latitude")).toEqual({ ok: false, error: "no round to hint" })
    g.start(tokA, T0)
    const q = currentQuestion(g, tokA, T0)
    expect(g.hint(tokA, "latitude")).toEqual({ ok: true, changed: true })
    expect(g.hint(tokA, "longitude")).toEqual({ ok: false, error: "one hint per round" })
    expect(g.hint(tokB, "latitude").ok).toBe(true)
    const band = g.view(tokA, T0).you.hint!
    expect(band.axis).toBe("latitude")
    expect(inHintBand(band, q.answer)).toBe(true)
    expect(g.view(tokB, T0).you.hint).toEqual(band)
    expect(g.view(tokA, T0).you.hintsLeft).toBe(1)

    g.tick(T0 + 60_000 + ROUND_GRACE_MS)
    const reveal = g.view(tokA, T0 + 61_000)
    expect(reveal.you.hint).toEqual(band)
    expect(reveal.reveal!.results.map((r) => r.hint)).toEqual(["latitude", "latitude"])

    g.next(tokA, T0 + 62_000)
    expect(g.view(tokA, T0 + 62_000).you.hint).toBeUndefined()
    expect(g.hint(tokA, "longitude").ok).toBe(true)
    g.tick(T0 + 122_000 + ROUND_GRACE_MS)
    g.next(tokA, T0 + 124_000)
    expect(g.hint(tokA, "latitude")).toEqual({ ok: false, error: "no hints left" })
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
    expect(g.hint(tokW, "latitude")).toEqual({ ok: false, error: "you are not playing this round" })
  })
})
