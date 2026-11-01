// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { QuestionType, type Outline } from "@whereabouts/shared/questions"
import { RevealedShapeType } from "./revealed-shape"
import { frameReveal, showAnswer, type RevealedAnswer } from "./round"
import { areaAnswerView, makeQuestionView } from "../test-view"

const place = makeQuestionView()
const country = makeQuestionView({ type: QuestionType.COUNTRY, answer: areaAnswerView("peru", 200) })
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

function revealed(over: Partial<RevealedAnswer> = {}): RevealedAnswer {
  return { label: "Somewhere", answer: { lat: 35, lon: 135.8 }, shape: { type: RevealedShapeType.POINT }, ...over }
}

function fakeMap() {
  return {
    showReveal: vi.fn(),
    showRegionReveal: vi.fn(),
    clearReveal: vi.fn(),
    fitAnswerAndPaint: vi.fn(),
    fitRegionAndPaint: vi.fn()
  }
}

const paint: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

describe("frameReveal", () => {
  it("frames a place's answer together with the paint", () => {
    const map = fakeMap()
    const a = revealed()
    frameReveal(map, place, a, paint)
    expect(map.fitAnswerAndPaint).toHaveBeenCalledWith(a.answer, paint, 50)
    expect(map.fitRegionAndPaint).not.toHaveBeenCalled()
  })

  it("frames a country's outline together with the paint", () => {
    const map = fakeMap()
    const a = revealed({ shape: { type: RevealedShapeType.AREA, outline } })
    frameReveal(map, country, a, paint)
    expect(map.fitRegionAndPaint).toHaveBeenCalledWith(a.answer, outline, paint, 200)
  })
})

describe("showAnswer", () => {
  it("marks a place's answer", () => {
    const map = fakeMap()
    showAnswer(map, revealed())
    expect(map.showReveal).toHaveBeenCalled()
  })

  it("outlines a country", () => {
    const map = fakeMap()
    showAnswer(map, revealed({ shape: { type: RevealedShapeType.AREA, outline } }))
    expect(map.showRegionReveal).toHaveBeenCalledWith(outline)
  })

  it("shows nothing for a country until its outline loads, rather than a misleading point", () => {
    const map = fakeMap()
    showAnswer(map, revealed({ shape: { type: RevealedShapeType.AREA, outline: undefined } }))
    expect(map.clearReveal).toHaveBeenCalled()
    expect(map.showReveal).not.toHaveBeenCalled()
  })
})
