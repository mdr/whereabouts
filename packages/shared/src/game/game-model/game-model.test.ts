import fc from "fast-check"
import { describe, expect, it } from "vite-plus/test"
import { makeGame, pool, T0 } from "../game-tests/support.ts"
import { DEFAULT_HINTS } from "../../hints.ts"
import type { Ms } from "../../units.ts"
import { ActionType, anAction, apply, describeAction, whoActs, type Action, type Real } from "./actions.ts"
import { allViews, expectInvariants, expectRecordsKept, expectSameAsModel } from "./checks.ts"
import { GameModel } from "./model.ts"

/** More for a longer hunt: MODEL_RUNS=20000. */
const RUNS = Number(process.env["MODEL_RUNS"] ?? 300)

interface Setup {
  roundLength: Ms | undefined
  hints: number | undefined
}

/** Plays the actions on a fresh game and its model, checking everything after each. */
const play = ({ roundLength, hints }: Setup, actions: Action[]): void => {
  const model = new GameModel(pool.length, roundLength, hints)
  const real: Real = {
    game: makeGame({ questions: pool, config: { roundLength, hints } }),
    now: T0,
    renames: 0
  }
  const records = new Map<string, string>()
  const done: string[] = []
  for (const action of actions) {
    done.push(
      action.type === ActionType.WAIT
        ? describeAction(action)
        : `${whoActs(action, model).slice(3, 4)}:${describeAction(action)}`
    )
    const before = allViews(real)
    const { expected, actual } = apply(action, model, real)
    try {
      if (typeof expected === "boolean") expect(actual, "tick changed something").toBe(expected)
      else if (expected.ok) expect(actual).toMatchObject(expected)
      else
        expect(actual, "refused").toMatchObject({ ok: false, ...(expected.reason ? { reason: expected.reason } : {}) })
      const unchanged = actual === false || (typeof actual === "object" && (!actual.ok || actual.changed === false))
      if (unchanged) expect(allViews(real), "nobody's view changes").toEqual(before)
      expectSameAsModel(model, real)
      expectInvariants(real)
      expectRecordsKept(model, real, records)
    } catch (error) {
      throw new Error(`after ${done.join(", ")}\n${String(error)}`, { cause: error })
    }
  }
}

const games = fc.array(anAction, { minLength: 1, maxLength: 150, size: "max" })

/** Plays RUNS random games in this setup, shrinking any that fails to its fewest steps. */
const expectAgreesWithModel = (setup: Setup): void => {
  fc.assert(
    fc.property(games, (actions) => play(setup, actions)),
    { numRuns: RUNS }
  )
}

describe("the game, against a model of its rules", () => {
  it("agrees with the model in a timed game whatever players and the clock do", () => {
    expectAgreesWithModel({ roundLength: 60_000, hints: DEFAULT_HINTS })
  }, 600_000)

  it("agrees with the model in an untimed game with unlimited hints", () => {
    expectAgreesWithModel({ roundLength: undefined, hints: undefined })
  }, 600_000)
})
