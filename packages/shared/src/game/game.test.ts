import { describe, expect, it } from "vite-plus/test"
import { latLngToCell } from "../h3.ts"
import { Game, ROUND_GRACE } from "./game.ts"
import { viewIn } from "./view-in.ts"
import type { QuestionBank } from "./round-picking.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import { PASS_SCORE } from "../scoring/scoring.ts"
import {
  AnswerType,
  ClueType,
  FLAG_POINT_PROMPT,
  QuestionType,
  promptOf,
  type LandmarkQuestion,
  type PlaceQuestion,
  type Question
} from "../questions.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { REVEAL_PHOTOS } from "../catalogue/photos.ts"
import { regionCells, scoredAnswer, type Area } from "../scoring/regions.ts"
import {
  type ConfigurePatch,
  type GameConfig,
  type GameView,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  type QuestionView,
  SEAT_GRACE,
  mixOf,
  mixTotal,
  MapDetail,
  Phase,
  RoundGuessType
} from "../protocol.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }
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
} from "../ids.ts"
import type { LatLon } from "../geo.ts"
import { PLAYER_COLOURS } from "../colours.ts"
import { GameViewSchema } from "../view-schema.ts"
import { inHintBand, HintAxis } from "../hints.ts"
import { CloseReason } from "../close-reason.ts"
import { Role, YouRoleType, everyone } from "../roles.ts"
import type { Seat } from "./seats.ts"

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
/** A seated token's view. */
function viewOf(game: Game, token: PlayerToken, now: number): GameView {
  const view = game.view(token, now)
  if (!view) throw new Error("expected a view, got none")
  return view
}

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

function paintAt(question: Question, lat: number, lon: number) {
  const layer = new PaintLayer(resolutionForTolerance(question.answer.tolerance))
  layer.stamp({ lat, lon }, question.answer.tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

/** Paint on a place's answer. */
const paintOn = (question: PlaceQuestion) => paintAt(question, question.answer.at.lat, question.answer.at.lon)

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
  const game = makeGame({ config: { mix, roundLength: 60_000 } })
  expect(game.join(tokA, playerName("Alice"), T0).ok).toBe(true)
  expect(game.join(tokB, playerName("Bob"), T0 + 1).ok).toBe(true)
  return game
}

/** The question currently being asked, read back through a view. */
function currentQuestion(game: Game, token: PlayerToken, now: number): PlaceQuestion {
  const prompt = promptOf(viewIn(viewOf(game, token, now), Phase.GUESSING).round.question)
  return pool.find((question) => question.clue.prompt === prompt)!
}

describe("lobby", () => {
  it("first joiner is host; while the host is away the next player acts as host; a lobby seat left empty is freed", () => {
    const game = twoPlayerGame()
    expect(viewOf(game, tokA, T0).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0).you.isHost).toBe(false)
    game.disconnect(tokA, T0)
    expect(viewOf(game, tokB, T0).you.isHost).toBe(true)
    expect(game.playerTokens).toEqual([tokA, tokB])
    expect(game.nextWakeAt()).toBe(T0 + SEAT_GRACE)
    expect(game.tick(T0 + SEAT_GRACE - 1)).toBe(false)
    expect(game.tick(T0 + SEAT_GRACE)).toBe(true)
    expect(game.playerTokens).toEqual([tokB])
    expect(game.nextWakeAt()).toBeUndefined()
  })

  it("a refresh in the lobby keeps the seat, colour and host role", () => {
    const game = twoPlayerGame()
    const before = viewOf(game, tokA, T0).players.find((player) => player.name === "Alice")!
    game.disconnect(tokA, T0)
    game.join(tokA, playerName("Alice"), T0 + 2_000)
    const after = viewOf(game, tokA, T0 + 2_000).players.find((player) => player.name === "Alice")!
    expect(after).toMatchObject({ id: before.id, colour: before.colour, connected: true, isHost: true })
    expect(viewOf(game, tokB, T0 + 2_000).you.isHost).toBe(false)
    // Back in time, so nothing is left to free.
    expect(game.nextWakeAt()).toBeUndefined()
    expect(game.tick(T0 + SEAT_GRACE)).toBe(false)
    expect(game.playerTokens).toContain(tokA)
  })

  it("leaving frees the seat at once and passes the host role to the longest-standing online player", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0 + 2)
    game.join(tokD, playerName("Dev"), T0 + 3)
    game.disconnect(tokB, T0 + 4) // Bob is away, so he is passed over
    const cara = viewOf(game, tokC, T0 + 4).you.id
    expect(viewOf(game, tokA, T0 + 4).you.nextHost).toBe(cara)
    expect(viewOf(game, tokC, T0 + 4).you.nextHost).toBeUndefined()
    expect(game.leave(tokA)).toEqual({ ok: true, changed: true })
    expect(game.playerTokens).toEqual([tokB, tokC, tokD])
    expect(viewOf(game, tokC, T0 + 5).you.isHost).toBe(true)
    // Nothing waits on a grace period for Alice.
    expect(game.nextWakeAt()).toBe(T0 + 4 + SEAT_GRACE)
    expect(game.leave(tokA)).toEqual({ ok: false, error: "unknown player" })
  })

  it("the last player leaving empties the game; nobody leaves mid-game", () => {
    const game = twoPlayerGame()
    expect(viewOf(game, tokA, T0).you.nextHost).toBe(viewOf(game, tokB, T0).you.id)
    game.leave(tokB)
    expect(viewOf(game, tokA, T0).you.nextHost).toBeUndefined()
    game.leave(tokA)
    expect(game.playerCount).toBe(0)

    const otherGame = twoPlayerGame()
    otherGame.start(tokA, T0)
    expect(otherGame.leave(tokB)).toEqual({ ok: false, error: "you can only leave from the lobby" })
  })

  it("the host can hand the role to another connected player, for good", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0)
    const id = (name: string) => viewOf(game, tokA, T0).players.find((player) => player.name === name)!.id
    expect(game.makeHost(tokB, id("Cara"))).toEqual({ ok: false, error: "only the host can hand over" })
    expect(game.makeHost(tokA, id("Alice"))).toEqual({ ok: false, error: "you are already the host" })
    expect(game.makeHost(tokA, playerId("p99"))).toEqual({ ok: false, error: "unknown player" })
    game.disconnect(tokC, T0)
    expect(game.makeHost(tokA, id("Cara"))).toEqual({ ok: false, error: "that player is offline" })
    expect(game.makeHost(tokA, id("Bob"))).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokB, T0).you.isHost).toBe(true)
    expect(viewOf(game, tokA, T0).you.isHost).toBe(false)
    // Alice leaving and coming back does not bring the role with her.
    game.disconnect(tokA, T0 + 1)
    game.join(tokA, playerName("Alice"), T0 + 2)
    expect(viewOf(game, tokA, T0 + 2).you.isHost).toBe(false)
  })

  it("an acting host can hand over too, and the absent host does not get it back", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0 + 2)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    const cara = viewOf(game, tokB, T0 + 1).players.find((player) => player.name === "Cara")!
    expect(game.makeHost(tokB, cara.id).ok).toBe(true)
    game.join(tokA, playerName("Alice"), T0 + 5)
    expect(viewOf(game, tokC, T0 + 5).you.isHost).toBe(true)
    expect(viewOf(game, tokA, T0 + 5).you.isHost).toBe(false)
  })

  it("only the host can start", () => {
    const game = twoPlayerGame()
    expect(game.start(tokB, T0)).toEqual({ ok: false, error: "only the host can start" })
    expect(game.start(tokA, T0).ok).toBe(true)
    expect(game.phase).toBe(Phase.GUESSING)
  })
})

