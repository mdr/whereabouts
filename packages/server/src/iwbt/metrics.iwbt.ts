import { afterEach, describe, expect, vi } from "vite-plus/test"
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { Game } from "@whereabouts/shared/game/game"
import { EMPTY_GAME_GRACE } from "@whereabouts/shared/protocol/config"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"
import { LOG_CODES } from "../telemetry/log-codes.ts"

describe("metrics", () => {
  const it = useInProcessServer({ metrics: true })
  afterEach(() => vi.restoreAllMocks())

  it("report a started game and a connected player on the metrics port", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()

    const text = await server.scrapeMetrics()
    expect(text).toContain("whereabouts_rooms_open 1\n")
    expect(text).toContain("whereabouts_players_connected 1\n")
    expect(text).toContain("whereabouts_spectators_connected 0\n")
    expect(text).toContain("whereabouts_games_started_total 1\n")
    expect(text).toContain('whereabouts_rounds_total{question_type="place"} 1\n')
    expect(text).toContain('whereabouts_player_joins_total{kind="new"} 1\n')
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
    expect(text).toContain('whereabouts_games_ended_total{outcome="ended_early"} 1\n')
    await expect
      .poll(async () => await server.scrapeMetrics())
      .toContain('whereabouts_connections_refused_total{reason="finished"} 1\n')
  })

  it("time a played game and count its players", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    server.clock.advance(90_000)
    await alice.endGame()

    const text = await server.scrapeMetrics()
    expect(text).toContain("whereabouts_game_duration_seconds_count 1\n")
    expect(text).toContain('whereabouts_game_duration_seconds_bucket{le="60"} 0\n')
    expect(text).toContain('whereabouts_game_duration_seconds_bucket{le="120"} 1\n')
    expect(text).toContain("whereabouts_players_per_game_count 1\n")
    expect(text).toContain('whereabouts_players_per_game_bucket{le="1"} 0\n')
    expect(text).toContain('whereabouts_players_per_game_bucket{le="2"} 1\n')
  })

  it("time a room from opening to closing", async ({ server }) => {
    const alice = await server.host("Alice")
    const { code } = alice
    alice.disconnect()
    await server.untilNobodyConnected(code)
    server.clock.advance(EMPTY_GAME_GRACE)
    await server.untilGameFreed(code)

    const text = await server.scrapeMetrics()
    expect(text).toContain("whereabouts_room_lifetime_seconds_count 1\n")
    expect(text).toContain('whereabouts_room_lifetime_seconds_bucket{le="10"} 0\n')
  })

  it("count a room's timer that threw, logged, while the server plays on", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()
    vi.spyOn(Game.prototype, "tick").mockImplementationOnce(() => {
      throw new Error("tick bug")
    })
    server.passDeadline()

    await expect
      .poll(async () => await server.scrapeMetrics())
      .toContain('whereabouts_server_errors_total{kind="tick_threw"} 1\n')
    expect(server.logEvents.find((line) => line.code === LOG_CODES.server.error)).toMatchObject({
      kind: "tickThrew",
      err: expect.objectContaining({ message: "tick bug" })
    })
    const bob = await server.host("Bob")
    await bob.start()
    await bob.expectGuessing()
  })

  it("are not on the public service", async ({ server }) => {
    expect((await fetch(`${server.httpUrl}/metrics`)).status).toBe(404)
  })
})

describe("client error metrics", () => {
  const it = useInProcessServer({
    metrics: true,
    clientErrorLimits: { perAddress: { burst: 1, perSecond: 0.001 }, global: { burst: 2, perSecond: 0.001 } }
  })
  const report = { kind: ClientErrorKind.WEBGL, message: "no webgl", screen: "/solo" }

  it("count every valid report, and what the limits keep out of the log", async ({ server }) => {
    for (let count = 0; count < 3; count++) await server.postClientError(report, "10.0.0.1")
    await server.postClientError(report, "10.0.0.2")
    await server.postClientError(report, "10.0.0.3")
    await server.postClientError({ ...report, kind: "NOT_A_KIND" }, "10.0.0.4")

    const text = await server.scrapeMetrics()
    expect(text).toContain('whereabouts_client_errors_total{kind="webgl"} 5\n')
    expect(text).toContain('whereabouts_client_errors_dropped_total{limit="per_address"} 2\n')
    expect(text).toContain('whereabouts_client_errors_dropped_total{limit="global"} 1\n')
  })
})
