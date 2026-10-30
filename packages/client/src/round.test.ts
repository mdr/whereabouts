// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { regionId } from "@whereabouts/shared/ids"
import type { QuestionView } from "@whereabouts/shared/protocol"
import { frameReveal, showAnswer, type RevealedAnswer } from "./round"

const place: QuestionView = { prompt: "Where is Kyoto?", toleranceKm: 50 }
const country: QuestionView = { prompt: "Paint the whole of Peru", toleranceKm: 200, regionId: regionId("peru") }
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

function revealed(over: Partial<RevealedAnswer> = {}): RevealedAnswer {
  return { label: "Somewhere", answer: { lat: 35, lon: 135.8 }, ...over }
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
    const a = revealed({ outline })
    frameReveal(map, country, a, paint)
    expect(map.fitRegionAndPaint).toHaveBeenCalledWith(a.answer, outline, paint, 200)
  })
})

describe("showAnswer", () => {
  it("marks a place's answer", () => {
    const map = fakeMap()
    showAnswer(map, place, revealed())
    expect(map.showReveal).toHaveBeenCalled()
  })

  it("outlines a country", () => {
    const map = fakeMap()
    showAnswer(map, country, revealed({ outline }))
    expect(map.showRegionReveal).toHaveBeenCalledWith(outline)
  })

  it("shows nothing for a country until its outline loads, rather than a misleading point", () => {
    const map = fakeMap()
    showAnswer(map, country, revealed())
    expect(map.clearReveal).toHaveBeenCalled()
    expect(map.showReveal).not.toHaveBeenCalled()
  })
})
