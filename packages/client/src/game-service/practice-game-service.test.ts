import { describe, expect, it } from "vite-plus/test"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { paintOn, pool } from "@whereabouts/shared/game/game-tests/support"
import { HintAxis } from "@whereabouts/shared/hints"
import { playerName } from "@whereabouts/shared/ids"
import { MapDetail } from "@whereabouts/shared/protocol/config"
import { Phase, type GuessingGameView } from "@whereabouts/shared/protocol/views"
import { promptOf, shuffle, type PlaceQuestion } from "@whereabouts/shared/questions"
import { YouRoleType } from "@whereabouts/shared/roles"
import { PASS_SCORE, KernelId } from "@whereabouts/shared/scoring/scoring"
import { FakeClock } from "@whereabouts/shared/test-support/fake-clock"
import { PracticeGameService, type PracticeOptions } from "./practice-game-service"
import { ConnectionStatus } from "./connection-state"

const SEED = 1

const makePracticeGameService = (
  options: Partial<PracticeOptions> = {}
): { service: PracticeGameService; clock: FakeClock } => {
  const clock = new FakeClock()
  const service = new PracticeGameService({
    pool,
    outlines: new Map(),
    mapDetail: MapDetail.MINIMAL,
    kernelId: KernelId.SINGLE,
    name: playerName("Alice"),
    seed: SEED,
    clock,
    ...options
  })
  return { service, clock }
}

const guessing = (service: PracticeGameService): GuessingGameView => viewIn(service.view.value, Phase.GUESSING)

/** The question on screen, found from the pool by its prompt. */
const askedNow = (service: PracticeGameService): PlaceQuestion =>
  pool.find((question) => promptOf(question) === promptOf(guessing(service).round.question))!

const shuffledPrompts = (seed: number): string[] => shuffle([...pool], seed).map(promptOf)

describe("PracticeGameService", () => {
  it("puts you straight into round 1, guessing, with no deadline", () => {
    const { service } = makePracticeGameService()
    expect(service.view.value).toBeUndefined()
    service.begin()
    const { round, you } = guessing(service)
    expect(round).toMatchObject({ index: 0, total: pool.length })
    expect(round.deadline).toBeUndefined()
    expect(promptOf(round.question)).toBe(shuffledPrompts(SEED)[0])
    expect(you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
    expect(service.status.value).toEqual({ type: ConnectionStatus.CONNECTED })
    expect(service.online.value).toBe(true)
    expect(service.clockOffset.value).toBe(0)
    expect(service.code.value).toBe(service.view.value?.code)
  })

  it("reveals the round with your score once you paint and lock in", () => {
    const { service } = makePracticeGameService()
    service.begin()
    service.sendPaint(paintOn(askedNow(service)))
    service.lock()
    const { reveal } = viewIn(service.view.value, Phase.REVEAL)
    expect(reveal.results[0]!.score).toBeGreaterThan(PASS_SCORE.score)
    expect(service.lastError.value).toBeUndefined()
  })

  it("scores a lock-in with no paint as a pass", () => {
    const { service } = makePracticeGameService()
    service.begin()
    service.lock()
    expect(viewIn(service.view.value, Phase.REVEAL).reveal.results[0]!.score).toBe(PASS_SCORE.score)
  })

  it("gives a hint every round without running out, but one per round", () => {
    const { service } = makePracticeGameService()
    service.begin()
    for (const _question of pool) {
      expect(guessing(service).you.role).toMatchObject({ hintsLeft: undefined })
      service.hint(HintAxis.LATITUDE)
      expect(service.lastError.value).toBeUndefined()
      expect(guessing(service).you.hint?.axis).toBe(HintAxis.LATITUDE)
      service.hint(HintAxis.LONGITUDE)
      expect(service.lastError.value).toBe("one hint per round")
      service.lock()
      service.next()
    }
    expect(service.view.value?.phase).toBe(Phase.RESULTS)
  })

  it("never ends a round as time passes", () => {
    const { service, clock } = makePracticeGameService()
    service.begin()
    clock.advance(24 * 3_600_000)
    expect(guessing(service).round.index).toBe(0)
    expect(service.timeUntil(clock.now() + 5_000)).toBe(5_000)
  })

  it("plays the shuffled pool in order, then reaches the results", () => {
    const { service } = makePracticeGameService()
    service.begin()
    const prompts: string[] = []
    while (service.view.value?.phase === Phase.GUESSING) {
      prompts.push(promptOf(guessing(service).round.question))
      service.sendPaint(paintOn(askedNow(service)))
      service.lock()
      service.next()
    }
    expect(prompts).toEqual(shuffledPrompts(SEED))
    const { results } = viewIn(service.view.value, Phase.RESULTS)
    expect(results[0]!.rounds).toHaveLength(pool.length)
    expect(results[0]!.total).toBeGreaterThan(0)
  })

  it("also moves on when you press ready", () => {
    const { service } = makePracticeGameService()
    service.begin()
    service.lock()
    service.ready()
    expect(guessing(service).round.index).toBe(1)
  })

  it("starts a new shuffle at round 1, with no scores, when you play again", () => {
    const { service } = makePracticeGameService()
    service.begin()
    const code = service.code.value
    for (const _question of pool) {
      service.sendPaint(paintOn(askedNow(service)))
      service.lock()
      service.next()
    }
    expect(service.view.value?.phase).toBe(Phase.RESULTS)
    service.again()
    const { round, players } = guessing(service)
    expect(round.index).toBe(0)
    expect(players[0]!.score).toBe(0)
    expect(service.code.value).toBe(code)
    const prompts = [promptOf(round.question)]
    for (let n = 1; n < pool.length; n++) {
      service.lock()
      service.next()
      prompts.push(promptOf(guessing(service).round.question))
    }
    expect([...prompts].sort()).toEqual([...shuffledPrompts(SEED)].sort())
    expect(prompts).not.toEqual(shuffledPrompts(SEED))
  })

  it("shows a refused command as the last error, and clears it on the next good one", () => {
    const { service } = makePracticeGameService()
    service.begin()
    service.next()
    expect(service.lastError.value).toBe("nothing to advance")
    service.lock()
    expect(service.lastError.value).toBeUndefined()
  })

  it("stops its timer when disposed", () => {
    const { service, clock } = makePracticeGameService()
    service.begin()
    service.dispose()
    clock.advance(1_000)
    expect(guessing(service).round.index).toBe(0)
  })
})