describe("round loop", () => {
  describe("at the deadline", () => {
    function revealedAfterDeadline() {
      const game = twoPlayerGame(1)
      game.start(tokA, T0)
      const question = currentQuestion(game, tokA, T0)
      // Alice paints on the answer; Bob paints nothing.
      expect(game.setPaint(tokA, paintOn(question))).toEqual({ ok: true, changed: false })
      game.tick(T0 + 60_000 + ROUND_GRACE)
      return { game, question, reveal: viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal }
    }

    it("the round runs for its length, then a grace, and then goes to the reveal", () => {
      const game = twoPlayerGame(1)
      game.start(tokA, T0)
      expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.deadline).toBe(T0 + 60_000)
      expect(game.tick(T0 + 60_000 + ROUND_GRACE - 1)).toBe(false)
      expect(game.tick(T0 + 60_000 + ROUND_GRACE)).toBe(true)
      expect(game.phase).toBe(Phase.REVEAL)
      expect(game.nextWakeAt()).toBeUndefined()
    })

    it("an exact hit scores high and is listed first", () => {
      const { reveal } = revealedAfterDeadline()
      const [first] = reveal.results
      expect(first!.playerId).toBe("p1")
      expect(first!.score).toBeGreaterThan(900)
    })

    it("a blank guess scores as a pass", () => {
      const { reveal } = revealedAfterDeadline()
      const second = reveal.results[1]
      expect(second!.guess.type).toBe(RoundGuessType.PASSED)
      expect(second!.score).toBe(PASS_SCORE.score)
    })

    it("the reveal names the answer and lists every player, none yet ready", () => {
      const { question, reveal } = revealedAfterDeadline()
      expect(reveal.label).toBe(question.label)
      expect(reveal.wiki).toBe(question.wiki)
      expect(reveal.results).toHaveLength(2)
      expect(reveal.ready).toEqual([])
    })
  })

  it("paint is private during guessing and visible after the reveal", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 10, 10))
    const during = viewOf(game, tokB, T0 + 10)
    expect(during).not.toHaveProperty("reveal")
    expect(JSON.stringify(during)).not.toContain("cells")
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const after = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL)
    expect(after.reveal.results.find((result) => result.playerId === "p1")!.guess.type).toBe(RoundGuessType.PAINTED)
  })

  it("locking freezes paint; late paint is rejected", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    expect(game.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    expect(game.setPaint(tokA, paintAt(question, 1, 1))).toEqual({ ok: true, changed: false }) // stale upload, ignored
  })

  it("unlocking after Done lets the guess change, only while the round runs", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: false }) // not locked: nothing to undo
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
    // The new guess replaces the old one and is what gets scored.
    game.setPaint(tokA, paintOn(question))
    game.lock(tokA, T0 + 1)
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokB, T0 + 2) // everyone done: the round ends
    expect(game.phase).toBe(Phase.REVEAL)
    const mine = viewIn(viewOf(game, tokA, T0 + 2), Phase.REVEAL).reveal.results.find(
      (result) => result.playerId === "p1"
    )!
    expect(mine.score).toBeGreaterThan(900)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: false }) // too late: ignored
    expect(game.lock(tokA, T0 + 3)).toEqual({ ok: true, changed: false })
  })

  it("locking with nothing painted is a pass: the pass score, no paint, and the round can end early", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    expect(game.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    // Paint arriving after a pass is a stale upload and changes nothing.
    expect(game.setPaint(tokA, paintAt(question, 0, 0))).toEqual({ ok: true, changed: false })
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokB, T0 + 5)
    expect(game.phase).toBe(Phase.REVEAL)
    const mine = viewIn(viewOf(game, tokA, T0 + 5), Phase.REVEAL).reveal.results.find(
      (result) => result.playerId === "p1"
    )!
    expect(mine.guess.type).toBe(RoundGuessType.PASSED)
    expect(mine.score).toBe(250)
  })

  it("the round ends as soon as every active connected player has locked in", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.join(tokC, playerName("Cara"), T0 + 5) // sitting this round out: must not hold it up
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.setPaint(tokB, paintAt(question, 1, 1))
    game.lock(tokA, T0 + 10)
    expect(game.phase).toBe(Phase.GUESSING)
    game.lock(tokB, T0 + 20)
    expect(game.phase).toBe(Phase.REVEAL)
    expect(viewIn(viewOf(game, tokA, T0 + 20), Phase.REVEAL).reveal.results).toHaveLength(2)
  })

  it("a dropped player does not hold up a round the others have locked", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0 + 10)
    expect(game.phase).toBe(Phase.GUESSING)
    game.disconnect(tokB, T0 + 20)
    expect(game.phase).toBe(Phase.REVEAL)
    // Bob still gets scored (blank) and keeps his seat.
    expect(viewIn(viewOf(game, tokA, T0 + 20), Phase.REVEAL).reveal.results).toHaveLength(2)
    expect(game.playerTokens).toContain(tokB)
  })

  describe("the reveal", () => {
    function atFirstReveal() {
      const game = twoPlayerGame(2)
      game.start(tokA, T0)
      game.tick(T0 + 60_000 + ROUND_GRACE)
      return game
    }

    it("has no deadline of its own", () => {
      expect(atFirstReveal().nextWakeAt()).toBeUndefined()
    })

    it("cannot be advanced by a player who is not the host", () => {
      const game = atFirstReveal()
      expect(game.next(tokB, T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" })
    })

    it("shows who is ready, and readying twice changes nothing", () => {
      const game = atFirstReveal()
      expect(game.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: true })
      expect(game.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: false })
      expect(game.phase).toBe(Phase.REVEAL)
      expect(viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).reveal.ready).toEqual(["p2"])
    })

    it("advances to the next round when everyone is ready", () => {
      const game = atFirstReveal()
      game.ready(tokB, T0 + 61_000)
      expect(game.ready(tokA, T0 + 62_000).ok).toBe(true)
      expect(game.phase).toBe(Phase.GUESSING)
      expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).round.index).toBe(1)
      expect(game.nextWakeAt()).toBe(T0 + 122_000 + ROUND_GRACE)
    })

    it("starts the next round's reveal with nobody ready", () => {
      const game = atFirstReveal()
      game.ready(tokB, T0 + 61_000)
      game.ready(tokA, T0 + 62_000)
      game.tick(T0 + 122_000 + ROUND_GRACE)
      expect(game.phase).toBe(Phase.REVEAL)
      expect(viewIn(viewOf(game, tokA, T0 + 122_000), Phase.REVEAL).reveal.ready).toEqual([])
    })

    it("lets the host advance without waiting for the others; after the last round that ends in results", () => {
      const game = atFirstReveal()
      game.next(tokA, T0 + 62_000)
      game.tick(T0 + 122_000 + ROUND_GRACE)
      expect(game.ready(tokA, T0 + 123_000)).toEqual({ ok: true, changed: true })
      expect(game.next(tokA, T0 + 124_000).ok).toBe(true)
      expect(game.phase).toBe(Phase.RESULTS)
      const results = viewIn(viewOf(game, tokA, T0 + 124_000), Phase.RESULTS).results
      expect(results).toHaveLength(2)
      expect(results[0]!.total).toBeGreaterThanOrEqual(results[1]!.total)
      expect(results[0]!.rounds).toHaveLength(2)
    })
  })

  describe("awards", () => {
    function atResults() {
      const game = twoPlayerGame(3)
      game.start(tokA, T0)
      let now = T0
      for (let i = 0; i < 3; i++) {
        // Alice passes straight away; Bob paints one confident dab in the Gulf of Guinea.
        game.lock(tokA, now + 1_000)
        game.setPaint(tokB, paintAt(petra, 0, 0))
        game.lock(tokB, now + 2_000)
        now += 3_000
        game.next(tokA, now)
      }
      return { game, now }
    }

    it("are handed out at the end", () => {
      const { game, now } = atResults()
      expect(game.phase).toBe(Phase.RESULTS)
      const awards = viewIn(viewOf(game, tokA, now), Phase.RESULTS).awards
      expect(awards.length).toBeGreaterThanOrEqual(2)
      expect(awards.find((award) => award.title === "Chicken")?.playerIds).toEqual(["p1"])
      expect(awards.some((award) => award.playerIds.includes(playerId("p2")))).toBe(true)
    })

    it("are cleared for the next game", () => {
      const { game, now } = atResults()
      game.again(tokA, now)
      expect(viewOf(game, tokA, now)).not.toHaveProperty("awards")
    })
  })

  it("paint arriving just after the deadline still counts, and an empty upload takes paint back", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    // Alice painted, then erased it all: the empty upload replaces her paint.
    game.setPaint(tokA, paintOn(question))
    game.setPaint(tokA, { cells: {}, floor: 0.05 })
    // Bob's last stroke, sent at zero, lands within the grace period.
    expect(game.tick(T0 + 60_000)).toBe(false)
    game.setPaint(tokB, paintOn(question))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const results = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).reveal.results
    const alice = results.find((result) => result.playerId === "p1")!
    expect(alice.score).toBe(PASS_SCORE.score)
    expect(alice.guess.type).toBe(RoundGuessType.PASSED)
    expect(results.find((result) => result.playerId === "p2")!.score).toBeGreaterThan(900)
  })
})

