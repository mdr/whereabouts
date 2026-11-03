import { describe, expect, it } from "vite-plus/test"
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { DEV_PLAYERS_PATH, DevPlayersAction } from "@whereabouts/shared/protocol/dev-players"
import { Phase, RoundGuessType } from "@whereabouts/shared/protocol/views"
import type { App } from "../app.ts"
import { useGameServer } from "./test-server.ts"

const postTo = (server: { app: App }, payload: object): Promise<Response> => {
  const { port } = server.app.fastify.addresses()[0]!
  return fetch(`http://127.0.0.1:${port}${DEV_PLAYERS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
}

describe("dev players endpoint", () => {
  describe("with dev tools on", () => {
    const server = useGameServer({ devTools: true })
    const post = (payload: object): Promise<Response> => postTo(server, payload)

    it("seats 16 more players in the lobby, who then paint and lock in the round", async () => {
      const { alice, bob, code } = await server.aliceAndBob()

      const seated = await post({ code, action: DevPlayersAction.SEAT })
      expect(seated.status).toBe(200)
      const full = await alice.until((view) => view.players.length === 18)
      expect(new Set(full.players.map((player) => player.name)).size).toBe(18)

      alice.send(ClientTopic.START)
      await alice.until((view) => view.phase === Phase.GUESSING)
      const painted = await post({ code, action: DevPlayersAction.PAINT })
      expect(await painted.json()).toEqual({ changed: 16 })

      alice.send(ClientTopic.LOCK)
      bob.send(ClientTopic.LOCK)
      const reveal = await alice.until((view) => view.phase === Phase.REVEAL)
      if (reveal.phase !== Phase.REVEAL) throw new Error("not a reveal")
      const guesses = reveal.reveal.results.map((result) => result.guess.type)
      expect(guesses.filter((type) => type === RoundGuessType.PAINTED)).toHaveLength(16)
    })

    it("seats the number asked for", async () => {
      const { alice, code } = await server.aliceAndBob()
      await post({ code, action: DevPlayersAction.SEAT, count: 3 })
      await alice.until((view) => view.players.length === 5)
    })

    it("refuses what the game is not ready for", async () => {
      const { alice, code } = await server.aliceAndBob()
      expect((await post({ code, action: DevPlayersAction.PAINT })).status).toBe(409)
      alice.send(ClientTopic.START)
      await alice.until((view) => view.phase === Phase.GUESSING)
      expect((await post({ code, action: DevPlayersAction.SEAT })).status).toBe(409)
    })

    it("refuses an unknown game and a malformed body", async () => {
      expect((await post({ code: "ZZZZ", action: DevPlayersAction.SEAT })).status).toBe(404)
      expect((await post({ code: "ZZZZ", action: "FLY" })).status).toBe(400)
      expect((await post({})).status).toBe(400)
    })
  })

  describe("with dev tools off", () => {
    const server = useGameServer()

    it("has no endpoint", async () => {
      const { code } = await server.aliceAndBob()
      const response = await postTo(server, { code, action: DevPlayersAction.SEAT })
      expect(response.status).toBe(404)
    })
  })
})
