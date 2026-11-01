import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol"
import { Role } from "@whereabouts/shared/roles"
import { makePlayer, makeLobbyView } from "../../test-view"
import { hostActions, pickable, takeSeat, vrPicked } from "./vr-actions"

const host = makePlayer({ id: playerId("p1"), isHost: true })
const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false })
const asHost = makeLobbyView({ players: [host, bob], you: { id: host.id, isHost: true } })
const asGuest = makeLobbyView({ players: [host, bob], you: { id: bob.id, isHost: false } })
const conn = () => ({ kick: vi.fn(), makeHost: vi.fn(), setRole: vi.fn() })

afterEach(() => (vrPicked.value = undefined))

describe("the host's pick in the headset's table", () => {
  it("is offered on other players' rows, and pointing again lets go", () => {
    const row = pickable(asHost, bob)
    row.select!()
    expect(vrPicked.value).toBe(bob.id)
    expect(pickable(asHost, bob).selected).toBe(true)
    pickable(asHost, bob).select!()
    expect(vrPicked.value).toBeUndefined()
  })

  it("is not offered on the host's own row, or to anyone else", () => {
    expect(pickable(asHost, host)).toEqual({})
    expect(pickable(asGuest, host)).toEqual({})
  })
})

describe("the host's actions on a picked player", () => {
  it("remove them, letting go of the pick, or make them host", () => {
    const connection = conn()
    vrPicked.value = bob.id
    const [remove, makeHost] = hostActions(connection, asHost, bob.id)
    remove!.press()
    makeHost!.press()
    expect(connection.kick).toHaveBeenCalledWith(bob.id)
    expect(connection.makeHost).toHaveBeenCalledWith(bob.id)
    expect(vrPicked.value).toBeUndefined()
  })

  it("do not hand hosting to someone away", () => {
    const away = makeLobbyView({ players: [host, { ...bob, connected: false }], you: { id: host.id, isHost: true } })
    expect(hostActions(conn(), away, bob.id).map((action) => action.label)).toEqual(["Remove Bob"])
  })

  it("are none for a guest, for the host themself, or with no one picked", () => {
    const connection = conn()
    expect(hostActions(connection, asGuest, host.id)).toEqual([])
    expect(hostActions(connection, asHost, host.id)).toEqual([])
    expect(hostActions(connection, asHost, undefined)).toEqual([])
  })
})

describe("a watcher's way in", () => {
  it("takes a seat while one is free", () => {
    const connection = conn()
    const seat = takeSeat(connection, asGuest, "Play")
    seat.press()
    expect(connection.setRole).toHaveBeenCalledWith(Role.PLAYER)
    expect(seat.enabled).toBe(true)
  })

  it("is shut once every seat is taken", () => {
    const full = makeLobbyView({
      players: Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer({ id: playerId(`p${i + 1}`) }))
    })
    expect(takeSeat(conn(), full, "Play").enabled).toBe(false)
  })
})
