import { describe, expect } from "vite-plus/test"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { EMPTY_GAME_GRACE } from "@whereabouts/shared/protocol/config"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { Phase } from "@whereabouts/shared/protocol/views"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("a room's timer", () => {
  const it = useInProcessServer()

  it("failing in one game does not stop another", async ({ server }) => {
    const alice = await server.host("Alice")
    const carol = await server.host("Carol")
    await alice.start()
    await carol.start()

    server.breakTimer(alice.code)
    server.passDeadline(carol.code)

    await carol.expectReveal(0)
    alice.expectStillConnected()
    await carol.ready()
    await carol.expectGuessing(1)
  })
})

describe("a whole room dropping mid-round", () => {
  const it = useInProcessServer()

  it("keeps the game, the seats and the paint for those back within the grace", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    const alicePaint = await alice.paintOnAnswer()
    const { code } = alice

    alice.disconnect()
    bob.disconnect()
    await server.untilNobodyConnected(code)
    server.clock.advance(EMPTY_GAME_GRACE / 10)

    await alice.reconnect()
    await bob.reconnect()
    const back = await alice.expectEveryoneConnected()
    expect(back.phase).toBe(Phase.GUESSING)
    expect(back.players.map((player) => player.name).sort()).toEqual(["Alice", "Bob"])
    expect((await alice.expectGuessing()).you.paint).toEqual(decodePaint(encodePaint(alicePaint)))
  })

  it("finds the reveal if the deadline passed while nobody was there", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    const { code } = alice

    alice.disconnect()
    bob.disconnect()
    await server.untilNobodyConnected(code)
    server.passDeadline(code)

    await alice.reconnect()
    await alice.expectReveal(0)
    await bob.reconnect()
    await bob.expectReveal(0)
  })

  it("finds no game for those back after the grace", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    const { code } = alice

    alice.disconnect()
    bob.disconnect()
    await server.untilNobodyConnected(code)
    server.clock.advance(EMPTY_GAME_GRACE)

    await alice.reconnect()
    await alice.expectClosedFor(CloseReason.NO_SUCH_GAME)
  })
})
