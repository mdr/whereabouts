// @vitest-environment happy-dom
import { describe, expect, it, vi, type Mock } from "vite-plus/test"
import type { Map as MapLibreMap } from "maplibre-gl"
import { MapCamera, revealPadding } from "./map-camera"
import { metresPerPixel } from "./map-geometry"

describe("revealPadding", () => {
  it("leaves room for the side cards and the toolbar on a wide screen", () => {
    expect(revealPadding({ width: 1600, height: 900, phone: false, questionCardHeight: 0 })).toEqual({
      top: 40,
      bottom: 90,
      left: 340,
      right: 340
    })
  })

  it("gives a narrow window less than the cards take", () => {
    const { left, right } = revealPadding({ width: 800, height: 600, phone: false, questionCardHeight: 0 })
    expect(left).toBe(240)
    expect(right).toBe(240)
  })

  it("on a phone, fits between the question card and the sheet", () => {
    expect(revealPadding({ width: 390, height: 800, phone: true, questionCardHeight: 100 })).toEqual({
      top: 172,
      bottom: 416,
      left: 24,
      right: 24
    })
  })
})

interface FakeMap {
  map: MapLibreMap
  easeTo: Mock
  fitBounds: Mock
}

const makeFakeMap = ({ zoom = 4, centreLat = 0, fitZoom = 3 } = {}): FakeMap => {
  const container = document.createElement("div")
  Object.defineProperty(container, "clientWidth", { value: 1600 })
  Object.defineProperty(container, "clientHeight", { value: 900 })
  const easeTo = vi.fn()
  const fitBounds = vi.fn()
  const map = {
    getZoom: () => zoom,
    getMinZoom: () => 1,
    getCenter: () => ({ lat: centreLat, lng: 0 }),
    getContainer: () => container,
    getVerticalFieldOfView: () => 37,
    setProjection: vi.fn(),
    cameraForBounds: () => ({ zoom: fitZoom }),
    easeTo,
    fitBounds
  } as unknown as MapLibreMap
  return { map, easeTo, fitBounds }
}

const PARIS = { lat: 48.85, lon: 2.35 }

/** Paint as the map draws it: one small square at each point. */
const paintAt = (...points: { lat: number; lon: number }[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: points.map(({ lat, lon }) => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon, lat],
          [lon + 0.1, lat],
          [lon + 0.1, lat + 0.1],
          [lon, lat]
        ]
      ]
    }
  }))
})

describe("MapCamera", () => {
  it("measures a pixel at the pointer's latitude on the flat map, and at the view's centre on a globe", () => {
    const { map } = makeFakeMap({ zoom: 4, centreLat: 0 })
    const camera = new MapCamera(map)
    expect(camera.pixelsToKm(10, 60)).toBeCloseTo((10 * metresPerPixel(60, 4)) / 1000)
    expect(camera.pixelsToKm(10, 60)).toBeCloseTo(camera.pixelsToKm(10, 0) / 2)
    camera.setGlobe(true)
    expect(camera.pixelsToKm(10, 60)).toBeCloseTo(camera.pixelsToKm(10, 0))
  })

  it("frames the answer with the paint around it", () => {
    const { map, fitBounds } = makeFakeMap()
    new MapCamera(map).fitAnswerAndPaint(PARIS, paintAt({ lat: 40, lon: -5 }), 50)
    const [[west, south], [east, north]] = fitBounds.mock.calls[0]![0] as [[number, number], [number, number]]
    expect(west).toBeCloseTo(-5)
    expect(south).toBeCloseTo(40)
    expect(east).toBeGreaterThan(PARIS.lon)
    expect(north).toBeGreaterThan(PARIS.lat)
  })

  it("frames just the answer when the paint is too far off to fit", () => {
    const { map, fitBounds } = makeFakeMap({ fitZoom: 0.5 })
    new MapCamera(map).fitAnswerAndPaint(PARIS, paintAt({ lat: -30, lon: 140 }), 50)
    const [[west], [east]] = fitBounds.mock.calls[0]![0] as [[number, number], [number, number]]
    expect(west).toBeGreaterThan(-5)
    expect(east).toBeLessThan(10)
  })

  it("shows the whole world, at the answer, when the paint spans most of it", () => {
    const { map, easeTo, fitBounds } = makeFakeMap()
    new MapCamera(map).fitAnswerAndPaint(PARIS, paintAt({ lat: 0, lon: -170 }, { lat: 0, lon: 170 }), 50)
    expect(fitBounds).not.toHaveBeenCalled()
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [PARIS.lon, PARIS.lat], zoom: 1 }))
  })

  it("keeps a whole-world view whole when switching to the globe, and a zoomed-in one where it is", () => {
    const whole = makeFakeMap({ zoom: 1.6 })
    new MapCamera(whole.map).setGlobe(true)
    expect(whole.easeTo).toHaveBeenCalledTimes(1)

    const zoomedIn = makeFakeMap({ zoom: 6 })
    new MapCamera(zoomedIn.map).setGlobe(true)
    expect(zoomedIn.easeTo).not.toHaveBeenCalled()
  })
})
