// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { commonsFile, flagCode, sourceUrl, wikiTitle } from "@whereabouts/shared/ids"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import { FeatureType, Surface, type Outline } from "@whereabouts/shared/questions"
import type { PaintController } from "../../paint/paint-controller"
import {
  areaAnswerView,
  makeCountryQuestionView,
  makeFeatureQuestionView,
  makeFlagQuestion,
  makeFlagQuestionView,
  makeQuestionView
} from "../../test-view"
import { RevealedShapeType } from "../../round/revealed-shape"
import type { RevealedAnswer } from "../../round/round"
import { answerModeText, vrReveal, vrRound, vrScoreLine, type VrRoundShown, type VrScore } from "./vr-round"
import { VrPictureType } from "../picture/vr-picture"
import { HintAllowance, VrAnswerType, VrPaintsType } from "./view"
import { MapDetail } from "@whereabouts/shared/protocol/config"
import { FactType } from "@whereabouts/shared/catalogue/facts"

const painted = (flag: string, label: string, share: number): PaintedCountry => ({
  country: makeFlagQuestion(flag, label),
  share
})

const score = (over: Partial<VrScore> = {}): VrScore => ({
  score: 640,
  passed: false,
  total: 1500,
  painted: undefined,
  ...over
})

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
    expect(answerModeText(makeFlagQuestionView("pe", areaAnswerView("peru")))).toBe(
      "Paint the whole country: its shape counts."
    )
    expect(answerModeText(makeFlagQuestionView("pe"))).toBe("Paint where it is: a place, not a shape.")
  })

  it("names what to cover on an area round, and says nothing for a place", () => {
    expect(answerModeText(makeFeatureQuestionView(FeatureType.LAKE, "lake-baikal", Surface.WATER))).toBe(
      "Cover the whole lake: its shape counts."
    )
    expect(answerModeText(makeQuestionView())).toBeUndefined()
  })
})

const place = makeQuestionView()
const answer: RevealedAnswer = {
  label: "Kyoto",
  wiki: wikiTitle("Kyoto"),
  answer: { lat: 35, lon: 135.8 },
  shape: { type: RevealedShapeType.POINT },
  photo: commonsFile("Kyoto.jpg")
}

const shown = (over: Partial<VrRoundShown> = {}): VrRoundShown => ({
  question: place,
  revealed: undefined,
  fact: undefined,
  ...over
})

const round = (shown: VrRoundShown) =>
  vrRound(shown, {
    paint: {} as PaintController,
    detail: MapDetail.POLITICAL,
    hint: undefined,
    hintsLeft: HintAllowance.UNLIMITED,
    useHint: () => {},
    doneLabel: "Submit",
    done: () => {},
    playing: true
  })

describe("vrRound", () => {
  it("shows the answer's photo only at the reveal, with the fact on its back", () => {
    expect(round(shown()).picture).toBeUndefined()
    const fact = { type: FactType.FAME, text: "Old capital", source: sourceUrl("https://en.wikipedia.org/wiki/Kyoto") }
    expect(round(shown({ revealed: answer, fact })).picture).toEqual({
      type: VrPictureType.PHOTO,
      photo: "Kyoto.jpg",
      postcard: { place: "Kyoto", text: "Old capital" }
    })
  })

  it("shows a country round's own flag", () => {
    const peru = makeCountryQuestionView({ countryFlag: flagCode("pe") })
    expect(round(shown({ question: peru })).picture).toEqual({ type: VrPictureType.FLAG, flag: "pe" })
  })

  it("trims land on a lake or a sea", () => {
    const sea = makeFeatureQuestionView(FeatureType.SEA, "sea-baltic", Surface.WATER)
    const island = makeFeatureQuestionView(FeatureType.ISLAND, "island-borneo")
    expect(round(shown({ question: sea })).water).toBe(true)
    expect(round(shown({ question: island })).water).toBe(false)
  })
})

describe("vrReveal", () => {
  const own = { actions: [], paints: { type: VrPaintsType.OWN } as const }

  it("outlines an answer with an outline, and marks one without", () => {
    const outline: Outline = [
      [
        [
          [-75, -10],
          [-70, -10],
          [-70, -5],
          [-75, -10]
        ]
      ]
    ]
    const area = (outline: Outline | undefined): RevealedAnswer => ({
      ...answer,
      shape: { type: RevealedShapeType.AREA, outline, disputed: undefined }
    })
    expect(vrReveal(shown(), area(outline), score(), undefined, own).answer).toEqual({
      type: VrAnswerType.OUTLINE,
      outline,
      disputed: undefined
    })
    expect(vrReveal(shown(), answer, score(), undefined, own).answer).toEqual({
      type: VrAnswerType.POINT,
      point: answer.answer
    })
  })

  it("shows no answer for an area until its outline loads, rather than a pin at its centre", () => {
    const loading: RevealedAnswer = {
      ...answer,
      shape: { type: RevealedShapeType.AREA, outline: undefined, disputed: undefined }
    }
    expect(vrReveal(shown(), loading, score(), undefined, own).answer).toBeUndefined()
  })

  it("offers every country's flag on a flag round only", () => {
    const flagRound = shown({
      question: makeFlagQuestionView("tv")
    })
    expect(vrReveal(flagRound, answer, score(), undefined, own).flags).toMatchObject({ pins: undefined })
    expect(vrReveal(shown(), answer, score(), undefined, own).flags).toBeUndefined()
  })
})

describe("the headset's reveal line on a flag round", () => {
  const own = { actions: [], paints: { type: VrPaintsType.OWN } as const }
  const fact = {
    type: FactType.FLAG,
    text: "Adopted in 1945",
    source: sourceUrl("https://en.wikipedia.org/wiki/Flag_of_Indonesia")
  }
  const indonesia = shown({ question: makeFlagQuestionView("id"), fact })

  it("tells the flags apart when the paint was in a look-alike", () => {
    const you = score({ painted: painted("pl", "Poland", 0.8) })
    expect(vrReveal(indonesia, answer, you, undefined, own).fact).toBe(
      "Poland: White over red. Indonesia: Red over white, and longer."
    )
  })

  it("gives the fact otherwise", () => {
    for (const you of [score({ painted: painted("id", "Indonesia", 0.8) }), score(), undefined])
      expect(vrReveal(indonesia, answer, you, undefined, own).fact).toBe("Adopted in 1945")
  })
})
