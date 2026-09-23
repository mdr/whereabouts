// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import type { PlayerView } from "@whereabouts/shared";
import { HostTag, PlayerList } from "./PlayerList";

const player = (over: Partial<PlayerView>): PlayerView => ({
  id: "p1",
  name: "Alice",
  colour: 0,
  connected: true,
  isHost: false,
  locked: false,
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

  it("puts a rename pencil on your own row only when asked", () => {
    let clicks = 0;
    const { container } = render(
      <PlayerList
        players={[player({ id: "p1" }), player({ id: "p2", name: "Bob" })]}
        you="p2"
        showScores={false}
        onRename={() => clicks++}
      />,
    );
    const pencils = container.querySelectorAll("button.icon");
    expect(pencils).toHaveLength(1);
    expect(pencils[0]!.closest("li")!.textContent).toContain("Bob");
    (pencils[0] as HTMLButtonElement).click();
    expect(clicks).toBe(1);
  });
});

describe("PlayerList status", () => {
  it("shows a done tag for players who have finished guessing, only when asked", () => {
    const players = [player({ id: "p1", locked: true }), player({ id: "p2", name: "Bob", locked: false })];
    const { container: plain } = render(<PlayerList players={players} you="p2" showScores={false} />);
    expect(plain.querySelector(".tag.done")).toBeNull();
    const { container } = render(<PlayerList players={players} you="p2" showScores={false} showLocked />);
    const rows = container.querySelectorAll("li");
    expect(rows[0]!.querySelector(".tag.done")).not.toBeNull();
    expect(rows[1]!.querySelector(".tag.done")).toBeNull();
  });
});

describe("HostTag", () => {
  it("shows the crown with the word for screen readers", () => {
    const { container } = render(<HostTag />);
    expect(container.querySelector(".tag.host svg")).not.toBeNull();
    expect(container.textContent).toBe("host");
  });
});

describe("PlayerList kick", () => {
  it("offers a remove button on other players' rows only when asked", () => {
    const kicked: string[] = [];
    const players = [player({ id: "p1" }), player({ id: "p2", name: "Bob" })];
    const { container: plain } = render(<PlayerList players={players} you="p1" showScores={false} />);
    expect(plain.querySelector("button.kick")).toBeNull();
    const { container } = render(
      <PlayerList players={players} you="p1" showScores={false} onKick={(p) => kicked.push(p.id)} />,
    );
    const buttons = container.querySelectorAll<HTMLButtonElement>("button.kick");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Remove Bob from the game");
    buttons[0]!.click();
    expect(kicked).toEqual(["p2"]);
  });
});
