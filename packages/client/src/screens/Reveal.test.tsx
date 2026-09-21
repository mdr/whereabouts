// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { PlayerView, RoundResultView } from "@whereabouts/shared";
import { revealOrder } from "./Reveal";

function player(id: string, rank: number): PlayerView {
  return {
    id,
    name: id,
    colour: 0,
    connected: true,
    isHost: false,
    locked: false,
    score: 0,
    rank,
    previousRank: null,
  };
}
const paint = { cells: { "85283473fffffff": 1 }, floor: 0.05 };
function result(playerId: string, score: number, painted = true): RoundResultView {
  return { playerId, score, A: 0, B: 0, res: 5, paint: painted ? paint : null };
}

describe("revealOrder", () => {
  it("puts this round's winner first, then no-guess rows, then anyone who sat out", () => {
    // Standings say Alice leads overall, but Cara won this round.
    const players = [player("alice", 1), player("bob", 2), player("cara", 3), player("dan", 4), player("eve", 5)];
    const results = [
      result("alice", 610),
      result("bob", 500, false), // connected but painted nothing: the 500 baseline
      result("cara", 842),
      result("dan", 590),
      // eve joined mid-round: no result at all
    ];
    expect(revealOrder(players, results).map((row) => row.p.id)).toEqual(["cara", "alice", "dan", "bob", "eve"]);
  });

  it("keeps the standings order for ties", () => {
    const players = [player("bob", 2), player("alice", 1)];
    const results = [result("alice", 500), result("bob", 500)];
    expect(revealOrder(players, results).map((row) => row.p.id)).toEqual(["alice", "bob"]);
  });
});
