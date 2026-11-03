import { describe, expect } from "vite-plus/test"
import { DEV_PLAYERS_PATH, DevPlayersAction } from "@whereabouts/shared/protocol/dev-players"
import { RoundGuessType } from "@whereabouts/shared/protocol/views"
import type { InProcessServer } from "../test-support/in-process-server.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

const postTo = (server: InProcessServer, payload: object): Promise<Response> =>
  fetch(`${server.httpUrl}${DEV_PLAYERS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })

describe("dev players endpoint", () => {
  describe("with dev tools on", () => {
    const it = useInProcessServer({ devTools: true })

    it("seats 16 more players in the lobby, who then paint and lock in the round", async ({ server }) => {
      const alice = await server.host("Alice")
      const bob = await alice.invite("Bob")
      const { code } = alice

      const seated = await postTo(server, { code, action: DevPlayersAction.SEAT })
      expect(seated.status).toBe(200)
      const full = await alice.expectHeadcount(18)
      expect(new Set(full.players.map((player) => player.name)).size).toBe(18)

      await alice.start()
      const painted = await postTo(server, { code, action: DevPlayersAction.PAINT })
      expect(await painted.json()).toEqual({ changed: 16 })

      await alice.lockIn()
      await bob.lockIn()
      const reveal = await alice.expectReveal()
      const guesses = reveal.results.map((result) => result.guess.type)
      expect(guesses.filter((type) => type === RoundGuessType.PAINTED)).toHaveLength(16)
    })

    it("seats the number asked for", async ({ server }) => {
      const alice = await server.host("Alice")
      await alice.invite("Bob")
      await postTo(server, { code: alice.code, action: DevPlayersAction.SEAT, count: 3 })
      await alice.expectHeadcount(5)
    })

    it("refuses what the game is not ready for", async ({ server }) => {
      const alice = await server.host("Alice")
      await alice.invite("Bob")
      const { code } = alice
      expect((await postTo(server, { code, action: DevPlayersAction.PAINT })).status).toBe(409)
      await alice.start()
      expect((await postTo(server, { code, action: DevPlayersAction.SEAT })).status).toBe(409)
    })

    it("refuses an unknown game and a malformed body", async ({ server }) => {
      expect((await postTo(server, { code: "ZZZZ", action: DevPlayersAction.SEAT })).status).toBe(404)
      expect((await postTo(server, { code: "ZZZZ", action: "FLY" })).status).toBe(400)
      expect((await postTo(server, {})).status).toBe(400)
    })
  })

  describe("with dev tools off", () => {
    const it = useInProcessServer()

    it("has no endpoint", async ({ server }) => {
      const alice = await server.host("Alice")
      await alice.invite("Bob")
      const response = await postTo(server, { code: alice.code, action: DevPlayersAction.SEAT })
      expect(response.status).toBe(404)
    })
  })
})
