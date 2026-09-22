// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { startOnPan } from "../settings";
import { Lobby } from "./Lobby";

function view(isHost: boolean): GameView {
  return {
    code: "AB12",
    phase: "lobby",
    config: { rounds: 5, roundMs: 60000, photoShare: 0.5, kernelId: "multi-equal" },
    serverTime: 0,
    you: { id: "p1", isHost, spectating: false, locked: false, paint: null },
    players: [
      {
        id: "p1",
        name: "Alice",
        colour: 0,
        connected: true,
        isHost: true,
        locked: false,
        score: 0,
        rank: 1,
        previousRank: null,
      },
    ],
    round: null,
    reveal: null,
    results: null,
  };
}

const conn = {
  status: signal("connected"),
  lastError: signal(null),
  configure: vi.fn(),
  start: vi.fn(),
} as unknown as Connection;

describe("Lobby", () => {
  afterEach(() => {
    startOnPan.value = false;
  });

  it("offers a per-device choice to start rounds on the Pan tool, to hosts and guests alike", () => {
    for (const isHost of [true, false]) {
      const { container, unmount } = render(<Lobby conn={conn} view={view(isHost)} />);
      const box = container.querySelector<HTMLInputElement>(".start-on-pan input")!;
      expect(box.checked).toBe(false);
      fireEvent.click(box);
      expect(startOnPan.value).toBe(true);
      unmount();
      startOnPan.value = false;
    }
  });

  it("shows the saved choice", () => {
    startOnPan.value = true;
    const { container } = render(<Lobby conn={conn} view={view(false)} />);
    expect(container.querySelector<HTMLInputElement>(".start-on-pan input")!.checked).toBe(true);
  });
});
