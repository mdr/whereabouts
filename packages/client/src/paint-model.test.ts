import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { FILL_DENSITY } from "@whereabouts/shared/fill"
import { LandMask } from "@whereabouts/shared/land"
import { resolutionForTolerance } from "@whereabouts/shared/paint"
import { cellToChildren, finerRes, latLngToCell, type H3Cell } from "@whereabouts/shared/h3"
import { flagCode, questionId } from "@whereabouts/shared/ids"
import type { FlagQuestion } from "@whereabouts/shared/flags"
import type { LatLon } from "@whereabouts/shared/geo"
import { FILL_SMALL_PX, PaintModel, type Filler } from "./paint-model"

const TOLERANCE_KM = 100
const RES = resolutionForTolerance(TOLERANCE_KM)
const PARIS: LatLon = { lat: 48.86, lon: 2.35 }
const MADRID: LatLon = { lat: 40.42, lon: -3.7 }

function makeModel(): PaintModel {
  const model = new PaintModel()
  model.reset(TOLERANCE_KM)
  return model
}

function makeCountry(overrides: Partial<FlagQuestion> = {}): FlagQuestion {
  return {
    id: questionId("flag-fr"),
    flag: flagCode("fr"),
    label: "France",
    wiki: "Flag of France",
    answer: PARIS,
    toleranceKm: TOLERANCE_KM,
    ...overrides
  }
}

/** A filler that finds France everywhere, filled with the cell at its answer. */
function makeFiller(overrides: Partial<Filler> = {}): Filler {
  return {
    countryAt: vi.fn(() => makeCountry()),
    outline: () => ({ type: "MultiPolygon", coordinates: [] }),
    cells: (f, res) => [latLngToCell(f.answer.lat, f.answer.lon, res)],
    ...overrides
  }
}

const cellAt = ({ lat, lon }: LatLon): H3Cell => latLngToCell(lat, lon, RES)

function paintStroke(model: PaintModel, ...at: LatLon[]): void {
  model.beginStroke("paint")
  for (const p of at) model.stamp(p, 20, 1)
  model.endStroke()
}

function cells(model: PaintModel): Map<H3Cell, number> {
  return new Map(model.layer.cells)
}

