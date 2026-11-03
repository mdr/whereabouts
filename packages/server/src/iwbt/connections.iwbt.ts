import { describe, expect } from "vite-plus/test"
import { roomCode } from "@whereabouts/shared/ids"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("connections", () => {
  const it = useInProcessServer()

  it("hosts a game under a code no game has, and joins it if someone just did", async ({ server }) => {
    const alice = await server.host("Alice", roomCode("VWZR"))
    expect(alice.code).toBe("VWZR")
    expect(alice.view.you.isHost).toBe(true)

    const bob = server.player("Bob")
    await bob.host(roomCode("VWZR"))
    await bob.expectLobbyWith(["Alice", "Bob"])
    expect(bob.view.you.isHost).toBe(false)
  })

  it("shutting the server down tells players it restarted", async ({ server }) => {
    const alice = await server.host("Alice")
    await server.close()
    await alice.expectClosedFor(CloseReason.SERVER_RESTARTED)
  })

  it("the last player leaving closes the game without waiting", async ({ server }) => {
    const alice = await server.host("Alice")
    const { code } = alice
    await alice.leave()
    await server.untilGameFreed(code)
  })
})

describe("connections per address", () => {
  const it = useInProcessServer({ addressLimits: { maxOpen: 2, burst: 100, perSecond: 1 } })

  it("refuses connections over the limit, and lets them in once one closes", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")

    const carol = server.player("Carol")
    await carol.join(alice.code)
    await carol.expectClosed()
    carol.expectNeverSawGame()

    bob.disconnect()
    await alice.expectOffline(bob)
    await carol.join(alice.code)
    await alice.expectSeeing(carol)
  })
})
