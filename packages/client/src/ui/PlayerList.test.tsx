// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import type { PlayerView } from "@whereabouts/shared";
import { PlayerList } from "./PlayerList";

const player = (over: Partial<PlayerView>): PlayerView => ({
  id: "p1",
  name: "Alice",
  colour: 0,
  connected: true,
  isHost: false,
  score: 0,
  rank: 1,
  previousRank: null,
  ...over,
});

describe("PlayerList", () => {
  it("tags host, you and offline players", () => {
    const { container } = render(
      <PlayerList
        players={[player({ isHost: true }), player({ id: "p2", name: "Bob", connected: false, colour: 1 })]}
        you="p1"
        showScores={false}
      />,
    );
    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("host");
    expect(rows[0]!.textContent).toContain("you");
    expect(rows[1]!.className).toContain("offline");
    expect(rows[1]!.textContent).toContain("offline");
    // No scores requested.
    expect(container.querySelector(".score-num")).toBeNull();
  });

  it("shows rank-change arrows only when a rank moved", () => {
    const { container } = render(
      <PlayerList
        players={[
          player({ id: "p1", name: "Up", rank: 1, previousRank: 2, score: 900 }),
          player({ id: "p2", name: "Same", rank: 2, previousRank: 2, score: 500 }),
          player({ id: "p3", name: "Down", rank: 3, previousRank: 1, score: 100 }),
        ]}
        you="p2"
        showScores
        arrows
      />,
    );
    const arrows = [...container.querySelectorAll(".arrow")].map((a) => a.textContent);
    expect(arrows).toEqual(["▲", "", "▼"]);
    expect([...container.querySelectorAll(".score-num")].map((s) => s.textContent)).toEqual(["900", "500", "100"]);
  });
});
