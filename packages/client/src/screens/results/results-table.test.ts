import { describe, expect, it } from "vite-plus/test"
import { colourCss, playerColour } from "@whereabouts/shared/colours"
import { outlineId, playerId, playerName } from "@whereabouts/shared/ids"
import { PictureType, type PlayedRound } from "@whereabouts/shared/protocol/views"
import { FeatureType, QuestionType } from "@whereabouts/shared/questions"
import { makeStanding } from "../../test-view"
import { awardParts, bestScores, roundsFit, roundWinners, typeName } from "./results-table"

const alice = makeStanding({ rounds: [{ score: 800 }, { score: 700 }] })
const bob = makeStanding({
  playerId: playerId("p2"),
  name: playerName("Bob"),
  colour: playerColour(1),
  rounds: [{ score: 500 }, { score: 750 }]
})

describe("bestScores", () => {
  it("takes each round's top score", () => {
    expect(bestScores(2, [alice, bob])).toEqual([800, 750])
  })

  it("ignores a player who sat a round out", () => {
    const lateJoiner = makeStanding({ playerId: playerId("p3"), rounds: [] })
    expect(bestScores(2, [alice, lateJoiner])).toEqual([800, 700])
  })

  it("is -1 for a round nobody scored in", () => {
    expect(bestScores(1, [])).toEqual([-1])
  })
})

describe("roundWinners", () => {
  it("lists those on the round's best, in finishing order", () => {
    const best = bestScores(2, [alice, bob])
    expect(roundWinners([alice, bob], 0, best)).toEqual([alice])
    expect(roundWinners([alice, bob], 1, best)).toEqual([bob])
  })

  it("lists every player on a tie", () => {
    const twin = makeStanding({ playerId: playerId("p3"), rounds: [{ score: 800 }] })
    expect(roundWinners([alice, twin, bob], 0, [800, 750])).toEqual([alice, twin])
  })
})

describe("roundsFit", () => {
  it("needs a round column and 58 px a player", () => {
    expect(roundsFit(200 + 4 * 58, 4)).toBe(true)
    expect(roundsFit(200 + 4 * 58 - 1, 4)).toBe(false)
  })

  it("assumes up to six players fit before the width is known", () => {
    expect(roundsFit(undefined, 6)).toBe(true)
    expect(roundsFit(undefined, 7)).toBe(false)
  })
})

describe("typeName", () => {
  it("names a round by its question type", () => {
    const round: PlayedRound = { type: QuestionType.FLAG, label: "Turkey", picture: { type: PictureType.NONE } }
    expect(typeName(round)).toBe("Flag")
  })

  it("names a feature round by its feature", () => {
    const round: PlayedRound = {
      type: QuestionType.FEATURE,
      label: "Black Sea",
      feature: FeatureType.SEA,
      picture: { type: PictureType.SHAPE, outline: outlineId("sea-black-sea"), centre: { lat: 43.4, lon: 34.3 } }
    }
    expect(typeName(round)).toBe("Sea")
  })
})

describe("awardParts", () => {
  it("puts each player's name in their colour where the line has {n}", () => {
    expect(awardParts("{0} passed 2 times. Brave.", [bob])).toEqual([
      { text: "Bob", colour: colourCss(bob.colour) },
      { text: " passed 2 times. Brave." }
    ])
  })

  it("fills several players in order", () => {
    expect(awardParts("{1} beat {0}", [alice, bob]).map((part) => part.text)).toEqual(["Bob", " beat ", "Alice"])
  })

  it("says Someone, uncoloured, for a player it can't find", () => {
    expect(awardParts("{0} won", [undefined])).toEqual([{ text: "Someone", colour: undefined }, { text: " won" }])
  })
})
