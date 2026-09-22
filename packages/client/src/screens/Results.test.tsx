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
    config: { rounds: 2, roundMs: 60000, photoShare: 0.5, kernelId: "multi-equal" },
    serverTime: 0,
    you: { id: "p2", isHost, spectating: false, locked: false, paint: null },
    players: [
      {
        id: "p1",
        name: "Alice",
        colour: 0,
        connected: true,
        isHost: true,
        locked: false,
        score: 1500,
        rank: 1,
        previousRank: 1,
      },
      {
        id: "p2",
        name: "Bob",
        colour: 1,
        connected: true,
        isHost: false,
        locked: false,
        score: 900,
        rank: 2,
        previousRank: 2,
      },
    ],
    round: null,
    reveal: null,
    results: [
      { playerId: "p1", total: 1500, rounds: [800, 700] },
      { playerId: "p2", total: 1250, rounds: [500, 750] },
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
    // Medals for the podium, the total as the headline, the rounds underneath.
    expect(rows[0]!.querySelector(".place")!.textContent).toBe("🥇");
    expect(rows[1]!.querySelector(".place")!.textContent).toBe("🥈");
    expect(rows[0]!.querySelector(".total")!.textContent).toBe("1,500");
    expect([...rows[0]!.querySelectorAll(".round")].map((e) => e.textContent)).toEqual(["800", "700"]);
    // Each round's winner is picked out: Alice took round 1, Bob round 2.
    expect([...rows[0]!.querySelectorAll(".round.best")].map((e) => e.textContent)).toEqual(["800"]);
    expect([...rows[1]!.querySelectorAll(".round.best")].map((e) => e.textContent)).toEqual(["750"]);
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
