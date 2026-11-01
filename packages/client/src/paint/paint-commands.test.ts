import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { LandMask, WaterMask } from "@whereabouts/shared/paint/land"
import { resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { latLngToCell, type H3Cell } from "@whereabouts/shared/h3"
import { HintAxis } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Km } from "@whereabouts/shared/units"
import { PaintModel } from "./paint-model"
import { clearPaint, trimPaint, trimPaintToHint } from "./paint-commands"
import { loadLandMask, loadWaterMask } from "../data/land"

const play = vi.hoisted(() => vi.fn())
vi.mock("../sound/sound", () => ({ sound: { play } }))
vi.mock("../data/land", () => ({ loadLandMask: vi.fn(), loadWaterMask: vi.fn() }))

const TOLERANCE: Km = 100
const RESOLUTION = resolutionForTolerance(TOLERANCE)
const PARIS: LatLon = { lat: 48.86, lon: 2.35 }
const MADRID: LatLon = { lat: 40.42, lon: -3.7 }
const cellAt = ({ lat, lon }: LatLon): H3Cell => latLngToCell(lat, lon, RESOLUTION)

function makeModel(...at: LatLon[]): PaintModel {
  const model = new PaintModel()
  model.reset(TOLERANCE)
  model.restore(Object.fromEntries(at.map((point) => [cellAt(point), 1])))
  return model
}

beforeEach(() => vi.clearAllMocks())

describe("clearPaint", () => {
  it("wipes the paint with a whoosh", () => {
    const model = makeModel(PARIS)
    clearPaint(model)
    expect(model.layer.isEmpty).toBe(true)
    expect(play).toHaveBeenCalledWith("clear")
  })

  it("makes no sound with nothing to wipe", () => {
    clearPaint(makeModel())
    expect(play).not.toHaveBeenCalled()
  })
})

describe("trimPaint", () => {
  it("trims the sea with the land mask, saying how much went", async () => {
    vi.mocked(loadLandMask).mockResolvedValue(new LandMask({ resolution: RESOLUTION, cells: [cellAt(PARIS)] }))
    const model = makeModel(PARIS, MADRID)
    expect(await trimPaint(model, false)).toMatch(/^Trimmed \d+%$/)
    expect([...model.layer.cells.keys()]).toEqual([cellAt(PARIS)])
    expect(play).toHaveBeenCalledWith("clear")
  })

  it("says so, silently, when nothing is at sea", async () => {
    vi.mocked(loadLandMask).mockResolvedValue(new LandMask({ resolution: RESOLUTION, cells: [cellAt(PARIS)] }))
    expect(await trimPaint(makeModel(PARIS), false)).toBe("None at sea")
    expect(play).not.toHaveBeenCalled()
  })

  it("trims the land with the water mask in a lake or sea round", async () => {
    vi.mocked(loadWaterMask).mockResolvedValue(new WaterMask({ resolution: RESOLUTION, dry: [] }))
    expect(await trimPaint(makeModel(PARIS), true)).toBe("None on land")
    expect(loadLandMask).not.toHaveBeenCalled()
  })

  it("asks for another try when the mask won't load", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.mocked(loadLandMask).mockRejectedValue(new Error("offline"))
    expect(await trimPaint(makeModel(PARIS), false)).toBe("Try again")
  })
})

describe("trimPaintToHint", () => {
  it("keeps the paint inside the band", () => {
    const model = makeModel(PARIS, MADRID)
    expect(trimPaintToHint(model, { axis: HintAxis.LATITUDE, from: 45, to: 55 })).toMatch(/^Trimmed \d+%$/)
    expect([...model.layer.cells.keys()]).toEqual([cellAt(PARIS)])
  })

  it("says so when nothing is outside", () => {
    expect(trimPaintToHint(makeModel(PARIS), { axis: HintAxis.LATITUDE, from: 45, to: 55 })).toBe("None outside")
  })
})
