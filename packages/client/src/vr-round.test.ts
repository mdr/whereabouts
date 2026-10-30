// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { flagCode, questionId, regionId } from "@whereabouts/shared/ids"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { QuestionView } from "@whereabouts/shared/protocol"
import type { PaintController } from "./paint-controller"
import type { RevealedAnswer } from "./round"
import { answerModeText, vrReveal, vrRound, vrScoreLine, type VrRoundShown, type VrScore } from "./vr-round"

function painted(flag: string, label: string, share: number): PaintedCountry {
  return {
    country: {
      id: questionId(`flag-${flag}`),
      flag: flagCode(flag),
      label,
      wiki: label,
      answer: { lat: 0, lon: 0 },
      toleranceKm: 100
    },
    share
  }
}

function score(over: Partial<VrScore> = {}): VrScore {
  return { score: 640, passed: false, total: 1500, painted: undefined, ...over }
}

describe("vrScoreLine", () => {
  it("gives this round's score and the total", () => {
    expect(vrScoreLine(score(), undefined)).toBe("640 pts this round, 1,500 pts in all")
  })

  it("says so for a pass", () => {
    expect(vrScoreLine(score({ score: 250, passed: true }), undefined)).toBe(
      "Passed: 250 pts this round, 1,500 pts in all"
    )
  })

  it("says where a flag round's paint mostly was, and whether that was the answer", () => {
    const peru = painted("pe", "Peru", 0.62)
    expect(vrScoreLine(score({ painted: peru }), flagCode("bo"))).toBe(
      "640 pts this round, 1,500 pts in all. Your paint: 62% in Peru"
    )
    expect(vrScoreLine(score({ painted: peru }), flagCode("pe"))).toBe(
      "640 pts this round, 1,500 pts in all. Your paint: 62% in Peru, the answer"
    )
  })

  it("is for sitting out, with no score", () => {
    expect(vrScoreLine(undefined, undefined)).toBe("You sat this one out")
  })
})

describe("answerModeText", () => {
  it("tells a whole country from a place on a flag round", () => {
    expect(answerModeText({ flag: flagCode("pe"), regionId: regionId("peru") })).toBe(
      "Paint the whole country: its shape counts."
    )
    expect(answerModeText({ flag: flagCode("tv") })).toBe("Paint where it is: a place, not a shape.")
  })

  it("names what to cover on an area round, and says nothing for a place", () => {
    expect(answerModeText({ regionId: regionId("lake-baikal"), topic: "lake" })).toBe(
      "Cover the whole lake: its shape counts."
    )
    expect(answerModeText({})).toBeUndefined()
  })
})

const place: QuestionView = { prompt: "Where is Kyoto?", toleranceKm: 50 }
const answer: RevealedAnswer = { label: "Kyoto", answer: { lat: 35, lon: 135.8 }, photo: "Kyoto.jpg" }

function shown(over: Partial<VrRoundShown> = {}): VrRoundShown {
  return { question: place, countryFlag: undefined, revealed: undefined, fact: undefined, ...over }
}

function round(s: VrRoundShown) {
  return vrRound(s, {
    paint: {} as PaintController,
    detail: "political",
    hint: undefined,
    hintsLeft: "unlimited",
    useHint: () => {},
    doneLabel: "Submit",
    done: () => {},
    playing: true
  })
}

describe("vrRound", () => {
  it("shows the answer's photo only at the reveal, with the fact on its back", () => {
    expect(round(shown()).picture).toBeUndefined()
    const fact = { kind: "fame" as const, text: "Old capital", source: "Kyoto" }
    expect(round(shown({ revealed: answer, fact })).picture).toEqual({
      photo: "Kyoto.jpg",
      postcard: { place: "Kyoto", text: "Old capital" }
    })
  })

  it("shows a country round's own flag", () => {
    const peru = { prompt: "Paint the whole of Peru", toleranceKm: 200, regionId: regionId("peru") }
    expect(round(shown({ question: peru, countryFlag: flagCode("pe") })).picture).toEqual({ flag: "pe" })
  })

  it("trims land on a lake or a sea", () => {
    expect(round(shown({ question: { ...place, topic: "sea" } })).water).toBe(true)
    expect(round(shown({ question: { ...place, topic: "island" } })).water).toBe(false)
  })
})

describe("vrReveal", () => {
  const own = { actions: [] }

  it("outlines an answer with an outline, and marks one without", () => {
    const outline = [
      [
        [
          [-75, -10],
          [-70, -10],
          [-70, -5],
          [-75, -10]
        ]
      ]
    ]
    expect(vrReveal(shown(), { ...answer, outline }, score(), undefined, own).answer).toEqual({ outline })
    expect(vrReveal(shown(), answer, score(), undefined, own).answer).toEqual({ point: answer.answer })
  })

  it("offers every country's flag on a flag round only", () => {
    const flagRound = shown({ question: { ...place, flag: flagCode("tv") } })
    expect(vrReveal(flagRound, answer, score(), undefined, own).flags).toMatchObject({ pins: undefined })
    expect(vrReveal(shown(), answer, score(), undefined, own).flags).toBeUndefined()
  })
})
