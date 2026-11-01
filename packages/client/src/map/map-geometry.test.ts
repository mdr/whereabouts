import { describe, expect, it } from "vite-plus/test"
import { HintAxis } from "@whereabouts/shared/hints"
import { bounds, boxAround, hintFeatures, MAX_LAT, MIN_LAT, toleranceBox } from "./map-geometry"
import type { Box, Ring } from "@whereabouts/shared/geo"
import type { Km } from "@whereabouts/shared/units"

function polygon(ring: Ring, ...holes: Ring[]): GeoJSON.Feature {
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring, ...holes] } }
}

function ringOf(feature: GeoJSON.Feature): number[][] {
  return (feature.geometry as GeoJSON.Polygon).coordinates[0]!
}

const START: Box = [0, 0, 10, 10]

describe("boxAround", () => {
  it("returns the input box when there are no polygons", () => {
    expect(boxAround([], START)).toEqual(START)
  })

  it("ignores features that are not polygons", () => {
    const point: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [50, 50] }
    }
    const multi: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: [[[[60, 60]]]] }
    }
    expect(boxAround([point, multi], START)).toEqual(START)
  })

  it("uses only the outer ring", () => {
    const feature = polygon(
      [
        [1, 1],
        [2, 2]
      ],
      [[80, 80]]
    )
    expect(boxAround([feature], START)).toEqual(START)
  })

  it("grows to take in the outer ring", () => {
    const feature = polygon([
      [-5, 3],
      [12, 20]
    ])
    expect(boxAround([feature], START)).toEqual([-5, 0, 12, 20])
  })

  it("folds longitudes unwrapped past 180 back, growing west", () => {
    expect(boxAround([polygon([[190, 5]])], START)).toEqual([-170, 0, 10, 10])
  })
})

describe("hintFeatures", () => {
  it("makes a latitude band one box across the world, clamped to the tiles", () => {
    const features = hintFeatures({ axis: HintAxis.LATITUDE, from: -90, to: 40 })
    expect(features).toHaveLength(1)
    expect(ringOf(features[0]!)).toEqual([
      [-180, MIN_LAT],
      [180, MIN_LAT],
      [180, 40],
      [-180, 40],
      [-180, MIN_LAT]
    ])
  })

  it("makes a longitude band one box when it does not cross 180", () => {
    const features = hintFeatures({ axis: HintAxis.LONGITUDE, from: 10, to: 30 })
    expect(features.map((f) => ringOf(f).slice(0, 3))).toEqual([
      [
        [10, MIN_LAT],
        [30, MIN_LAT],
        [30, MAX_LAT]
      ]
    ])
  })

  it("makes a longitude band across 180 two boxes, one each side", () => {
    const features = hintFeatures({ axis: HintAxis.LONGITUDE, from: 170, to: -170 })
    expect(features.map((f) => [ringOf(f)[0]![0], ringOf(f)[1]![0]])).toEqual([
      [170, 180],
      [-180, -170]
    ])
  })
})

/** A degree of arc on the ground, to the precision these tests check. */
const KM_PER_DEGREE: Km = 111.195

describe("toleranceBox", () => {
  it("is two tolerances tall, and as wide, at the equator", () => {
    const [w, s, e, n] = toleranceBox({ lat: 0, lon: 0 }, KM_PER_DEGREE)
    expect(n - s).toBeCloseTo(4)
    expect(e - w).toBeCloseTo(4)
  })

  it("caps the width near a pole", () => {
    const [w, s, e, n] = toleranceBox({ lat: 89, lon: 0 }, KM_PER_DEGREE)
    expect((n - s) / 2).toBeCloseTo(2)
    expect((e - w) / 2).toBeCloseTo(2 / 0.2)
  })
})

describe("bounds", () => {
  it("clamps latitudes to 85", () => {
    expect(bounds([-10, -89, 10, 89])).toEqual([
      [-10, -85],
      [10, 85]
    ])
  })
})
