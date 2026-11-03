import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import { flagCode } from "@whereabouts/shared/ids"
import { flagRatio } from "../../flags/flags"
import { flagShape } from "./flag-url"

describe("flagShape", () => {
  it("takes each flag's own shape: Nepal's is taller than wide, Switzerland's square, Qatar's the widest", () => {
    expect(flagShape(flagCode("np"))).toEqual({ "--flag-ratio": String(flagRatio(flagCode("np"))) })
    expect(Number(flagShape(flagCode("np"))["--flag-ratio"])).toBeCloseTo(0.8203, 4)
    expect(flagShape(flagCode("ch"))["--flag-ratio"]).toBe("1")
    expect(Number(flagShape(flagCode("qa"))["--flag-ratio"])).toBeCloseTo(2.5455, 4)
  })

  it("is set for every flag", () => {
    for (const question of CATALOGUE.filter(isFlagQuestion)) {
      expect(Number(flagShape(question.clue.flag)["--flag-ratio"]), question.clue.flag).toBeGreaterThan(0)
    }
  })
})
