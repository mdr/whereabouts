import { describe, expect, it } from "vite-plus/test"
import type { Ring } from "@whereabouts/shared/geo"
import type { Outline } from "@whereabouts/shared/questions"
import { outlinePath } from "./outline-path"

const points = (path: string) =>
  [...path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const)

describe("outlinePath", () => {
  it("fits a shape in the box, centred", () => {
    const square: Outline = [
      [
        [
          [10, 10],
          [12, 10],
          [12, 12],
          [10, 12],
          [10, 10]
        ]
      ]
    ]
    const path = outlinePath(square, { lat: 0, lon: 11 }, 56, 42, 3)
    const xs = points(path).map((point) => point[0])
    const ys = points(path).map((point) => point[1])
    expect(Math.min(...ys)).toBeCloseTo(3)
    expect(Math.max(...ys)).toBeCloseTo(39)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(28)
  })

  it("keeps a shape across the antimeridian whole", () => {
    const across: Outline = [
      [
        [
          [179, 0],
          [-179, 0],
          [-179, 1],
          [179, 1],
          [179, 0]
        ]
      ]
    ]
    const xs = points(outlinePath(across, { lat: 0.5, lon: 180 }, 56, 42, 3)).map((point) => point[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(50)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
  })

  it("draws each ring, holes too", () => {
    const withHole: Outline = [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0]
        ],
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1]
        ]
      ]
    ]
    expect(outlinePath(withHole, { lat: 2, lon: 2 }, 56, 42).match(/Z/g)).toHaveLength(2)
  })
})

describe("outlinePath edge cases", () => {
  it("is empty for no outline, or a single point", () => {
    expect(outlinePath([], { lat: 0, lon: 0 }, 56, 42)).toBe("")
    expect(outlinePath([[[[5, 5]]]], { lat: 0, lon: 0 }, 56, 42)).toBe("")
  })

  it("drops points closer than half a pixel to the last one kept", () => {
    const ring: Ring = [
      [0, 0],
      [0.001, 0],
      [40, 30]
    ]
    expect(points(outlinePath([[ring]], { lat: 0, lon: 20 }, 56, 42))).toHaveLength(2)
  })
})
