import { describe, expect, it } from "vitest";
import { pickAwards, type PlayerFacts, type RoundFacts } from "./awards.ts";

const round = (score: number, extra: Partial<RoundFacts> = {}): RoundFacts => ({
  label: "Paris",
  score,
  passed: false,
  lockSeconds: 30,
  roundSeconds: 60,
  areaKm2: 10_000,
  ...extra,
});
const player = (id: string, rounds: (RoundFacts | null)[]): PlayerFacts => ({ playerId: id, rounds });
const SEEDS = Array.from({ length: 20 }, (_, i) => ((i + 1) * 2654435761) >>> 0);

describe("pickAwards", () => {
  it("hands out everything earned, when that is no more than five", () => {
    const players = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
      player(id, [round(100 + i * 150, { passed: i === 0 }), round(900 - i * 150), round(500, { passed: i === 0 })]),
    );
    for (const seed of SEEDS) {
      const awards = pickAwards(players, seed);
      // Four were earned, two each by the passer and the last-placed player: all are handed out.
      expect(awards.map((a) => `${a.title}:${a.playerIds.join()}`).sort()).toEqual([
        "Chicken:a",
        "Comeback Kid:a",
        "Rollercoaster:f",
        "Wooden Spoon:f",
      ]);
    }
  });

  it("finds the chicken, the bottler and the wooden spoon", () => {
    const players = [
      player("a", [round(250, { passed: true }), round(250, { passed: true }), round(250, { passed: true })]),
      player("b", [round(900), round(100), round(100)]),
      player("c", [round(400), round(900), round(950)]),
    ];
    const awards = SEEDS.flatMap((seed) => pickAwards(players, seed));
    const all = new Set(awards.map((a) => a.title));
    expect(all).toContain("Chicken");
    expect(all).toContain("Bottled It");
    expect(all).toContain("Wooden Spoon");
    expect(awards.find((a) => a.title === "Chicken")!.playerIds).toEqual(["a"]);
    expect(awards.find((a) => a.title === "Bottled It")!.playerIds).toEqual(["b"]);
  });

  it("only awards what someone earned", () => {
    // Two dull, identical players: ties win nothing, and nobody did anything daft.
    const dull = [player("a", [round(500), round(500)]), player("b", [round(500), round(500)])];
    expect(pickAwards(dull, 1)).toEqual([]);
  });

  it("names a confident miss, with the distance", () => {
    const miss = round(60, {
      label: "Tokyo",
      point: { spot: { lat: 0, lon: 0 }, km: 9_400, spread: 10, distance: 930, hedged: false, toleranceKm: 100 },
    });
    const awards = SEEDS.flatMap((seed) => pickAwards([player("a", [miss]), player("b", [round(700)])], seed));
    expect(awards.map((a) => a.line)).toContain("{0} put Tokyo 9,400 km away. Visible from space, to be fair.");
  });
});
