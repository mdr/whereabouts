// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import type { GameView, PlayerView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { TakeSeatButton } from "./TakeSeat";

const person = (i: number, watching = false): PlayerView => ({
  id: `p${i}`,
  name: `P${i}`,
  colour: watching ? -1 : i,
  watching,
  connected: true,
  isHost: false,
  locked: false,
  score: 0,
  rank: watching ? 0 : 1,
  previousRank: null,
});
const viewWith = (players: number) =>
  ({ players: [...Array.from({ length: players }, (_, i) => person(i)), person(99, true)] }) as GameView;

describe("TakeSeatButton", () => {
  it("asks to play when a seat is free", () => {
    const setRole = vi.fn();
    const { container } = render(<TakeSeatButton conn={{ setRole } as unknown as Connection} view={viewWith(3)} />);
    fireEvent.click(container.querySelector("button")!);
    expect(setRole).toHaveBeenCalledWith(false);
  });

  it("is off while all sixteen seats are taken", () => {
    const { container } = render(
      <TakeSeatButton conn={{ setRole: vi.fn() } as unknown as Connection} view={viewWith(16)} />,
    );
    expect(container.querySelector("button")!.disabled).toBe(true);
  });
});
