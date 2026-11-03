import { describe, expect, it } from "vite-plus/test"
import { HintAxis } from "../../hints.ts"
import { mixOf } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { QuestionType } from "../../questions.ts"
import { playerName } from "../../ids.ts"
import { YouRoleType } from "../../roles.ts"
import { T0, viewOf, tokA, makeGame } from "./support.ts"

describe("unlimited hints", () => {
  it("allow a hint every round beyond any cap, but only one per round", () => {
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.PLACE]: 3 }), hints: undefined } })
    game.join(tokA, playerName("Alice"), T0)
    game.start(tokA, T0)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, hintsLeft: undefined })
    for (let round = 0; round < 3; round++) {
      expect(game.hint(tokA, HintAxis.LATITUDE).ok).toBe(true)
      expect(game.hint(tokA, HintAxis.LONGITUDE)).toEqual({ ok: false, error: "one hint per round" })
      game.lock(tokA, T0)
      game.next(tokA, T0)
    }
    expect(game.phase).toBe(Phase.RESULTS)
  })
})
