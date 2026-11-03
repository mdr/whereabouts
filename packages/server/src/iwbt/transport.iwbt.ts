import { describe, expect } from "vite-plus/test"
import { SEAT_GRACE } from "@whereabouts/shared/protocol/config"
import { Phase } from "@whereabouts/shared/protocol/views"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("dead connections", () => {
  const it = useInProcessServer({ heartbeatIntervalMs: 30 })

  it("closes a connection that stops answering pings, and shows the player offline", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    const bobSocket = server.connectStallable(bob, alice.code)
    await bobSocket.expectInGame()
    await alice.expectSeeing(bob)

    bobSocket.stopAnsweringPings()
    await alice.expectOffline(bob)
    await bobSocket.expectClosed()
    alice.expectStillConnected()
  })

  it("a round stops waiting for a player who has gone dead", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    const bobSocket = server.connectStallable(bob, alice.code)
    await bobSocket.expectInGame()
    await alice.expectSeeing(bob)
    await alice.start()
    await alice.lockIn()
    expect(alice.view.phase).toBe(Phase.GUESSING)

    bobSocket.stopAnsweringPings()
    await alice.expectReveal(0)
  })

  it("a reveal stops waiting for the Ready of a player who has gone dead", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    const bobSocket = server.connectStallable(bob, alice.code)
    await bobSocket.expectInGame()
    await alice.expectSeeing(bob)
    await alice.start()
    server.passDeadline()
    await alice.expectReveal(0)
    await alice.ready()
    await alice.expectReadyCount(1)

    bobSocket.stopAnsweringPings()
    await alice.expectGuessing(1)
  })
})

describe("slow readers", () => {
  const it = useInProcessServer({ maxBufferedBytes: 16 * 1024 })

  it("drops a client whose socket stops reading; the others carry on, and it can rejoin", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    const bobSocket = server.connectStallable(bob, alice.code)
    await bobSocket.expectInGame()
    await alice.expectSeeing(bob)

    bobSocket.stopReading()
    await server.keepBroadcasting(alice.code, () => server.game(alice.code)?.connectedCount === 1)
    await alice.expectOffline(bob)
    alice.expectStillConnected()

    await bob.join(alice.code)
    await bob.expectLobbyWith(["Alice", "Bob"])
    await alice.expectSeeing(bob)
  })
})

describe("addresses behind a proxy", () => {
  const it = useInProcessServer({ addressLimits: { maxOpen: 1, burst: 100, perSecond: 100 } })

  it("counts connections by Fly-Client-IP: another address gets in, the same one is refused until it frees", async ({
    server
  }) => {
    const alice = await server.host("Alice")
    const ann = server.player("Ann")
    const ben = server.player("Ben")

    const annSocket = server.connectFrom("10.0.0.1", ann, alice.code)
    await annSocket.expectInGame()
    await server.connectFrom("10.0.0.2", ben, alice.code).expectInGame()
    await server.connectFrom("10.0.0.1", server.player("Cat"), alice.code).expectClosed()

    annSocket.drop()
    await alice.expectOffline(ann)
    await server.connectFrom("10.0.0.1", ann, alice.code).expectInGame()
  })
})

describe("origins", () => {
  const it = useInProcessServer()

  it("accepts sockets from any origin (open by decision)", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    await server.connectFromOrigin("https://elsewhere.example", bob, alice.code).expectInGame()
    await alice.expectSeeing(bob)
  })
})

describe("a socket that closes mid-handshake", () => {
  const it = useInProcessServer({ addressLimits: { maxOpen: 1, burst: 100, perSecond: 100 } })

  it("frees its address at once and its game when the seat lapses", async ({ server }) => {
    const alice = await server.host("Alice")
    server.hostAndDrop("10.0.0.9", server.player("Ghost"))

    await server.connectWhenAddressFree("10.0.0.9", server.player("Bob"), alice.code)
    server.clock.advance(SEAT_GRACE)
    await server.untilGameCount(1)
  })
})
