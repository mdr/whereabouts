import { describe, expect } from "vite-plus/test"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { mixOf } from "@whereabouts/shared/protocol/config"
import { Phase, RoundGuessType } from "@whereabouts/shared/protocol/views"
import { HintAxis } from "@whereabouts/shared/hints"
import { AnswerType, ClueType, QuestionType, promptOf } from "@whereabouts/shared/questions"
import { expectRefused } from "../test-support/refused.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("game flow", () => {
  const it = useInProcessServer()

  it("host creates a game, a friend joins by code, both see the lobby", async ({ server }) => {
    const alice = await server.host("Alice")
    expect(alice.code).toMatch(/^[A-Z0-9]{4}$/)
    expect(alice.view.you.isHost).toBe(true)

    const bob = await alice.invite("Bob")
    await alice.expectLobbyWith(["Alice", "Bob"])
    expect(bob.view.you.isHost).toBe(false)
  })

  it("plays a full two-round game with a deadline, reveal, and results", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")

    await expectRefused(() => bob.start(), "only the host can start")

    await alice.start()
    const round = await bob.expectGuessing()
    expect(round.round.total).toBe(2)

    await alice.paintOnAnswer()
    const bobPaint = await bob.paintFarFromAnswer()
    await bob.lockIn()
    // Nobody else learns about Bob's paint before the reveal.
    alice.expectNotShown(bobPaint)

    const asked = server.questionOf()
    server.passDeadline()
    const reveal = await alice.expectReveal()
    expect(reveal.label).toBe(asked.label)
    expect(reveal.scoreOf(alice)).toBeGreaterThan(reveal.scoreOf(bob))
    expect(reveal.results.every((result) => result.guess.type === RoundGuessType.PAINTED)).toBe(true)

    await alice.next()
    await bob.expectGuessing(1)
    server.passDeadline()
    await bob.expectReveal(1)
    // No timer on the reveal: it advances when everyone is ready.
    await bob.ready()
    await alice.expectReadyCount(1)
    await alice.ready()
    const results = await bob.expectResults()
    expect(results.results).toHaveLength(2)
    expect(results.results[0]!.playerId).toBe(alice.id)
  })

  it("plays a country round: scored against the outline, against the area rule", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.setMix(mixOf({ [QuestionType.COUNTRY]: 1 }))

    await alice.start()
    const round = await bob.expectGuessing()
    const shown = round.round.question.answer
    expect(shown.type).toBe(AnswerType.AREA)
    expect(promptOf(round.round.question)).toMatch(/^Paint the whole of /)
    const country = server.questionOf()
    await alice.paintAnswerArea()
    await alice.lockIn()

    server.passDeadline()
    const reveal = await bob.expectReveal()
    expect(reveal.question.answer).toEqual(shown)
    expect(reveal.label).toBe(country.label)
    expect(reveal.scoreOf(alice)).toBeGreaterThan(980)
    expect(reveal.resultOf(alice).guess).toMatchObject({
      type: RoundGuessType.PAINTED,
      parts: { type: AnswerType.AREA }
    })
    expect(reveal.scoreOf(bob)).toBe(250)
  })

  it("plays a flag round: the flag is shown, the name only at the reveal", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.setMix(mixOf({ [QuestionType.FLAG]: 1 }))

    await alice.start()
    const round = await alice.expectGuessing()
    const { clue } = round.round.question
    if (clue.type !== ClueType.FLAG) throw new Error("a flag round shows a flag")
    expect(clue.flag).toMatch(/^[a-z]{2}$/)
    const flagQuestion = server.questionOf()
    expect(flagQuestion.clue).toMatchObject({ type: ClueType.FLAG, flag: clue.flag })
    expect(JSON.stringify(round)).not.toContain(flagQuestion.label)

    server.passDeadline()
    const reveal = await alice.expectReveal()
    expect(reveal.label).toBe(flagQuestion.label)
    expect(reveal.question.clue).toEqual(clue)
  })

  it("plays a round with a hint, unlocking, and the host ending early, then again", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()

    await alice.hint(HintAxis.LATITUDE)
    expect(viewIn(alice.view, Phase.GUESSING).you.hint!.axis).toBe(HintAxis.LATITUDE)
    await expectRefused(() => alice.hint(HintAxis.LONGITUDE), "one hint per round")

    await bob.lockIn()
    await bob.unlock()

    await expectRefused(() => bob.endGame(), "only the host can end the game")
    await alice.endGame()
    const results = await bob.expectResults()
    expect(results.results.every((result) => result.rounds.length === 1)).toBe(true)

    await alice.playAgain()
    const lobby = await bob.expectLobby()
    expect(lobby.players).toHaveLength(2)
  })
})
