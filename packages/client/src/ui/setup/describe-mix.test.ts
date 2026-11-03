import { describe, expect, it } from "vite-plus/test"
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { describeMix } from "./describe-mix"

describe("describeMix", () => {
  it("lists the types a game asks, with counts, leaving out those it does not", () => {
    expect(describeMix(mixOf({ [QuestionType.LANDMARK]: 3, [QuestionType.PLACE]: 2 }))).toBe(
      "3 landmarks · 2 place names"
    )
  })

  it("uses the singular for one", () => {
    expect(describeMix(mixOf({ [QuestionType.LANDMARK]: 4, [QuestionType.FLAG]: 1 }))).toBe("4 landmarks · 1 flag")
  })
})
