import { describe, expect } from "vite-plus/test"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("metrics", () => {
  const it = useInProcessServer({ metrics: true })

  it("report a started game and a connected player on the metrics port", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()

    const text = await server.scrapeMetrics()
    expect(text).toContain("whereabouts_rooms_open 1\n")
    expect(text).toContain("whereabouts_players_connected 1\n")
    expect(text).toContain("whereabouts_spectators_connected 0\n")
    expect(text).toContain("whereabouts_games_started_total 1\n")
    expect(text).toContain('whereabouts_rounds_total{type="PLACE"} 1\n')
    expect(text).toContain('whereabouts_player_joins_total{rejoined="false"} 1\n')
    expect(text).toContain("process_resident_memory_bytes")
  })

  it("count a game that ended early, and a player turned away", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()
    await alice.endGame()
    await alice.expectResults()
    await server.player("Late").join(alice.code)

    const text = await server.scrapeMetrics()
    expect(text).toContain('whereabouts_games_ended_total{completed="false"} 1\n')
    await expect
      .poll(async () => await server.scrapeMetrics())
      .toContain('whereabouts_connections_refused_total{reason="finished"} 1\n')
  })

  it("are not on the public service", async ({ server }) => {
    expect((await fetch(`${server.httpUrl}/metrics`)).status).toBe(404)
  })
})
