import { describe, expect, it } from "vite-plus/test"
import { crossSum, pairSum } from "./kernel-sums.ts"
import { SINGLE_KERNEL, type WeightedPoint } from "./scoring.ts"

// Width 100 gives a cutoff of 400 km, so the grid has 400 km cubes.
const tolerance = 100

function makePoint(x: number, p = 0.5): WeightedPoint {
  return { xyz: [x, 0, 0], p }
}

describe("kernel sums", () => {
  it("pairs points either side of a bucket boundary", () => {
    // (208 + 8192) / 400 = 21: a bucket boundary at x = 208.
    const points = [makePoint(207.9), makePoint(208.1)]
    const fast = pairSum(points, tolerance, false, SINGLE_KERNEL)
    const exact = pairSum(points, tolerance, true, SINGLE_KERNEL)
    expect(fast).toBeCloseTo(exact, 12)
  })

  it("drops a pair beyond the cutoff", () => {
    const points = [makePoint(0), makePoint(401)]
    expect(pairSum(points, tolerance, false, SINGLE_KERNEL)).toBeCloseTo(0.5, 12)
    expect(pairSum(points, tolerance, true, SINGLE_KERNEL)).toBeGreaterThan(0.5)
  })

  it("sums to zero when a side is empty", () => {
    const points = [makePoint(0)]
    expect(crossSum(points, [], tolerance, false, SINGLE_KERNEL)).toBe(0)
    expect(crossSum([], points, tolerance, false, SINGLE_KERNEL)).toBe(0)
  })
})
