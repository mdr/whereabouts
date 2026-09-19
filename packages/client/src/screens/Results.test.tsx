// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { Results } from "./Results";

function view(isHost: boolean): GameView {
  return {
    code: "AB12",
    phase: "results",
    config: { rounds: 2, roundMs: 60000, kernelId: "multi-equal" },
    serverTime: 0,
    you: { id: "p2", isHost, spectating: false, locked: false, paint: null },
    players: [
      { id: "p1", name: "Alice", colour: 0, connected: true, isHost: true, score: 1500, rank: 1, previousRank: 1 },
      { id: "p2", name: "Bob", colour: 1, connected: true, isHost: false, score: 900, rank: 2, previousRank: 2 },
    ],
    round: null,
    reveal: null,
    results: [
      { playerId: "p1", total: 1500, rounds: [800, 700] },
      { playerId: "p2", total: 900, rounds: [500, 400] },
    ],
  };
}

describe("Results", () => {
  it("names the winner, lists standings with per-round scores, and highlights you", () => {
    const conn = { again: vi.fn() } as unknown as Connection;
    const { container } = render(<Results conn={conn} view={view(false)} />);
    expect(container.querySelector(".tagline")!.textContent).toContain("Alice");
    expect(container.querySelector(".tagline")!.textContent).toContain("wins");
    const rows = container.querySelectorAll(".standings-row");
    expect(rows).toHaveLength(2);
    // Medals for the podium, one column per round, then the total.
    expect(rows[0]!.querySelector(".place")!.textContent).toBe("🥇");
    expect(rows[1]!.querySelector(".place")!.textContent).toBe("🥈");
    expect([...rows[0]!.querySelectorAll(".round")].map((e) => e.textContent)).toEqual(["800", "700"]);
    expect(rows[0]!.querySelector(".total")!.textContent).toBe("1,500");
    expect(container.querySelectorAll(".standings-head .num")).toHaveLength(3);
    expect(rows[1]!.className).toContain("you");
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("The host can start another game");
  });

  it("lets the host play again", () => {
    const again = vi.fn();
    const conn = { again } as unknown as Connection;
    const { getByText } = render(<Results conn={conn} view={view(true)} />);
    fireEvent.click(getByText("Play again"));
    expect(again).toHaveBeenCalledTimes(1);
  });
});
