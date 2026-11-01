import { describe, expect, it } from "vite-plus/test"
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { compactRecord } from "@whereabouts/shared/paint/compact"
import { resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { mixOf, mixTotal } from "@whereabouts/shared/protocol/config"
import { Phase, RoundGuessType } from "@whereabouts/shared/protocol/views"
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { CATALOGUE } from "@whereabouts/shared/catalogue/catalogue"
import { HintAxis } from "@whereabouts/shared/hints"
import { regionCells, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType, ClueType, QuestionType, answerCentre, promptOf } from "@whereabouts/shared/questions"
import { BANK } from "../rooms.ts"
import { lockedIn, askedIn, host, join, paintAt, pollErrors, useGameServer } from "./test-server.ts"

describe("game flow", () => {
  const server = useGameServer()

  it("host creates a game, a friend joins by code, both see the lobby", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    expect(lobby.code).toMatch(/^[A-Z0-9]{4}$/)
    expect(lobby.you.isHost).toBe(true)

    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    const seen = await alice.until((view) => view.players.length === 2)
    expect(seen.players.map((player) => player.name).sort()).toEqual(["Alice", "Bob"])
    const bobView = await bob.until((view) => view.players.length === 2)
    expect(bobView.you.isHost).toBe(false)
  })

  it("plays a full two-round game with a deadline, reveal, and results", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)

    bob.send(ClientTopic.START)
    expect(await pollErrors(bob)).toContain("only the host can start")

    alice.send(ClientTopic.START)
    const round = await bob.until((view) => view.phase === Phase.GUESSING)
    expect(viewIn(round, Phase.GUESSING).round.total).toBe(2)
    const question = askedIn(round)
    const at = answerCentre(question.answer)

    alice.sendPaint(paintAt(question, at.lat, at.lon))
    const bobPaint = paintAt(question, -30, -60)
    bob.sendPaint(bobPaint)
    bob.send(ClientTopic.LOCK)
    await bob.untilLatest(lockedIn)
    // Nobody else learns about Bob's paint before the reveal.
    const aBobCell = Object.keys(bobPaint.cells)[0]!
    expect(JSON.stringify(alice.latest)).not.toContain(aBobCell)

    server.clock.advance(60_000 + ROUND_GRACE)
    const reveal = await alice.until((view) => view.phase === Phase.REVEAL)
    expect(viewIn(reveal, Phase.REVEAL).reveal.label).toBe(question.label)
    const byName = Object.fromEntries(reveal.players.map((player) => [player.name, player.id]))
    const scores = Object.fromEntries(
      viewIn(reveal, Phase.REVEAL).reveal.results.map((result) => [result.playerId, result.score])
    )
    expect(scores[byName["Alice"]!]).toBeGreaterThan(scores[byName["Bob"]!]!)
    expect(
      viewIn(reveal, Phase.REVEAL).reveal.results.every((result) => result.guess.type === RoundGuessType.PAINTED)
    ).toBe(true)

    alice.send(ClientTopic.NEXT)
    await bob.until((view) => view.phase === Phase.GUESSING && view.round.index === 1)
    server.clock.advance(60_000 + ROUND_GRACE)
    await bob.until((view) => view.phase === Phase.REVEAL && view.reveal.index === 1)
    // No timer on the reveal: it advances when everyone is ready.
    bob.send(ClientTopic.READY)
    await alice.until((view) => view.phase === Phase.REVEAL && view.reveal.ready.length === 1)
    alice.send(ClientTopic.READY)
    const results = viewIn(await bob.until((view) => view.phase === Phase.RESULTS), Phase.RESULTS)
    expect(results.results).toHaveLength(2)
    expect(results.results[0]!.playerId).toBe(byName["Alice"])
  })

  it("plays a country round: scored against the outline, against the area rule", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)
    alice.send(ClientTopic.CONFIGURE, { mix: mixOf({ [QuestionType.COUNTRY]: 1 }) })
    await bob.until((view) => view.config.mix[QuestionType.COUNTRY] === 1 && mixTotal(view.config.mix) === 1)

    alice.send(ClientTopic.START)
    const round = await bob.until((view) => view.phase === Phase.GUESSING)
    const shown = viewIn(round, Phase.GUESSING).round.question.answer
    expect(shown.type).toBe(AnswerType.AREA)
    expect(promptOf(viewIn(round, Phase.GUESSING).round.question)).toMatch(/^Paint the whole of /)
    const country = CATALOGUE.find(
      (question) =>
        question.type === QuestionType.COUNTRY &&
        shown.type === AnswerType.AREA &&
        question.answer.outline === shown.outline
    )!
    const area = scoredAnswer(country.answer, BANK.outlines)
    if (area.type !== AnswerType.AREA) throw new Error("a country is an area")
    // Paint it exactly, compacted the way the client sends paint.
    const resolution = resolutionForTolerance(shown.tolerance)
    const cells = compactRecord(Object.fromEntries(regionCells(area, resolution).map((cell) => [cell, 1])))
    alice.sendPaint({ cells, floor: 0.05 })
    alice.send(ClientTopic.LOCK)
    await alice.untilLatest(lockedIn)

    server.clock.advance(60_000 + ROUND_GRACE)
    const reveal = await bob.until((view) => view.phase === Phase.REVEAL)
    expect(viewIn(reveal, Phase.REVEAL).reveal.question.answer).toEqual(shown)
    expect(viewIn(reveal, Phase.REVEAL).reveal.label).toBe(country.label)
    const byName = Object.fromEntries(reveal.players.map((player) => [player.name, player.id]))
    const aliceResult = viewIn(reveal, Phase.REVEAL).reveal.results.find(
      (result) => result.playerId === byName["Alice"]
    )!
    expect(aliceResult.score).toBeGreaterThan(980)
    expect(aliceResult.guess).toMatchObject({ type: RoundGuessType.PAINTED, parts: { type: AnswerType.AREA } })
    const bobResult = viewIn(reveal, Phase.REVEAL).reveal.results.find((result) => result.playerId === byName["Bob"])!
    expect(bobResult.score).toBe(250)
  })

  it("plays a flag round: the flag is shown, the name only at the reveal", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    await alice.until((view) => view.phase === Phase.LOBBY)
    alice.send(ClientTopic.CONFIGURE, { mix: mixOf({ [QuestionType.FLAG]: 1 }) })
    await alice.until((view) => view.config.mix[QuestionType.FLAG] === 1 && mixTotal(view.config.mix) === 1)

    alice.send(ClientTopic.START)
    const round = await alice.until((view) => view.phase === Phase.GUESSING)
    const { clue } = viewIn(round, Phase.GUESSING).round.question
    if (clue.type !== ClueType.FLAG) throw new Error("a flag round shows a flag")
    expect(clue.flag).toMatch(/^[a-z]{2}$/)
    const flagQuestion = CATALOGUE.find(
      (question) => question.clue.type === ClueType.FLAG && question.clue.flag === clue.flag
    )!
    expect(JSON.stringify(round)).not.toContain(flagQuestion.label)

    server.clock.advance(60_000 + ROUND_GRACE)
    const reveal = await alice.until((view) => view.phase === Phase.REVEAL)
    expect(viewIn(reveal, Phase.REVEAL).reveal.label).toBe(flagQuestion.label)
    expect(viewIn(reveal, Phase.REVEAL).reveal.question.clue).toEqual(clue)
  })

  it("plays a round with a hint, unlocking, and the host ending early, then again", async () => {
    const { alice, bob } = await server.aliceAndBob()
    alice.send(ClientTopic.START)
    await bob.until((view) => view.phase === Phase.GUESSING)

    alice.send(ClientTopic.HINT, { axis: HintAxis.LATITUDE })
    const hinted = await alice.untilLatest((view) => view.phase === Phase.GUESSING && view.you.hint !== undefined)
    expect(viewIn(hinted, Phase.GUESSING).you.hint!.axis).toBe(HintAxis.LATITUDE)
    alice.send(ClientTopic.HINT, { axis: HintAxis.LONGITUDE })
    expect(await pollErrors(alice)).toContain("one hint per round")

    bob.send(ClientTopic.LOCK)
    await bob.untilLatest(lockedIn)
    bob.send(ClientTopic.UNLOCK)
    await bob.untilLatest((view) => !lockedIn(view))

    bob.send(ClientTopic.END)
    expect(await pollErrors(bob)).toContain("only the host can end the game")
    alice.send(ClientTopic.END)
    const results = await bob.until((view) => view.phase === Phase.RESULTS)
    expect(viewIn(results, Phase.RESULTS).results.every((result) => result.rounds.length === 1)).toBe(true)

    alice.send(ClientTopic.AGAIN)
    const lobby = await bob.until((view) => view.phase === Phase.LOBBY)
    expect(lobby.players).toHaveLength(2)
  })
})