describe("player cap", () => {
  function fullGame(): Game {
    const game = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) expect(game.join(tok(`${i}`), playerName(`P${i}`), T0).ok).toBe(true)
    return game
  }

  it("has a colour for every player it allows", () => {
    expect(PLAYER_COLOURS.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it("seats a newcomer to a full game as a spectator, and turns people away once the spectators are full too", () => {
    const game = fullGame()
    expect(viewOf(game, tokA, T0).players).toHaveLength(MAX_PLAYERS)
    for (let i = 1; i <= MAX_SPECTATORS; i++) expect(game.join(tok(`W${i}`), playerName(`W${i}`), T0).ok).toBe(true)
    const w1 = viewOf(game, tokW1, T0)
    expect(w1.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(w1.spectators.find((player) => player.name === "W1")).toMatchObject({ type: Role.SPECTATOR })
    expect(w1.spectators.find((player) => player.name === "W1")).not.toHaveProperty("colour")
    expect(game.join(tokLate, playerName("Late"), T0)).toEqual({ ok: false, reason: CloseReason.FULL })
  })

  it("still lets a player who dropped out back in", () => {
    const game = fullGame()
    game.disconnect(tokB, T0)
    expect(game.join(tokB, playerName("Bob"), T0).ok).toBe(true)
  })

  it("frees the seat and the colour when the host removes someone", () => {
    const game = fullGame()
    const bob = viewOf(game, tokA, T0).players.find((player) => player.name === "Bob")!
    game.kick(tokA, bob.id, T0)
    expect(game.join(tokNew, playerName("Nine"), T0).ok).toBe(true)
    const nine = viewOf(game, tokA, T0).players.find((player) => player.name === "Nine")!
    expect(nine.colour).toBe(bob.colour)
    const colours = viewOf(game, tokA, T0).players.map((player) => player.colour)
    expect(new Set(colours).size).toBe(MAX_PLAYERS)
  })
})

describe("spectators", () => {
  const T1 = T0 + 60_000
  function withSpectator(): Game {
    const game = twoPlayerGame(2)
    expect(game.join(tokS, playerName("Sam"), T0 + 2, Role.SPECTATOR).ok).toBe(true)
    return game
  }
  const sam = (game: Game) => everyone(viewOf(game, tokA, T0)).find((player) => player.name === "Sam")!

  it("joins to watch when asked, listed apart from the players, with no colour, score or rank", () => {
    const game = withSpectator()
    const view = viewOf(game, tokS, T0)
    expect(view.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(view.players.map((player) => player.name)).toEqual(["Alice", "Bob"])
    expect(view.spectators).toEqual([
      { id: sam(game).id, name: "Sam", type: Role.SPECTATOR, connected: true, isHost: false }
    ])
  })

  describe("in a game with players", () => {
    function inRound() {
      const game = withSpectator()
      game.start(tokA, T0)
      return { game, question: currentQuestion(game, tokA, T0) }
    }
    function atReveal() {
      const { game } = inRound()
      game.lock(tokA, T0 + 1)
      game.lock(tokB, T0 + 2)
      return game
    }

    it("cannot paint", () => {
      const { game, question } = inRound()
      expect(game.setPaint(tokS, paintAt(question, 0, 0))).toEqual({ ok: false, error: "you are watching" })
    })

    it("cannot lock in", () => {
      const { game } = inRound()
      expect(game.lock(tokS, T0)).toEqual({ ok: false, error: "you are watching" })
    })

    it("is not waited on: the round ends when the players have locked in, and scores only them", () => {
      const game = atReveal()
      expect(game.phase).toBe(Phase.REVEAL)
      const reveal = viewIn(viewOf(game, tokS, T0 + 2), Phase.REVEAL).reveal
      expect(reveal.results.map((result) => result.playerId).sort()).toEqual(["p1", "p2"])
    })

    it("cannot ready up", () => {
      const game = atReveal()
      expect(game.ready(tokS, T0 + 3)).toEqual({ ok: false, error: "you are watching" })
    })

    it("is not waited on at the reveal: it moves on when the players are ready", () => {
      const game = atReveal()
      game.ready(tokA, T0 + 3)
      game.ready(tokB, T0 + 4)
      expect(game.phase).toBe(Phase.GUESSING)
    })

    it("is left out of the final results", () => {
      const game = atReveal()
      game.ready(tokA, T0 + 3)
      game.ready(tokB, T0 + 4)
      game.tick(T1 + 10_000 + ROUND_GRACE)
      game.next(tokA, T1 + 10_000)
      expect(
        viewIn(viewOf(game, tokS, T1 + 10_000), Phase.RESULTS)
          .results.map((result) => result.playerId)
          .sort()
      ).toEqual(["p1", "p2"])
    })
  })

  it("switches role in the lobby only, taking or giving up a colour", () => {
    const game = withSpectator()
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: true, changed: true })
    expect(sam(game)).toMatchObject({ type: Role.PLAYER, colour: 2 })
    expect(game.setRole(tokB, Role.SPECTATOR)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokB, T0).spectators.map((player) => player.name)).toEqual(["Bob"])
    expect(game.setRole(tokB, Role.SPECTATOR)).toEqual({ ok: true, changed: false })
    game.start(tokA, T0)
    expect(game.setRole(tokA, Role.SPECTATOR)).toEqual({
      ok: false,
      error: "you can only switch to watching in the lobby"
    })
  })

  it("a spectator can take a free seat mid-round, sitting that round out and playing from the next", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: true, changed: true })
    const view = viewOf(game, tokS, T0 + 1)
    expect(view.you.role).toMatchObject({ type: YouRoleType.JOINED_LATE })
    expect(viewOf(game, tokA, T0 + 1).players.find((player) => player.name === "Sam")!.colour).toBeGreaterThanOrEqual(0)
    expect(game.lock(tokS, T0 + 1)).toEqual({ ok: false, error: "sitting this round out" })
    // Alice and Bob finishing still ends the round without Sam.
    game.lock(tokA, T0 + 2)
    game.lock(tokB, T0 + 3)
    expect(game.phase).toBe(Phase.REVEAL)
    // Sam is a player now, so the reveal waits for his Ready too.
    game.ready(tokA, T0 + 4)
    game.ready(tokB, T0 + 5)
    expect(game.phase).toBe(Phase.REVEAL)
    game.ready(tokS, T0 + 6)
    expect(game.phase).toBe(Phase.GUESSING)
    expect(viewOf(game, tokS, T0 + 6).you.role.type).toBe(YouRoleType.PLAYING)
    game.tick(T0 + 6 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 6 + 60_000)
    const standing = viewIn(viewOf(game, tokS, T0 + 6 + 60_000), Phase.RESULTS).results.find(
      (result) => result.playerId === sam(game).id
    )!
    expect(standing.rounds).toEqual([{}, { score: 250 }])
  })

  it("taking a seat at the reveal means playing from the next round", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.phase).toBe(Phase.REVEAL)
    game.setRole(tokS, Role.PLAYER)
    game.ready(tokA, T0 + 60_001)
    game.ready(tokB, T0 + 60_002)
    game.ready(tokS, T0 + 60_003)
    expect(viewOf(game, tokS, T0 + 60_003).you.role.type).toBe(YouRoleType.PLAYING)
  })

  it("nobody switches on the final results", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    game.end(tokA)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: false, error: "game has finished" })
  })

  it("cannot take a seat when all the player seats are taken", () => {
    const game = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) game.join(tok(`${i}`), playerName(`P${i}`), T0)
    game.join(tokS, playerName("Sam"), T0, Role.SPECTATOR)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: false, error: "game is full" })
    expect(game.join(tokW, playerName("Wes"), T0, Role.SPECTATOR).ok).toBe(true)
  })

  it("a host can watch and still run the game, but a game needs a player to start", () => {
    const game = twoPlayerGame(1)
    game.setRole(tokA, Role.SPECTATOR)
    expect(viewOf(game, tokA, T0).you.isHost).toBe(true)
    expect(game.start(tokA, T0).ok).toBe(true)
    const otherGame = makeGame({ code: roomCode("WXYZ") })
    otherGame.join(tokH, playerName("Hana"), T0, Role.SPECTATOR)
    expect(otherGame.start(tokH, T0)).toEqual({ ok: false, error: "no players" })
  })

  it("a spectator reclaims their seat as a spectator after a refresh", () => {
    const game = withSpectator()
    game.disconnect(tokS, T0 + 5)
    game.join(tokS, playerName("Sam"), T0 + 6)
    expect(viewOf(game, tokS, T0 + 6).you.role).toEqual({ type: YouRoleType.SPECTATOR })
  })
})

