import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol"
import { makePlayer, makeView } from "./test-view"
import { hostActions, pickable, takeSeat, vrPicked } from "./vr-actions"

const host = makePlayer({ id: playerId("p1"), isHost: true })
const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false })
const asHost = makeView({ players: [host, bob], you: { id: host.id, isHost: true } })
const asGuest = makeView({ players: [host, bob], you: { id: bob.id, isHost: false } })
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
    const c = conn()
    vrPicked.value = bob.id
    const [remove, makeHost] = hostActions(c, asHost, bob.id)
    remove!.press()
    makeHost!.press()
    expect(c.kick).toHaveBeenCalledWith(bob.id)
    expect(c.makeHost).toHaveBeenCalledWith(bob.id)
    expect(vrPicked.value).toBeUndefined()
  })

  it("do not hand hosting to someone away", () => {
    const away = makeView({ players: [host, { ...bob, connected: false }], you: { id: host.id, isHost: true } })
    expect(hostActions(conn(), away, bob.id).map((a) => a.label)).toEqual(["Remove Bob"])
  })

  it("are none for a guest, for the host themself, or with no one picked", () => {
    const c = conn()
    expect(hostActions(c, asGuest, host.id)).toEqual([])
    expect(hostActions(c, asHost, host.id)).toEqual([])
    expect(hostActions(c, asHost, undefined)).toEqual([])
  })
})

describe("a watcher's way in", () => {
  it("takes a seat while one is free", () => {
    const c = conn()
    const seat = takeSeat(c, asGuest, "Play")
    seat.press()
    expect(c.setRole).toHaveBeenCalledWith(false)
    expect(seat.enabled).toBe(true)
  })

  it("is shut once every seat is taken", () => {
    const full = makeView({
      players: Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer({ id: playerId(`p${i + 1}`) }))
    })
    expect(takeSeat(conn(), full, "Play").enabled).toBe(false)
  })
})
