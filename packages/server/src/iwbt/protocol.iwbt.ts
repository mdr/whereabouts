import { describe, expect } from "vite-plus/test"
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { PAINT_CELL_BUDGET } from "@whereabouts/shared/paint/compact"
import { PROTOCOL_VERSION, encodeTicket, type Ticket } from "@whereabouts/shared/protocol/ticket"
import { SEAT_GRACE } from "@whereabouts/shared/protocol/config"
import { Phase } from "@whereabouts/shared/protocol/views"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { gridDisk, h3Resolution, latLngToCell } from "@whereabouts/shared/h3"
import { HintAxis } from "@whereabouts/shared/hints"
import { roomCode } from "@whereabouts/shared/ids"
import { MAX_PAYLOAD_BYTES } from "../app.ts"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("protocol", () => {
  const it = useInProcessServer()

  it("rejects bad codes and malformed tickets, and tells an outdated client so", async ({ server }) => {
    const nobody = server.player("Nobody")
    await nobody.join(roomCode("ZZZZ"))
    await nobody.expectClosedFor(CloseReason.NO_SUCH_GAME)
    nobody.expectNeverSawGame()

    const old = server.player("Old")
    old.wire.connectWith(
      encodeTicket({ v: PROTOCOL_VERSION - 1, token: old.token, name: old.name } as unknown as Ticket)
    )
    await old.expectClosedFor(CloseReason.OUTDATED)

    const garbage = server.player("Garbage")
    garbage.wire.connectWith("not-a-ticket")
    await garbage.expectClosed()
  })

  it("answers bad messages with errors instead of dropping the player", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()

    alice.wire.sendRaw(ClientTopic.RENAME, "this is not json")
    await alice.wire.expectError("malformed message")

    alice.wire.sendRaw(ClientTopic.PAINT, "this is not paint")
    await alice.wire.expectError("invalid paint")

    const tooMany = gridDisk(latLngToCell(0, 0, h3Resolution(7)), 45).slice(0, PAINT_CELL_BUDGET + 1)
    alice.wire.sendPaint({ cells: Object.fromEntries(tooMany.map((cell) => [cell, 1])), floor: 0 })
    await alice.wire.expectError("invalid paint")

    // Not a cell: scoring it would throw.
    const notACell = encodePaint({ cells: { [latLngToCell(0, 0, h3Resolution(5))]: 1 }, floor: 0 })
    notACell.fill(0xff, 8, 16)
    alice.wire.sendRaw(ClientTopic.PAINT, notACell)
    await alice.wire.expectError("invalid paint")

    // A game-level rejection (as opposed to a schema one) also comes back as an error.
    alice.wire.send(ClientTopic.HINT, { axis: HintAxis.LATITUDE })
    alice.wire.send(ClientTopic.HINT, { axis: HintAxis.LONGITUDE })
    await alice.wire.expectError("one hint per round")

    // Unknown topics are dropped silently rather than kicking (version skew tolerance).
    alice.wire.sendRaw("no-such-topic", "{}")
    await new Promise((resolve) => setTimeout(resolve, 200))
    alice.expectStillConnected()
    expect(alice.wire.errors).toHaveLength(0)
  })

  it("answers a ping with a pong", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.wire.expectPong()
  })

  it("survives an oversized frame: the sender is dropped, everyone else carries on", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")

    // Just over the limit. ws rejects it with close code 1009.
    bob.wire.sendRaw(ClientTopic.PAINT, "x".repeat(MAX_PAYLOAD_BYTES + 1))
    await bob.expectClosed()

    // The process is alive and the room still works. Bob shows offline, and
    // his lobby seat is freed once the grace period passes.
    alice.expectStillConnected()
    await alice.expectOffline(bob)
    server.clock.advance(SEAT_GRACE)
    await alice.expectLobbyWith(["Alice"])
    const cara = server.player("Cara")
    await cara.join(alice.code)
    await cara.expectLobby()
  })

  it("sends a round's reveal once, and again only to a player who reconnects", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    const paint = await alice.paintOnAnswer()
    await alice.lockIn()
    await bob.lockIn()
    await alice.expectReveal()

    await bob.rename("Bobby")
    const renamed = await alice.expectSeeing("Bobby")
    expect(viewIn(renamed, Phase.REVEAL).reveal.results).toHaveLength(2)
    expect(alice.wire.reveals).toHaveLength(1)
    expect(alice.wire.rawStates.at(-1)).not.toContain(Object.keys(paint.cells)[0])

    bob.disconnect()
    await alice.expectOffline("Bobby")
    await bob.reconnect()
    const back = await bob.expectReveal()
    expect(back.results).toHaveLength(2)
    expect(bob.wire.reveals).toHaveLength(1)
    await alice.expectEveryoneConnected()
    expect(alice.wire.reveals).toHaveLength(1)
  })

  it("closes a connection that floods messages, and only that one", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")

    for (let i = 0; i < 40; i++) bob.wire.send(ClientTopic.RENAME, { name: i % 2 ? "Bob" : "Bobby" })
    await bob.expectClosed()
    alice.expectStillConnected()
  })

  it("answers a configure with a body the settings do not allow with an error", async ({ server }) => {
    const alice = await server.host("Alice")
    alice.wire.sendRaw(ClientTopic.CONFIGURE, JSON.stringify({ roundLength: 12_345 }))
    await alice.wire.expectError("invalid CONFIGURE")
    alice.expectStillConnected()
  })
})

describe("refused handshakes", () => {
  const it = useInProcessServer({ addressLimits: { maxOpen: 2, burst: 100, perSecond: 100 } })

  it("give back their address slot, so a good ticket still gets in", async ({ server }) => {
    const alice = await server.host("Alice")
    for (let attempt = 0; attempt < 4; attempt++) {
      const old = server.player(`Old${attempt}`)
      old.wire.connectWith(
        encodeTicket({ v: PROTOCOL_VERSION - 1, token: old.token, name: old.name } as unknown as Ticket)
      )
      await old.expectClosedFor(CloseReason.OUTDATED)

      const garbage = server.player(`Garbage${attempt}`)
      garbage.wire.connectWith("not-a-ticket")
      await garbage.expectClosed()
    }

    const bob = await alice.invite("Bob")
    bob.expectStillConnected()
  })
})