describe("who a view is for", () => {
  it("gives a token with no seat no view: an unknown one, and one that was removed", () => {
    const game = twoPlayerGame()
    expect(game.view(tok("nobody"), T0)).toBeUndefined()
    game.kick(tokA, viewOf(game, tokB, T0).you.id, T0)
    expect(game.view(tokB, T0)).toBeUndefined()
  })

  it("gives a player their own colour with their role, the one the others see", () => {
    const game = twoPlayerGame()
    const bob = viewOf(game, tokB, T0)
    const bobSeenByAlice = viewOf(game, tokA, T0).players.find((player) => player.id === bob.you.id)!
    expect(bob.you.role).toEqual({ type: YouRoleType.PLAYING, colour: bobSeenByAlice.colour })
  })

  it("says a host who watches is a spectator while they still host", () => {
    const game = twoPlayerGame()
    game.setRole(tokA, Role.SPECTATOR)
    const { you } = viewOf(game, tokA, T0)
    expect(you.isHost).toBe(true)
    expect(you.role).toEqual({ type: YouRoleType.SPECTATOR })
  })
})

describe("joining and leaving mid-game", () => {
  it("late joiner spectates the current round and plays the next", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    expect(game.join(tokC, playerName("Cara"), T0 + 5).ok).toBe(true)
    expect(viewOf(game, tokC, T0 + 5).you.role.type).toBe(YouRoleType.JOINED_LATE)
    const question = currentQuestion(game, tokA, T0)
    expect(game.setPaint(tokC, paintAt(question, 0, 0))).toEqual({ ok: false, error: "sitting this round out" })
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(
      viewIn(viewOf(game, tokC, T0 + 60_000), Phase.REVEAL).reveal.results.map((result) => result.playerId)
    ).not.toContain("p3")
    game.next(tokA, T0 + 60_001)
    expect(viewOf(game, tokC, T0 + 60_001).you.role.type).toBe(YouRoleType.PLAYING)
    const q2 = currentQuestion(game, tokC, T0 + 60_001)
    expect(game.setPaint(tokC, paintAt(q2, 0, 0)).ok).toBe(true)
  })

  it("a late joiner's total counts the rounds they played", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.join(tokC, playerName("Cara"), T0 + 5)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 60_001)
    game.tick(T0 + 120_001 + ROUND_GRACE)
    const cara = viewOf(game, tokC, T0 + 120_001).players.find((player) => player.id === "p3")!
    expect(cara.score).toBeGreaterThan(0)
    game.next(tokA, T0 + 120_002)
    const standing = viewIn(viewOf(game, tokC, T0 + 120_002), Phase.RESULTS).results.find(
      (entry) => entry.playerId === "p3"
    )!
    expect(standing.total).toBe(cara.score)
    expect(standing.rounds).toEqual([{}, { score: cara.score }])
  })

  it("a reconnecting player gets their own paint back, and only their own", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    const mine = paintAt(question, 10, 10)
    game.setPaint(tokA, mine)
    game.disconnect(tokA, T0 + 1)
    game.join(tokA, playerName("Alice"), T0 + 5)
    expect(viewIn(viewOf(game, tokA, T0 + 5), Phase.GUESSING).you.paint).toEqual(mine)
    expect(viewIn(viewOf(game, tokB, T0 + 5), Phase.GUESSING).you.paint).toBeUndefined()
    expect(JSON.stringify(viewOf(game, tokB, T0 + 5))).not.toContain(Object.keys(mine.cells)[0])
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewOf(game, tokA, T0 + 60_000).you).not.toHaveProperty("paint")
  })

  it("a disconnected player keeps their seat and score, and reclaims it by token", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.disconnect(tokB, T0 + 60_001)
    expect(game.playerTokens).toContain(tokB)
    expect(viewOf(game, tokA, T0 + 60_001).players.find((player) => player.id === "p2")!.connected).toBe(false)
    game.join(tokB, playerName("Bob"), T0 + 70_000)
    const bob = viewOf(game, tokB, T0 + 70_000).players.find((player) => player.id === "p2")!
    expect(bob.connected).toBe(true)
    expect(bob.score).toBeGreaterThan(0)
  })

  it("while the host is away the longest-standing player acts as host; the host regains it on return", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    expect(viewOf(game, tokB, T0 + 1).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0 + 1).players.find((player) => player.id === "p2")!.isHost).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.next(tokA, T0 + 60_000)).toEqual({ ok: false, error: "only the host can advance" })
    expect(game.next(tokB, T0 + 60_000).ok).toBe(true)
    // A refresh brings the original host straight back.
    game.join(tokA, playerName("Alice"), T0 + 61_000)
    expect(viewOf(game, tokA, T0 + 61_000).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0 + 61_000).you.isHost).toBe(false)
  })

  it("in the lobby a host gone longer than the grace period hands over for good", () => {
    const game = twoPlayerGame(2)
    game.disconnect(tokA, T0 + 1)
    game.tick(T0 + 1 + SEAT_GRACE)
    game.join(tokA, playerName("Alice"), T0 + 1 + SEAT_GRACE + 5)
    expect(viewOf(game, tokA, T0 + SEAT_GRACE + 6).you.isHost).toBe(false)
    expect(viewOf(game, tokB, T0 + SEAT_GRACE + 6).you.isHost).toBe(true)
  })

  it("play again returns to the lobby with scores reset", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    expect(game.phase).toBe(Phase.RESULTS)
    expect(game.join(tokZ, playerName("Zed"), T0 + 80_001)).toEqual({ ok: false, reason: CloseReason.FINISHED })
    expect(game.again(tokA, T0 + 81_000).ok).toBe(true)
    expect(game.phase).toBe(Phase.LOBBY)
    expect(viewOf(game, tokA, T0 + 81_000).players.map((player) => player.score)).toEqual([0, 0])
  })

  it("play again keeps a player who is away their seat for the lobby's grace, from then", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.disconnect(tokB, T0 + 1)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    const again = T0 + 81_000
    game.again(tokA, again)
    game.tick(again + SEAT_GRACE - 1)
    game.join(tokB, playerName("Bob"), again + SEAT_GRACE - 1)
    expect(viewOf(game, tokB, again + SEAT_GRACE).you.id).toBe("p2")

    game.disconnect(tokB, again + SEAT_GRACE)
    game.tick(again + 2 * SEAT_GRACE)
    expect(game.playerTokens).toEqual([tokA])
  })

  it("play again keeps an absent host the host, with the presser acting for them", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokB, T0 + 80_000)
    game.again(tokB, T0 + 81_000)
    game.join(tokA, playerName("Alice"), T0 + 82_000)
    expect(viewOf(game, tokA, T0 + 82_000).you.isHost).toBe(true)
  })

  it("play again leaves each player as a new joiner would be, but for who they are", () => {
    const record = (game: Game, token: PlayerToken) =>
      (game as unknown as { seats: { get(token: PlayerToken): Seat } }).seats.get(token).role
    const fresh = twoPlayerGame(1)
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000, hints: 1 } })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0 + 1)
    game.start(tokA, T0)
    game.hint(tokA, HintAxis.LATITUDE)
    game.setPaint(tokA, paintOn(currentQuestion(game, tokA, T0)))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    game.again(tokA, T0 + 81_000)
    expect(record(game, tokA)).toEqual(record(fresh, tokA))
    expect(record(game, tokB)).toEqual(record(fresh, tokB))
  })
})

