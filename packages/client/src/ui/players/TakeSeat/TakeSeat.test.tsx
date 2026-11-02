// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import { makePlayer, makeSpectator } from "../../../test-view"
import type { GameView } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import type { Connection } from "../../../net/net"
import { TakeSeatButton } from "./TakeSeat"

const person = (i: number) =>
  makePlayer({ id: playerId(`p${i + 1}`), name: playerName(`P${i}`), colour: playerColour(i) })
const viewWith = (players: number) =>
  ({
    players: Array.from({ length: players }, (_, i) => person(i)),
    spectators: [makeSpectator()]
  }) as GameView
const makeConn = (overrides: { setRole?: () => void; online?: boolean } = {}) =>
  ({ setRole: overrides.setRole ?? vi.fn(), online: { value: overrides.online ?? true } }) as unknown as Connection

describe("TakeSeatButton", () => {
  it("asks to play when a seat is free", () => {
    const setRole = vi.fn()
    const { container } = render(<TakeSeatButton conn={makeConn({ setRole })} view={viewWith(3)} />)
    fireEvent.click(container.querySelector("button")!)
    expect(setRole).toHaveBeenCalledWith(Role.PLAYER)
  })

  it("is off while every seat is taken", () => {
    const { container } = render(<TakeSeatButton conn={makeConn()} view={viewWith(MAX_PLAYERS)} />)
    expect(container.querySelector("button")!.disabled).toBe(true)
  })

  it("is off while reconnecting, when asking would be lost", () => {
    const { container } = render(<TakeSeatButton conn={makeConn({ online: false })} view={viewWith(3)} />)
    expect(container.querySelector("button")!.disabled).toBe(true)
  })
})
