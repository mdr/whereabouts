// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { flagCode } from "@whereabouts/shared/ids"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import { AnswerType, ClueType, FeatureType, QuestionType, Surface } from "@whereabouts/shared/questions"
import type { PaintController } from "./paint-controller"
import { areaAnswerView, makeFlagQuestion, makeQuestionView } from "./test-view"
import type { RevealedAnswer } from "./round"
import { answerModeText, vrReveal, vrRound, vrScoreLine, type VrRoundShown, type VrScore } from "./vr-round"

function painted(flag: string, label: string, share: number): PaintedCountry {
  return { country: makeFlagQuestion(flag, label), share }
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
    expect(answerModeText({ type: QuestionType.FLAG, answer: areaAnswerView("peru") })).toBe(
      "Paint the whole country: its shape counts."
    )
    expect(answerModeText({ type: QuestionType.FLAG, answer: { type: AnswerType.POINT, toleranceKm: 20 } })).toBe(
      "Paint where it is: a place, not a shape."
    )
  })

  it("names what to cover on an area round, and says nothing for a place", () => {
    expect(
      answerModeText({
        type: QuestionType.FEATURE,
        feature: FeatureType.LAKE,
        answer: areaAnswerView("lake-baikal", 100, Surface.WATER)
      })
    ).toBe("Cover the whole lake: its shape counts.")
    expect(answerModeText(makeQuestionView())).toBeUndefined()
  })
})

const place = makeQuestionView()
const answer: RevealedAnswer = { label: "Kyoto", answer: { lat: 35, lon: 135.8 }, photo: "Kyoto.jpg" }

function shown(over: Partial<VrRoundShown> = {}): VrRoundShown {
  return { question: place, revealed: undefined, fact: undefined, ...over }
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
    const peru = makeQuestionView({
      type: QuestionType.COUNTRY,
      answer: areaAnswerView("peru"),
      countryFlag: flagCode("pe")
    })
    expect(round(shown({ question: peru })).picture).toEqual({ flag: "pe" })
  })

  it("trims land on a lake or a sea", () => {
    const feature = (outline: string, surface: Surface) =>
      makeQuestionView({ type: QuestionType.FEATURE, answer: areaAnswerView(outline, 100, surface) })
    expect(round(shown({ question: feature("sea-baltic", Surface.WATER) })).water).toBe(true)
    expect(round(shown({ question: feature("island-borneo", Surface.LAND) })).water).toBe(false)
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
    const flagRound = shown({
      question: makeQuestionView({ type: QuestionType.FLAG, clue: { type: ClueType.FLAG, flag: flagCode("tv") } })
    })
    expect(vrReveal(flagRound, answer, score(), undefined, own).flags).toMatchObject({ pins: undefined })
    expect(vrReveal(shown(), answer, score(), undefined, own).flags).toBeUndefined()
  })
})
