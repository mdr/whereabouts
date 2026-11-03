import { describe, expect } from "vite-plus/test"
import { mixTotal } from "@whereabouts/shared/protocol/config"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("the server as main starts it from the environment", () => {
  const it = useInProcessServer({
    environment: { ROUNDS: "3", ROUND_MS: "45000", CONNECTIONS_PER_ADDRESS: "1", STATIC_DIR: "" }
  })

  it("hosts games of ROUNDS rounds of ROUND_MS each", async ({ server }) => {
    const alice = await server.host("Alice")
    const { config } = await alice.expectLobby()
    expect(mixTotal(config.mix)).toBe(3)
    expect(config.roundLength).toBe(45_000)
  })

  it("limits open connections per address to CONNECTIONS_PER_ADDRESS", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = server.player("Bob")
    await bob.join(alice.code)
    await bob.expectClosed()
    bob.expectNeverSawGame()
  })
})