describe("rename", () => {
  it("changes the visible name for everyone, in any phase", () => {
    const game = twoPlayerGame(1)
    expect(game.rename(tokB, playerName("Robert"))).toEqual({ ok: true, changed: true })
    expect(
      viewOf(game, tokA, T0)
        .players.map((player) => player.name)
        .sort()
    ).toEqual(["Alice", "Robert"])
    game.start(tokA, T0)
    expect(game.rename(tokB, playerName("Bobby")).ok).toBe(true)
    expect(game.rename(tokB, playerName("Bobby"))).toEqual({ ok: true, changed: false })
    expect(game.rename(tok("nobody"), playerName("X"))).toEqual({ ok: false, error: "unknown player" })
  })
})

describe("ranks", () => {
  it("ranks share on ties and record the previous rank for arrows", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintOn(question))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const view = viewOf(game, tokA, T0 + 60_000)
    const a = view.players.find((player) => player.id === "p1")!
    const b = view.players.find((player) => player.id === "p2")!
    expect(a.rank).toBe(1)
    expect(b.rank).toBe(2)
    expect(a.previousRank).toBe(1)
    expect(b.previousRank).toBe(1)
  })
})

describe("ready-up edge cases", () => {
  it("a player leaving during the reveal does not hold the others up", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.ready(tokA, T0 + 61_000)
    expect(game.phase).toBe(Phase.REVEAL)
    game.disconnect(tokB, T0 + 62_000)
    expect(game.phase).toBe(Phase.GUESSING)
  })

  it("nobody left connected means nothing advances", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.disconnect(tokA, T0 + 61_000)
    game.disconnect(tokB, T0 + 61_001)
    expect(game.phase).toBe(Phase.REVEAL)
  })

  it("ready is only meaningful during the reveal, and resets each round", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    expect(game.ready(tokA, T0)).toEqual({ ok: true, changed: false })
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.ready(tokA, T0 + 61_000)
    game.ready(tokB, T0 + 61_000)
    game.tick(T0 + 121_000 + ROUND_GRACE)
    expect(viewIn(viewOf(game, tokA, T0 + 121_000), Phase.REVEAL).reveal.ready).toEqual([])
  })
})