describe("PaintModel", () => {
  afterEach(() => void vi.useRealTimers())

  describe("undo and redo", () => {
    it("has nothing to undo or redo at first", () => {
      const model = makeModel()
      expect(model.canUndo.value).toBe(false)
      expect(model.canRedo.value).toBe(false)
    })

    it("undoes a whole stroke, every stamp at once, and redoes it", () => {
      const model = makeModel()
      paintStroke(model, PARIS, { lat: 49, lon: 2.5 })
      const painted = cells(model)

      model.undo()
      expect(model.layer.isEmpty).toBe(true)
      expect(model.canUndo.value).toBe(false)
      expect(model.canRedo.value).toBe(true)

      model.redo()
      expect(cells(model)).toEqual(painted)
      expect(model.canUndo.value).toBe(true)
      expect(model.canRedo.value).toBe(false)
    })

    it("steps back stroke by stroke", () => {
      const model = makeModel()
      paintStroke(model, PARIS)
      const first = cells(model)
      paintStroke(model, MADRID)

      model.undo()
      expect(cells(model)).toEqual(first)
      model.undo()
      expect(model.layer.isEmpty).toBe(true)
    })

    it("forgets what could be redone once something new is painted", () => {
      const model = makeModel()
      paintStroke(model, PARIS)
      model.undo()
      paintStroke(model, MADRID)
      expect(model.canRedo.value).toBe(false)
      model.redo()
      expect(model.layer.cells.has(cellAt(PARIS))).toBe(false)
    })

    it("keeps the last 50 steps", () => {
      const model = makeModel()
      for (let i = 0; i < 51; i++) paintStroke(model, { lat: i, lon: 0 })
      for (let i = 0; i < 50; i++) model.undo()
      expect(model.canUndo.value).toBe(false)
      expect(model.layer.cells.has(cellAt({ lat: 0, lon: 0 }))).toBe(true)
      expect(model.layer.cells.has(cellAt({ lat: 1, lon: 0 }))).toBe(false)
    })

    it("takes back an abandoned stroke, leaving nothing to redo", () => {
      const model = makeModel()
      paintStroke(model, MADRID)
      const before = cells(model)
      model.beginStroke("paint")
      model.stamp(PARIS, 20, 1)

      model.abandonStroke()
      expect(cells(model)).toEqual(before)
      expect(model.stroking.value).toBeUndefined()
      expect(model.canRedo.value).toBe(false)
      expect(model.canUndo.value).toBe(true)
    })

    it("undoes a clear, but makes no step clearing nothing", () => {
      const model = makeModel()
      model.clear()
      expect(model.canUndo.value).toBe(false)

      paintStroke(model, PARIS)
      const painted = cells(model)
      model.clear()
      expect(model.layer.isEmpty).toBe(true)
      model.undo()
      expect(cells(model)).toEqual(painted)
    })
  })

  describe("strokes", () => {
    it("says which tool is stroking, until the stroke ends", () => {
      const model = makeModel()
      model.beginStroke("erase")
      expect(model.stroking.value).toBe("erase")
      model.endStroke()
      expect(model.stroking.value).toBeUndefined()
    })

    it("erases with a negative strength", () => {
      const model = makeModel()
      paintStroke(model, PARIS)
      model.beginStroke("erase")
      model.stamp(PARIS, 40, -10)
      expect(model.layer.cells.has(cellAt(PARIS))).toBe(false)
    })
  })

  describe("the Fill tool", () => {
    it("is offered only with countries to fill with", () => {
      const model = makeModel()
      model.offerFill(true)
      expect(model.fillable.value).toBe(false)

      model.useFiller(makeFiller())
      model.offerFill(true)
      expect(model.fillable.value).toBe(true)
      model.offerFill(false)
      expect(model.fillable.value).toBe(false)
    })

    it("keeps the first countries it is given", () => {
      const model = makeModel()
      const first = makeFiller()
      model.useFiller(first)
      model.useFiller(makeFiller())
      model.fillAt(PARIS, 1)
      expect(first.countryAt).toHaveBeenCalled()
    })

    it("fills a country with an even coat, and takes it off again", () => {
      const model = makeModel()
      const france = makeCountry()
      model.useFiller(makeFiller())

      model.fillAt(PARIS, 1)
      expect(cells(model)).toEqual(new Map([[cellAt(PARIS), FILL_DENSITY]]))
      expect(model.isFilled(france)).toBe(true)

      model.fillAt(PARIS, 1)
      expect(model.layer.isEmpty).toBe(true)
      expect(model.isFilled(france)).toBe(false)
    })

    it("leaves paint under a fill when the fill comes off", () => {
      const model = makeModel()
      model.useFiller(makeFiller())
      paintStroke(model, PARIS)
      const painted = cells(model)
      model.fillAt(PARIS, 1)
      model.fillAt(PARIS, 1)
      expect([...model.layer.cells.keys()].sort()).toEqual([...painted.keys()].sort())
    })

    it("undoes a fill, and remembers the country is no longer filled", () => {
      const model = makeModel()
      const france = makeCountry()
      model.useFiller(makeFiller())
      model.fillAt(PARIS, 1)

      model.undo()
      expect(model.layer.isEmpty).toBe(true)
      expect(model.isFilled(france)).toBe(false)
      // So the next click fills it again rather than taking off a coat that isn't there.
      model.fillAt(PARIS, 1)
      expect(model.isFilled(france)).toBe(true)
      expect(model.layer.isEmpty).toBe(false)
    })

    it("does nothing at sea", () => {
      const model = makeModel()
      model.useFiller(makeFiller({ countryAt: () => undefined }))
      model.fillAt({ lat: 45, lon: -30 }, 1)
      expect(model.layer.isEmpty).toBe(true)
      expect(model.canUndo.value).toBe(false)
    })

    it("does nothing without countries", () => {
      const model = makeModel()
      model.fillAt(PARIS, 1)
      expect(model.layer.isEmpty).toBe(true)
    })

    it("counts a small country within FILL_SMALL_PX pixels of the point", () => {
      const model = makeModel()
      const filler = makeFiller()
      model.useFiller(filler)
      model.fillAt(PARIS, 2)
      expect(filler.countryAt).toHaveBeenLastCalledWith(PARIS, 2, FILL_SMALL_PX)
    })

    it("from outside the map, counts a small country within a distance", () => {
      const model = makeModel()
      const filler = makeFiller()
      model.useFiller(filler)
      model.fillOutside(PARIS, 60)
      expect(filler.countryAt).toHaveBeenLastCalledWith(PARIS, 60 / FILL_SMALL_PX, FILL_SMALL_PX)
      expect(model.layer.isEmpty).toBe(false)
    })
  })

  describe("trims", () => {
    const parisLand = () => new LandMask({ res: RES, cells: [cellAt(PARIS)] })

    it("drops the paint off the land as one step, saying how much went", () => {
      const model = makeModel()
      model.restore({ [cellAt(PARIS)]: 1, [cellAt(MADRID)]: 1 })

      const share = model.trimSea(parisLand())
      expect(share).toBeGreaterThan(0.4)
      expect(share).toBeLessThan(0.6)
      expect([...model.layer.cells.keys()]).toEqual([cellAt(PARIS)])

      model.undo()
      expect(model.layer.cells.has(cellAt(MADRID))).toBe(true)
    })

    it("makes no step when nothing is trimmed", () => {
      const model = makeModel()
      model.restore({ [cellAt(PARIS)]: 1 })
      expect(model.trimSea(parisLand())).toBe(0)
      expect(model.canUndo.value).toBe(false)
    })

    it("drops the paint outside a hint's band", () => {
      const model = makeModel()
      model.restore({ [cellAt(PARIS)]: 1, [cellAt(MADRID)]: 1 })
      expect(model.trimToHint({ axis: "latitude", from: 45, to: 55 })).toBeGreaterThan(0)
      expect([...model.layer.cells.keys()]).toEqual([cellAt(PARIS)])
    })
  })

  describe("restore", () => {
    it("replaces the paint, leaving nothing to undo or redo", () => {
      const model = makeModel()
      paintStroke(model, MADRID)
      paintStroke(model, MADRID)
      model.undo()

      model.restore({ [cellAt(PARIS)]: 0.5 })
      expect(cells(model)).toEqual(new Map([[cellAt(PARIS), 0.5]]))
      expect(model.canUndo.value).toBe(false)
      expect(model.canRedo.value).toBe(false)
    })

    it("drops cells finer than the layer", () => {
      const model = makeModel()
      const [finer] = cellToChildren(cellAt(PARIS), finerRes(RES))
      model.restore({ [finer!]: 1 })
      expect(model.layer.isEmpty).toBe(true)
    })

    it("forgets what was filled", () => {
      const model = makeModel()
      const france = makeCountry()
      model.useFiller(makeFiller())
      model.fillAt(PARIS, 1)
      model.restore({})
      expect(model.isFilled(france)).toBe(false)
    })
  })

  describe("reset", () => {
    it("starts empty at the question's resolution, with no history", () => {
      const model = makeModel()
      paintStroke(model, PARIS)
      model.reset(10)
      expect(model.layer.isEmpty).toBe(true)
      expect(model.layer.res).toBe(resolutionForTolerance(10))
      expect(model.toleranceKm.value).toBe(10)
      expect(model.canUndo.value).toBe(false)
    })
  })

  describe("version", () => {
    it("moves with every change", () => {
      const model = makeModel()
      model.useFiller(makeFiller())
      const changes: (() => void)[] = [
        () => paintStroke(model, PARIS),
        () => model.undo(),
        () => model.redo(),
        () => model.fillAt(PARIS, 1),
        () => model.clear(),
        () => model.restore({ [cellAt(MADRID)]: 1 }),
        () => model.trimToHint({ axis: "latitude", from: 45, to: 55 }),
        () => model.reset(TOLERANCE_KM)
      ]
      for (const change of changes) {
        const before = model.version.value
        change()
        expect(model.version.value).toBeGreaterThan(before)
      }
    })

    it("stays put when nothing changes", () => {
      const model = makeModel()
      const before = model.version.value
      model.undo()
      model.clear()
      expect(model.version.value).toBe(before)
    })

    it("settles 200 ms after the last change", () => {
      vi.useFakeTimers()
      const model = makeModel()
      paintStroke(model, PARIS)
      vi.advanceTimersByTime(150)
      paintStroke(model, MADRID)
      vi.advanceTimersByTime(150)
      expect(model.settledVersion.value).not.toBe(model.version.value)
      vi.advanceTimersByTime(50)
      expect(model.settledVersion.value).toBe(model.version.value)
      model.dispose()
    })
  })
})
