import { describe, expect, it } from "vite-plus/test"
import { lookalikesOf } from "@whereabouts/shared/catalogue/lookalike-flags"
import { flagCode } from "@whereabouts/shared/ids"
import { flagLabel, lookalikesHeading, mixUpText } from "./lookalike-words"

const indonesia = flagCode("id")
const poland = flagCode("pl")

describe("flagLabel", () => {
  it("names the country", () => {
    expect(flagLabel(poland)).toBe("Poland")
  })
})

describe("lookalikesHeading", () => {
  it("names the look-alike that was painted", () => {
    expect(lookalikesHeading(lookalikesOf(indonesia, poland)!)).toBe("Easy to mix up: you painted Poland")
  })

  it("is plain when the paint was right", () => {
    expect(lookalikesHeading(lookalikesOf(indonesia, indonesia)!)).toBe("Look-alike flags")
  })
})

describe("mixUpText", () => {
  it("says what marks the painted flag apart from the answer, painted first", () => {
    expect(mixUpText(lookalikesOf(indonesia, poland)!)).toBe(
      "Poland: White over red. Indonesia: Red over white, and longer."
    )
  })

  it("has nothing to say when the paint was right", () => {
    expect(mixUpText(lookalikesOf(indonesia, indonesia)!)).toBeUndefined()
  })
})