describe("configure", () => {
  const places = (count: number) => mixOf({ [QuestionType.PLACE]: count })
  const landmarks = (count: number) => mixOf({ [QuestionType.LANDMARK]: count })

  it("lets the host change the mix, and so the rounds, and round length in the lobby only", () => {
    const game = twoPlayerGame()
    expect(game.configure(tokB, { mix: places(3) })).toEqual({ ok: false, error: "only the host can change settings" })
    expect(game.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: false })
    expect(game.configure(tokA, { roundLength: 30_000 }).ok).toBe(true)
    const view = viewOf(game, tokB, T0)
    expect(mixTotal(view.config.mix)).toBe(3)
    expect(view.config.roundLength).toBe(30_000)
    game.start(tokA, T0)
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.total).toBe(3)
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.deadline).toBe(T0 + 30_000)
    expect(game.configure(tokA, { mix: places(5) })).toEqual({
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
      const game = twoPlayerGame()
      expect(game.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: true })
      expect(game.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: false })
    }
  })

  it("the question mix reaches the picker", () => {
    const game = makeGame({
      bank: { catalogue: [...pool, landmark("petra-photo", "Petra.jpg")] },
      config: { mix: places(1) }
    })
    game.join(tokA, playerName("Alice"), T0)
    expect(game.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: false })
    expect(viewOf(game, tokA, T0).config.mix).toEqual(landmarks(1))
    game.start(tokA, T0)
    // One round, a landmark: it must be the one landmark in the catalogue.
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question.clue).toEqual({
      type: ClueType.PHOTO,
      image: "Petra.jpg"
    })
  })

  it("starts on minimal map detail and lets the host change it in the lobby", () => {
    const game = twoPlayerGame(1)
    expect(viewOf(game, tokB, T0).config.mapDetail).toBe(MapDetail.MINIMAL)
    expect(game.configure(tokB, { mapDetail: MapDetail.WATER }).ok).toBe(false)
    expect(game.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: false })
    expect(viewOf(game, tokB, T0).config.mapDetail).toBe(MapDetail.PHYSICAL)
    game.start(tokA, T0)
    expect(game.configure(tokA, { mapDetail: MapDetail.POLITICAL }).ok).toBe(false)
  })

  it("reports who has locked in", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0 + 1)
    const players = viewOf(game, tokB, T0 + 1).players
    expect(players.find((player) => player.id === "p1")!.locked).toBe(true)
    expect(players.find((player) => player.id === "p2")!.locked).toBe(false)
  })
})

describe("host removes a player", () => {
  describe("removing a player", () => {
    function inRound() {
      const game = twoPlayerGame()
      game.start(tokA, T0)
      const question = currentQuestion(game, tokA, T0)
      game.setPaint(tokB, paintOn(question))
      return { game, question, aliceId: viewOf(game, tokA, T0).you.id, bobId: viewOf(game, tokB, T0).you.id }
    }

    it("is refused for a non-host, for yourself and for someone unknown", () => {
      const { game, aliceId } = inRound()
      expect(game.kick(tokB, aliceId, T0)).toEqual({ ok: false, error: "only the host can remove players" })
      expect(game.kick(tokA, aliceId, T0)).toEqual({ ok: false, error: "you cannot remove yourself" })
      expect(game.kick(tokA, playerId("p99"), T0)).toEqual({ ok: false, error: "unknown player" })
    })

    it("drops their seat, bans the token, and lets a fresh token in", () => {
      const { game, bobId } = inRound()
      expect(game.kick(tokA, bobId, T0).ok).toBe(true)
      expect(game.playerTokens).toEqual([tokA])
      expect(game.join(tokB, playerName("Bob again"), T0)).toEqual({ ok: false, reason: CloseReason.REMOVED })
      expect(game.join(tokC, playerName("Carol"), T0).ok).toBe(true)
    })

    it("drops their paint: it does not surface when the round ends", () => {
      const { game, question, bobId } = inRound()
      game.kick(tokA, bobId, T0)
      game.join(tokC, playerName("Carol"), T0)
      game.setPaint(tokA, paintAt(question, 0, 0))
      game.lock(tokA, T0)
      expect(game.phase).toBe(Phase.REVEAL)
      expect(
        viewIn(viewOf(game, tokA, T0), Phase.REVEAL).reveal.results.map((result) => result.playerId)
      ).not.toContain(bobId)
    })
  })

  it("removing the last unlocked player ends the round", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    expect(game.phase).toBe(Phase.GUESSING)
    game.kick(tokA, viewOf(game, tokB, T0).you.id, T0)
    expect(game.phase).toBe(Phase.REVEAL)
  })

  it("removing an absent host passes the role", () => {
    const otherGame = twoPlayerGame()
    otherGame.start(tokA, T0)
    otherGame.disconnect(tokA, T0)
    // Bob acts as host while Alice is away, and may remove her for good.
    const alice = viewOf(otherGame, tokB, T0).players.find((player) => !player.connected)!
    expect(otherGame.kick(tokB, alice.id, T0).ok).toBe(true)
    expect(otherGame.playerTokens).toEqual([tokB])
    expect(viewOf(otherGame, tokB, T0).you.isHost).toBe(true)
    // Alice reconnecting does not get her seat or the role back.
    expect(otherGame.join(tokA, playerName("Alice"), T0).ok).toBe(false)
  })
})

