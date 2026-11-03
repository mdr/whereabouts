import { describe, expect, it } from "vite-plus/test"
import { RankMove, rankMove } from "./rank-move"

describe("rankMove", () => {
  it.each([
    ["climbed", 3, 1, RankMove.UP],
    ["fell", 1, 2, RankMove.DOWN],
    ["held", 2, 2, RankMove.SAME],
    ["had no earlier rank", undefined, 2, RankMove.SAME]
  ])("says a player who %s moved %s", (_, previousRank, rank, expected) => {
    expect(rankMove({ rank, previousRank })).toBe(expected)
  })
})
