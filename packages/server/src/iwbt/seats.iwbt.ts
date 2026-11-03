import { describe, expect } from "vite-plus/test"
import { viewIn } from "@whereabouts/shared/game/view-in"
import {
  MAX_PLAYERS,
  MAX_SPECTATORS,
  EMPTY_GAME_GRACE,
  EMPTY_RESULTS_GRACE,
  SEAT_GRACE
} from "@whereabouts/shared/protocol/config"
import { Phase } from "@whereabouts/shared/protocol/views"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("seats", () => {
  const it = useInProcessServer()

  it("a reconnecting player keeps their seat, and gets their paint back", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    const bobPaint = await bob.paintOnAnswer()
    await bob.lockIn()
    // Paint goes back only to a player who rejoins, not with every state.
    expect(viewIn(bob.view, Phase.GUESSING).you.paint).toBeUndefined()

    bob.disconnect()
    await alice.expectOffline(bob)

    await bob.reconnect()
    const back = await alice.expectEveryoneConnected()
    expect(back.players.filter((player) => player.name === "Bob")).toHaveLength(1)
    const own = await bob.expectGuessing()
    expect(own.you.role.type).toBe(YouRoleType.PLAYING)
    expect(own.you.paint).toEqual(decodePaint(encodePaint(bobPaint)))
  })

  const emptyGraces = [
    [Phase.LOBBY, SEAT_GRACE],
    [Phase.GUESSING, EMPTY_GAME_GRACE],
    [Phase.REVEAL, EMPTY_GAME_GRACE],
    [Phase.RESULTS, EMPTY_RESULTS_GRACE]
  ] as const

  for (const [phase, grace] of emptyGraces)
    it(`frees a room left empty in ${phase} once it has been empty for ${grace} ms`, async ({ server }) => {
      const alice = await server.host("Alice")
      if (phase !== Phase.LOBBY) await alice.start()
      if (phase === Phase.REVEAL) server.passDeadline()
      if (phase === Phase.RESULTS) await alice.endGame()
      await alice.expectPhase(phase)
      const { code } = alice
      alice.disconnect()
      await server.untilNobodyConnected(code)
      server.clock.advance(grace - 1_000)
      expect(server.game(code)).toBeDefined()
      server.clock.advance(1_000)
      expect(server.game(code)).toBeUndefined()
    })

  it("a lone host who refreshes in the lobby gets the game, and the host role, back", async ({ server }) => {
    const alice = await server.host("Alice")
    const { code } = alice
    alice.disconnect()
    await server.untilNobodyConnected(code)
    server.clock.advance(SEAT_GRACE - 1_000)
    await alice.reconnect()
    await alice.expectHost()
    await alice.expectLobbyWith(["Alice"])
    // The empty-room timer was cancelled on the way back in.
    server.clock.advance(SEAT_GRACE)
    expect(server.game(code)).toBeDefined()
  })

  it("a host who leaves the lobby frees their seat at once and hands over", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.leave()
    await alice.expectClosedFor(CloseReason.LEFT)
    await bob.expectLobbyWith(["Bob"])
    await bob.expectHost()
  })

  it("a spectator joins to watch, and can take a seat in the lobby", async ({ server }) => {
    const alice = await server.host("Alice")
    const sam = server.player("Sam")
    await sam.join(alice.code, Role.SPECTATOR)
    const watching = await sam.expectHeadcount(2)
    expect(watching.spectators).toHaveLength(1)
    expect(watching.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(watching.players).toHaveLength(1)
    expect(watching.spectators[0]).toMatchObject({ name: "Sam", type: Role.SPECTATOR })
    expect(watching.spectators[0]).not.toHaveProperty("colour")
    await sam.takeSeat()
    await alice.expectSeeing(sam)
    expect(alice.playingSeatOf(sam).colour).toBeGreaterThanOrEqual(0)
  })

  it("the host hands over to another player", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.handHostTo(bob)
    await bob.expectHost()
    await alice.expectNotHost()
  })

  it("the host removes a player: their connection closes as removed, and that seat cannot come back", async ({
    server
  }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.remove(bob)
    await bob.expectClosedFor(CloseReason.REMOVED)
    await alice.expectLobbyWith(["Alice"])

    await bob.reconnect()
    await bob.expectClosedFor(CloseReason.REMOVED)
  })

  it("a player removed during a reveal still has their name and colour in its results", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await alice.expectGuessing()
    await alice.paintOnAnswer()
    await alice.lockIn()
    await bob.lockIn()
    await alice.expectReveal()
    const bobSeat = alice.playingSeatOf(bob)

    await alice.remove(bob)
    const after = await alice.expectReveal()
    expect(after.results).toContainEqual(
      expect.objectContaining({ playerId: bobSeat.id, name: bobSeat.name, colour: bobSeat.colour })
    )
  })

  it("a second tab replaces the first, whose closing then leaves the seat alone", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    const bobTab2 = server.player("Bob")
    await bobTab2.join(alice.code)
    await bob.expectClosedFor(CloseReason.REPLACED)

    await bobTab2.rename("Bobby")
    await alice.expectSeeing("Bobby")
    server.clock.advance(SEAT_GRACE)
    await bobTab2.rename("Bob")
    const after = await alice.expectSeeing("Bob")
    expect(after.players).toHaveLength(2)
    expect(after.players.every((player) => player.connected)).toBe(true)
  })

  it("while the host is away the next player acts as host, until the host is back", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    alice.disconnect()
    await bob.expectHost()

    await alice.reconnect()
    await alice.expectHost()
    await bob.expectNotHost()
  })

  it("a full game turns a newcomer away", async ({ server }) => {
    const alice = await server.host("Alice")
    const guests = Array.from({ length: MAX_PLAYERS + MAX_SPECTATORS - 1 }, (_, index) =>
      server.player(`P${index + 1}`)
    )
    await Promise.all(
      guests.map((guest, index) => guest.join(alice.code, index + 1 >= MAX_PLAYERS ? Role.SPECTATOR : Role.PLAYER))
    )
    await alice.expectHeadcount(MAX_PLAYERS + MAX_SPECTATORS)
    const late = server.player("Late")
    await late.join(alice.code)
    await late.expectClosedFor(CloseReason.FULL)
  })

  it("once the game is over, a newcomer is told so, and a player who dropped can come back to the results", async ({
    server
  }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    await alice.endGame()
    await bob.expectResults()

    const late = server.player("Late")
    await late.join(alice.code)
    await late.expectClosedFor(CloseReason.FINISHED)

    bob.disconnect()
    await alice.expectOffline(bob)
    await bob.reconnect()
    await bob.expectResults()
  })
})