describe("host ends the game early", () => {
  it("scores the running round and jumps to results; only the host; nothing to end in the lobby", () => {
    const game = twoPlayerGame(3)
    expect(game.end(tokA)).toEqual({ ok: false, error: "nothing to end" })
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintOn(question))
    expect(game.end(tokB)).toEqual({ ok: false, error: "only the host can end the game" })
    expect(game.end(tokA).ok).toBe(true)
    expect(game.phase).toBe(Phase.RESULTS)
    const results = viewIn(viewOf(game, tokA, T0), Phase.RESULTS).results
    expect(results[0]!.rounds).toHaveLength(1)
    expect(results[0]!.total).toBeGreaterThan(500)
  })

  it("works from the reveal too", () => {
    const game = twoPlayerGame(3)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    game.lock(tokB, T0)
    expect(game.phase).toBe(Phase.REVEAL)
    expect(game.end(tokA).ok).toBe(true)
    expect(game.phase).toBe(Phase.RESULTS)
  })
})

describe("the question mix", () => {
  const OUTLINES = outlinesFrom(outlinesJson)
  const byId = (id: string) => CATALOGUE.find((question) => question.id === id)!
  const areaOf = (question: Question) => scoredAnswer(question.answer, OUTLINES) as Area
  const germany = byId("germany-region")

  function gameWith(config: Partial<GameConfig>, bank: Partial<QuestionBank> = {}) {
    const game = makeGame({
      bank: { catalogue: CATALOGUE, outlines: OUTLINES, ...bank },
      config: { roundLength: 60_000, ...config }
    })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0 + 1)
    return game
  }

  const outlineOf = (question: QuestionView) =>
    question.answer.type === AnswerType.AREA ? question.answer.outline : undefined

  it("defaults to 2 of each type but the extras", () => {
    expect(makeGame().config.mix).toEqual(
      mixOf({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 2, [QuestionType.COUNTRY]: 2, [QuestionType.FLAG]: 2 })
    )
  })

  it("sends every player and spectator views that match GameViewSchema, through every type of round", () => {
    const mix = mixOf(Object.fromEntries(Object.values(QuestionType).map((type) => [type, 1])))
    const game = gameWith({ mix, mapDetail: MapDetail.WATER })
    game.join(tokS, playerName("Sam"), T0 + 2, Role.SPECTATOR)
    let now = T0
    const check = () => {
      for (const token of [tokA, tokB, tokS]) {
        const checked = GameViewSchema.safeParse(viewOf(game, token, now))
        expect(checked.success, JSON.stringify(checked.error?.issues)).toBe(true)
      }
    }
    check()
    game.start(tokA, now)
    while (game.phase !== Phase.RESULTS) {
      const { tolerance } = viewIn(viewOf(game, tokA, now), Phase.GUESSING).round.question.answer
      const layer = new PaintLayer(resolutionForTolerance(tolerance))
      layer.stamp({ lat: 10, lon: 10 }, tolerance, 1)
      game.setPaint(tokA, { cells: layer.toRecord(), floor: 0.05 })
      game.lock(tokB, now)
      check()
      now += 60_000 + ROUND_GRACE
      game.tick(now)
      check()
      game.next(tokA, now)
    }
    check()
    expect(viewIn(viewOf(game, tokA, now), Phase.RESULTS).awards.length).toBeGreaterThan(0)
  })

  it("scores a country round against the outline, which it never sends; a pass still scores 250", () => {
    const game = gameWith({ mix: mixOf({ [QuestionType.COUNTRY]: 1 }) }, { catalogue: [germany] })
    game.start(tokA, T0)
    const question = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question
    expect(outlineOf(question)).toBe("germany-region")
    expect(JSON.stringify(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round)).not.toContain("[[")
    const resolution = resolutionForTolerance(question.answer.tolerance)
    const cells = Object.fromEntries(regionCells(areaOf(germany), resolution).map((cell) => [cell, 1]))
    expect(game.setPaint(tokA, { cells, floor: 0.05 }).ok).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal
    expect(outlineOf(reveal.question)).toBe("germany-region")
    expect(reveal.label).toBe("Germany")
    const alice = reveal.results.find((result) => result.playerId === "p1")!
    expect(alice.score).toBeGreaterThan(985)
    expect(alice.guess).toMatchObject({ type: RoundGuessType.PAINTED, parts: { type: AnswerType.AREA } })
    const bob = reveal.results.find((result) => result.playerId === "p2")!
    expect(bob.score).toBe(PASS_SCORE.score)
    expect(bob.guess).toEqual({ type: RoundGuessType.PASSED })
  })

  it("scores a small country's flag as a point and reveals its name", () => {
    const monaco = byId("flag-mc")
    const game = gameWith({ mix: mixOf({ [QuestionType.FLAG]: 1 }) }, { catalogue: [monaco] })
    game.start(tokA, T0)
    const question = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question
    expect(question).toEqual({
      type: QuestionType.FLAG,
      clue: { type: ClueType.FLAG, flag: "mc" },
      answer: { type: AnswerType.POINT, tolerance: 15 }
    })
    expect(promptOf(question)).toBe(FLAG_POINT_PROMPT)
    if (monaco.answer.type !== AnswerType.POINT) throw new Error("Monaco is asked as a point")
    const { at } = monaco.answer
    const cell = latLngToCell(at.lat, at.lon, resolutionForTolerance(question.answer.tolerance))
    expect(game.setPaint(tokA, { cells: { [cell]: 1 }, floor: 0.05 }).ok).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal
    expect(reveal.label).toBe("Monaco")
    expect(reveal.question.clue).toEqual({ type: ClueType.FLAG, flag: "mc" })
    expect(reveal.results.find((result) => result.playerId === "p1")!.score).toBeGreaterThan(900)
  })
})

