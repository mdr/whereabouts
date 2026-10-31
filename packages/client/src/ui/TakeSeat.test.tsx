// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { makePlayer } from "../test-view"
import type { GameView, PlayerView } from "@whereabouts/shared/protocol"
import type { Connection } from "../net"
import { TakeSeatButton } from "./TakeSeat"

const person = (i: number, watching = false): PlayerView =>
  makePlayer({
    id: playerId(`p${i + 1}`),
    name: playerName(`P${i}`),
    colour: watching ? undefined : playerColour(i),
    watching,
    rank: watching ? 0 : 1
  })
const viewWith = (players: number) =>
  ({ players: [...Array.from({ length: players }, (_, i) => person(i)), person(99, true)] }) as GameView
const makeConn = (overrides: { setRole?: () => void; online?: boolean } = {}) =>
  ({ setRole: overrides.setRole ?? vi.fn(), online: { value: overrides.online ?? true } }) as unknown as Connection

describe("TakeSeatButton", () => {
  it("asks to play when a seat is free", () => {
    const setRole = vi.fn()
    const { container } = render(<TakeSeatButton conn={makeConn({ setRole })} view={viewWith(3)} />)
    fireEvent.click(container.querySelector("button")!)
    expect(setRole).toHaveBeenCalledWith(false)
  })

  it("is off while all sixteen seats are taken", () => {
    const { container } = render(<TakeSeatButton conn={makeConn()} view={viewWith(16)} />)
    expect(container.querySelector("button")!.disabled).toBe(true)
  })

  it("is off while reconnecting, when asking would be lost", () => {
    const { container } = render(<TakeSeatButton conn={makeConn({ online: false })} view={viewWith(3)} />)
    expect(container.querySelector("button")!.disabled).toBe(true)
  })
})
