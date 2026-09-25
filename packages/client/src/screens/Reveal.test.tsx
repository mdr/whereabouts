// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { PlayerView, RoundResultView } from "@whereabouts/shared";
import { revealOrder } from "./Reveal";

function player(id: string, rank: number): PlayerView {
  return {
    id,
    name: id,
    colour: 0,
    watching: false,
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
  it("leaves spectators out", () => {
    const sam = { ...player("sam", 0), watching: true, colour: -1 };
    const rows = revealOrder([player("alice", 1), sam], [result("alice", 500)]);
    expect(rows.map((x) => x.p.id)).toEqual(["alice"]);
  });

  it("puts this round's winner first, passes in score order, then anyone who sat out", () => {
    // Standings say Alice leads overall, but Cara won this round.
    const players = [
      player("alice", 1),
      player("bob", 2),
      player("cara", 3),
      player("dan", 4),
      player("eve", 5),
      player("fay", 6),
    ];
    const results = [
      result("alice", 610),
      result("bob", 250, false), // passed: scores 250, below the vague 590 but ranked by score
      result("cara", 842),
      result("dan", 590),
      result("fay", 120), // a confident miss scores below a pass
      // eve joined mid-round: no result at all
    ];
    expect(revealOrder(players, results).map((row) => row.p.id)).toEqual(["cara", "alice", "dan", "bob", "fay", "eve"]);
  });

  it("keeps the standings order for ties", () => {
    const players = [player("bob", 2), player("alice", 1)];
    const results = [result("alice", 500), result("bob", 500)];
    expect(revealOrder(players, results).map((row) => row.p.id)).toEqual(["alice", "bob"]);
  });
});
