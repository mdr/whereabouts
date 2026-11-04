import { describe, expect, it } from "vite-plus/test"
import { packageSummary, type CoveredFile } from "./package-summary.ts"

const file = (sourcePath: string, covered: number, total: number): CoveredFile => ({
  sourcePath,
  summary: { lines: { covered, total } }
})

describe("packageSummary", () => {
  it("totals lines by package and overall, counting files nothing ran", () => {
    const table = packageSummary([
      file("packages/shared/src/geo.ts", 3, 4),
      file("packages/client/src/main.tsx", 0, 6),
      file("packages/client/src/ui/App.tsx", 5, 10)
    ])
    expect(table.split("\n").slice(1)).toEqual([
      "client    31.3%            5/16   2 (1)",
      "shared    75.0%             3/4   1 (0)",
      "all       40.0%            8/20   3 (1)"
    ])
  })
})
