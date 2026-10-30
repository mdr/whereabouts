import { describe, expect, it } from "vite-plus/test"
import { outlinePath } from "./outline-path"

const points = (d: string) =>
  [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)

describe("outlinePath", () => {
  it("fits a shape in the box, centred", () => {
    const square = [
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
    const d = outlinePath(square, { lat: 0, lon: 11 }, 56, 42, 3)
    const xs = points(d).map((p) => p[0])
    const ys = points(d).map((p) => p[1])
    expect(Math.min(...ys)).toBeCloseTo(3)
    expect(Math.max(...ys)).toBeCloseTo(39)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(28)
  })

  it("keeps a shape across the antimeridian whole", () => {
    const across = [
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
    const xs = points(outlinePath(across, { lat: 0.5, lon: 180 }, 56, 42, 3)).map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(50)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
  })

  it("draws each ring, holes too", () => {
    const withHole = [
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