describe("upcoming pictures", () => {
  const photos = [landmark("one", "One.jpg"), landmark("two", "Two.jpg"), landmark("three", "Three.jpg")]
  const mix = mixOf({ [QuestionType.LANDMARK]: 2 })
  const imageOf = (game: Game, at: number) => {
    const clue = viewIn(viewOf(game, tokA, at), Phase.GUESSING).round.question.clue
    return clue.type === ClueType.PHOTO ? clue.image : undefined
  }

  it("sends round 1's photo in the lobby, the next round's while one is played, and nothing after the last", () => {
    const game = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    game.join(tokA, playerName("Alice"), T0)
    const first = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.image
    expect(first).toBeDefined()
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBe(first)
    const second = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).upcoming?.image
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).upcoming?.image).toBe(second)
    game.next(tokA, T0 + 62_000)
    expect(imageOf(game, T0 + 62_000)).toBe(second)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).upcoming).toBeUndefined()
  })

  it("sends a place-name round's reveal photo with its pictures, and shows it at the reveal", () => {
    const paris = CATALOGUE.find((question) => question.id === "paris")!
    const game = makeGame({
      bank: { catalogue: [paris] },
      config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000 }
    })
    game.join(tokA, playerName("Alice"), T0)
    const photo = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.revealPhoto
    expect(photo).toBeDefined()
    expect(photo).toBe(REVEAL_PHOTOS[paris.place])
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBeUndefined()
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const view = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL)
    expect(view.reveal.photo).toBe(photo)
    game.next(tokA, T0 + 62_000)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.RESULTS).playedRounds[0]?.revealPhoto).toBe(photo)
  })

  it("picks the rounds again when the host changes the setup, so round 1's photo is still the one asked", () => {
    const game = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    game.join(tokA, playerName("Alice"), T0)
    game.configure(tokA, { mix: mixOf({ [QuestionType.LANDMARK]: 3 }) })
    const first = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.image
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBe(first)
  })
})

describe("hints", () => {
  function hintGame() {
    const game = makeGame({
      config: { mix: mixOf({ [QuestionType.PLACE]: 3 }), hints: 2 }
    })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0)
    return game
  }
  function inFirstRound() {
    const game = hintGame()
    game.start(tokA, T0)
    return { game, question: currentQuestion(game, tokA, T0) }
  }

  it("starts each player with the host's allowance, and gives no hint before a round", () => {
    const game = hintGame()
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no round to hint" })
    game.start(tokA, T0)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 2 })
  })

  it("gives a band on the asked axis that holds the answer, and uses up a hint", () => {
    const { game, question } = inFirstRound()
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: true, changed: true })
    const band = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint!
    expect(band.axis).toBe(HintAxis.LATITUDE)
    expect(inHintBand(band, question.answer.at)).toBe(true)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 1 })
  })

  it("gives everyone who asks for the same axis the same band", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    expect(game.hint(tokB, HintAxis.LATITUDE).ok).toBe(true)
    expect(viewIn(viewOf(game, tokB, T0), Phase.GUESSING).you.hint).toEqual(
      viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint
    )
  })

  it("allows one hint per round", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    expect(game.hint(tokA, HintAxis.LONGITUDE)).toEqual({ ok: false, error: "one hint per round" })
  })

  it("keeps the hint at the reveal, and records the axis against each result", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.hint(tokB, HintAxis.LATITUDE)
    const band = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL)
    expect(reveal.you.hint).toEqual(band)
    expect(reveal.reveal.results.map((result) => result.hint)).toEqual([HintAxis.LATITUDE, HintAxis.LATITUDE])
  })

  it("starts the next round without a hint, and allows another", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 62_000)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).you.hint).toBeUndefined()
    expect(game.hint(tokA, HintAxis.LONGITUDE).ok).toBe(true)
  })

  it("refuses a hint once the host's allowance is used", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 62_000)
    game.hint(tokA, HintAxis.LONGITUDE)
    game.tick(T0 + 122_000 + ROUND_GRACE)
    game.next(tokA, T0 + 124_000)
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no hints left" })
    expect(viewOf(game, tokA, T0 + 124_000).you.role).toMatchObject({ hintsLeft: 0 })
  })

  it("lets the host set 0 to 3, and gives spectators none", () => {
    const none = twoPlayerGame()
    expect(none.configure(tokA, { hints: 0 })).toEqual({ ok: true, changed: true })
    none.start(tokA, T0)
    expect(viewOf(none, tokA, T0).you.role).toMatchObject({ hintsLeft: 0 })
    const game = twoPlayerGame()
    game.join(tokW, playerName("Wes"), T0, Role.SPECTATOR)
    game.configure(tokA, { hints: 3 })
    game.start(tokA, T0)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 3 })
    expect(viewOf(game, tokW, T0).you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(game.hint(tokW, HintAxis.LATITUDE)).toEqual({ ok: false, error: "you are not playing this round" })
  })
})

describe("what each phase holds", () => {
  it("the reveal stays the same object while it shows, and goes when the next round starts", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = game.roundReveal
    expect(reveal).toBeDefined()
    game.ready(tokA, T0 + 62_000)
    expect(game.roundReveal).toBe(reveal)
    game.ready(tokB, T0 + 62_000)
    expect(game.roundReveal).toBeUndefined()
  })

  it("who locked in still shows at the reveal, and clears when the next round starts", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    game.lock(tokA, T0 + 1_000)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewOf(game, tokA, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    expect(viewOf(game, tokB, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
    game.next(tokA, T0 + 62_000)
    expect(viewOf(game, tokA, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
  })

  it("play again starts the next game's first round with no lock, hint or paint left over", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.setPaint(tokA, paintOn(currentQuestion(game, tokA, T0)))
    game.hint(tokA, HintAxis.LATITUDE)
    game.lock(tokA, T0 + 1_000)
    game.end(tokA)
    game.again(tokA, T0 + 5_000)
    game.start(tokA, T0 + 6_000)
    const { you } = viewIn(viewOf(game, tokA, T0 + 6_000), Phase.GUESSING)
    expect(you.role).toMatchObject({ locked: false })
    expect(you).not.toHaveProperty("hint")
    expect(you).not.toHaveProperty("paint")
  })

  it("a player's own paint is theirs to restore while guessing, and gone once the round ends", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    const paint = paintOn(currentQuestion(game, tokA, T0))
    game.setPaint(tokA, paint)
    expect(game.paintOf(tokA)).toEqual(paint)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.paintOf(tokA)).toBeUndefined()
  })

  it("refuses to start a game with no rounds to play", () => {
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.FLAG]: 1 }) } })
    game.join(tokA, playerName("Alice"), T0)
    expect(game.start(tokA, T0)).toEqual({ ok: false, error: "no rounds to play" })
    expect(game.phase).toBe(Phase.LOBBY)
  })
})
