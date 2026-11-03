import { describe, expect, it } from "vite-plus/test"
import { questionId } from "../ids.ts"
import { evenMix } from "../protocol/config.ts"
import { Phase } from "../protocol/views.ts"
import { QuestionType } from "../questions.ts"
import { MilestoneType, milestones, type GameSnapshot } from "./milestones.ts"

const makeSnapshot = (over: Partial<GameSnapshot> = {}): GameSnapshot => ({
  phase: Phase.LOBBY,
  roundIndex: undefined,
  question: undefined,
  tally: undefined,
  roundsPlayed: undefined,
  totalRounds: 4,
  playerCount: 3,
  mix: evenMix(4),
  ...over
})

const question = { id: questionId("eiffel"), type: QuestionType.LANDMARK }
const guessing = (roundIndex: number): GameSnapshot => makeSnapshot({ phase: Phase.GUESSING, roundIndex, question })
const tally = { painted: 2, passed: 1, missing: 0 }
const revealing = (roundIndex: number): GameSnapshot =>
  makeSnapshot({ phase: Phase.REVEAL, roundIndex, question, tally })
const results = (roundsPlayed: number): GameSnapshot => makeSnapshot({ phase: Phase.RESULTS, roundsPlayed })

describe("milestones", () => {
  it("finds nothing when the game stays on the same step", () => {
    expect(milestones(makeSnapshot(), makeSnapshot({ playerCount: 5 }))).toEqual([])
    expect(milestones(guessing(1), guessing(1))).toEqual([])
    expect(milestones(revealing(1), revealing(1))).toEqual([])
  })

  it("finds the game and its first round starting", () => {
    expect(milestones(makeSnapshot(), guessing(0))).toEqual([
      { type: MilestoneType.GAME_STARTED, playerCount: 3, rounds: 4, mix: evenMix(4) },
      { type: MilestoneType.ROUND_STARTED, index: 0, questionId: question.id, questionType: QuestionType.LANDMARK }
    ])
  })

  it("finds a round revealed with how it was answered", () => {
    expect(milestones(guessing(2), revealing(2))).toEqual([{ type: MilestoneType.ROUND_REVEALED, index: 2, ...tally }])
  })

  it("finds the next round starting", () => {
    expect(milestones(revealing(0), guessing(1))).toEqual([
      { type: MilestoneType.ROUND_STARTED, index: 1, questionId: question.id, questionType: QuestionType.LANDMARK }
    ])
  })

  it("finds a game that was played to the end", () => {
    expect(milestones(revealing(3), results(4))).toEqual([
      { type: MilestoneType.GAME_ENDED, completed: true, roundsPlayed: 4, playerCount: 3 }
    ])
  })

  it("finds a game ended early, from the reveal or mid-round", () => {
    const ended = [{ type: MilestoneType.GAME_ENDED, completed: false, roundsPlayed: 2, playerCount: 3 }]
    expect(milestones(revealing(1), results(2))).toEqual(ended)
    expect(milestones(guessing(1), results(2))).toEqual(ended)
  })

  it("finds nothing in going back to the lobby", () => {
    expect(milestones(results(4), makeSnapshot())).toEqual([])
  })
})
