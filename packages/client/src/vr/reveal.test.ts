import { describe, expect, it } from "vite-plus/test"
import { PaintLayer } from "@whereabouts/shared/paint"
import { h3Res } from "@whereabouts/shared/h3"
import type { LatLon } from "@whereabouts/shared/geo"
import { colouredPaint, framing } from "./reveal"
import { latLonToLocal } from "./sphere"
import type { VrReveal, VrRound } from "./view"

function makeLayer(at?: LatLon, km = 50): PaintLayer {
  const layer = new PaintLayer(h3Res(4))
  if (at) layer.stamp(at, km, 1)
  return layer
}

function makeRound(layer = makeLayer()): VrRound {
  return { paint: { layer } } as VrRound
}

function makeReveal(over: Partial<VrReveal> = {}): VrReveal {
  const focus = over.focus ?? { lat: 0, lon: 0 }
  return {
    label: "",
    answer: { point: focus },
    focus,
    stateRound: false,
    scoreLine: "",
    actions: [],
    ...over
  }
}

const angle = (a: LatLon, b: LatLon) => latLonToLocal(a).angleTo(latLonToLocal(b))

describe("framing the reveal", () => {
  it("turns to the answer, close in, when nothing was painted", () => {
    const { at, reach } = framing(makeReveal({ focus: { lat: 48.9, lon: 2.4 } }), makeRound())
    expect(angle(at, { lat: 48.9, lon: 2.4 })).toBeLessThan(1e-6)
    expect(reach).toBeLessThan(0.01)
  })

  it("takes in the answer and the guess", () => {
    const guess = { lat: 0, lon: 30 }
    const { at, reach } = framing(makeReveal(), makeRound(makeLayer(guess)))
    expect(at.lon).toBeGreaterThan(5)
    expect(at.lon).toBeLessThan(25)
    expect(reach).toBeGreaterThan(angle(at, { lat: 0, lon: 0 }))
    expect(reach).toBeGreaterThan(angle(at, guess))
  })

  it("weighs a big guess no more than a small one", () => {
    const small = framing(makeReveal(), makeRound(makeLayer({ lat: 0, lon: 30 }, 30)))
    const big = framing(makeReveal(), makeRound(makeLayer({ lat: 0, lon: 30 }, 400)))
    expect(Math.abs(big.at.lon - small.at.lon)).toBeLessThan(2)
  })

  it("shows the whole world when the guesses are spread round it", () => {
    const reveal = makeReveal({
      paints: [{ layer: makeLayer({ lat: 0, lon: 180 }), colour: "red" }]
    })
    expect(framing(reveal, makeRound())).toEqual({ at: reveal.focus, reach: Math.PI })
  })

  it("frames the players' paint shown, not the round's own", () => {
    const reveal = makeReveal({ paints: [{ layer: makeLayer({ lat: 0, lon: -30 }), colour: "red" }] })
    const { at } = framing(reveal, makeRound(makeLayer({ lat: 0, lon: 30 })))
    expect(at.lon).toBeLessThan(0)
  })
})

describe("players' paint in colour", () => {
  it("is every player's cells, each in that player's colour", () => {
    const red = makeLayer({ lat: 0, lon: 0 })
    const blue = makeLayer({ lat: 40, lon: 40 })
    const paint = colouredPaint([
      { layer: red, colour: "red" },
      { layer: blue, colour: "blue" }
    ])
    const count = (colour: string) => paint.features.filter((f) => f.properties.colour === colour).length
    expect(count("red")).toBe(red.toGeoJSON().features.length)
    expect(count("blue")).toBe(blue.toGeoJSON().features.length)
    expect(paint.features).toHaveLength(count("red") + count("blue"))
  })
})
