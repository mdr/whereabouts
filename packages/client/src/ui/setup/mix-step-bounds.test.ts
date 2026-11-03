import { describe, expect, it } from "vite-plus/test"
import { MAX_ROUNDS, mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { mixStepBounds } from "./mix-step-bounds"

const { LANDMARK, PLACE, FLAG } = QuestionType

describe("mixStepBounds", () => {
  it("lets the only type with rounds go no lower than one", () => {
    expect(mixStepBounds(mixOf({ [LANDMARK]: 5 }), LANDMARK)).toEqual({ min: 1, max: MAX_ROUNDS })
  })

  it("lets a type go to none while another has rounds", () => {
    expect(mixStepBounds(mixOf({ [LANDMARK]: 3, [PLACE]: 2 }), LANDMARK).min).toBe(0)
  })

  it("leaves a type with none only the room the other rounds leave", () => {
    expect(mixStepBounds(mixOf({ [LANDMARK]: 5 }), FLAG)).toEqual({ min: 0, max: MAX_ROUNDS - 5 })
  })

  it("stops a type where the game reaches the most rounds", () => {
    expect(mixStepBounds(mixOf({ [LANDMARK]: 10, [PLACE]: 5 }), LANDMARK).max).toBe(10)
    expect(mixStepBounds(mixOf({ [LANDMARK]: 10, [PLACE]: 5 }), PLACE).max).toBe(5)
  })
})
