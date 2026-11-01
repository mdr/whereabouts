// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { wikiTitle } from "@whereabouts/shared/ids"
import type { Outline } from "@whereabouts/shared/questions"
import { RevealedShapeType } from "./revealed-shape"
import { frameReveal, showAnswer, type RevealedAnswer } from "./round"
import { makeCountryQuestionView, makeQuestionView } from "../test-view"

const place = makeQuestionView()
const country = makeCountryQuestionView()
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

const revealed = (over: Partial<RevealedAnswer> = {}): RevealedAnswer => ({
  label: "Somewhere",
  wiki: wikiTitle("Somewhere"),
  answer: { lat: 35, lon: 135.8 },
  shape: { type: RevealedShapeType.POINT },
  ...over
})

const fakeMap = () => ({
  showReveal: vi.fn(),
  showRegionReveal: vi.fn(),
  clearReveal: vi.fn()
})

const fakeCamera = () => ({ fitAnswerAndPaint: vi.fn(), fitRegionAndPaint: vi.fn() })

const paint: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

describe("frameReveal", () => {
  it("frames a place's answer together with the paint", () => {
    const camera = fakeCamera()
    const a = revealed()
    frameReveal(camera, place, a, paint)
    expect(camera.fitAnswerAndPaint).toHaveBeenCalledWith(a.answer, paint, 50)
    expect(camera.fitRegionAndPaint).not.toHaveBeenCalled()
  })

  it("frames a country's outline together with the paint", () => {
    const camera = fakeCamera()
    const a = revealed({ shape: { type: RevealedShapeType.AREA, outline } })
    frameReveal(camera, country, a, paint)
    expect(camera.fitRegionAndPaint).toHaveBeenCalledWith(a.answer, outline, paint, 200)
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
