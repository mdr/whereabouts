import { describe, expect, it } from "vite-plus/test"
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { viewIn } from "@whereabouts/shared/game/view-in"
import {
  MAX_PLAYERS,
  MAX_SPECTATORS,
  EMPTY_GAME_GRACE,
  EMPTY_RESULTS_GRACE,
  SEAT_GRACE
} from "@whereabouts/shared/protocol/config"
import { Phase } from "@whereabouts/shared/protocol/views"
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { answerCentre } from "@whereabouts/shared/questions"
import { type GameRoom } from "../rooms.ts"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import { lockedIn, config, askedIn, host, join, eventually, paintAt, useGameServer } from "./test-server.ts"

describe("seats", () => {
  const server = useGameServer()

  it("a reconnecting player keeps their seat, and gets their paint back", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)
    alice.send(ClientTopic.START)
    const round = await bob.until((view) => view.phase === Phase.GUESSING)
    const question = askedIn(round)
    const at = answerCentre(question.answer)
    const bobPaint = paintAt(question, at.lat, at.lon)
    bob.sendPaint(bobPaint)
    bob.send(ClientTopic.LOCK)
    await bob.untilLatest(lockedIn)
    // Paint goes back only to a player who rejoins, not with every state.
    expect(viewIn(bob.latest, Phase.GUESSING).you.paint).toBeUndefined()

    bob.client.disconnect()
    await alice.until((view) => view.players.some((player) => player.name === "Bob" && !player.connected))

    const bobAgain = server.player("Bob") // same name => same deterministic token
    bobAgain.connect(join(lobby.code))
    const back = await alice.untilLatest(
      (view) => view.players.length === 2 && view.players.every((player) => player.connected)
    )
    expect(back.players.filter((player) => player.name === "Bob")).toHaveLength(1)
    const own = await bobAgain.until((view) => view.phase === Phase.GUESSING)
    expect(own.you.role.type).toBe(YouRoleType.PLAYING)
    expect(viewIn(own, Phase.GUESSING).you.paint).toEqual(decodePaint(encodePaint(bobPaint)))
  })

  it.each([
    [Phase.LOBBY, SEAT_GRACE],
    [Phase.GUESSING, EMPTY_GAME_GRACE],
    [Phase.REVEAL, EMPTY_GAME_GRACE],
    [Phase.RESULTS, EMPTY_RESULTS_GRACE]
  ])("frees a room left empty in %s once it has been empty for %i ms", async (phase, grace) => {
    const alice = server.player("Alice")
    alice.connect(host())
    const { code } = await alice.until((view) => view.phase === Phase.LOBBY)
    if (phase !== Phase.LOBBY) {
      alice.send(ClientTopic.START)
      await alice.until((view) => view.phase === Phase.GUESSING)
    }
    if (phase === Phase.REVEAL) server.clock.advance(config.roundLength + ROUND_GRACE)
    if (phase === Phase.RESULTS) alice.send(ClientTopic.END)
    await alice.until((view) => view.phase === phase)
    const room = server.app.rivalis.rooms.get(code) as GameRoom
    alice.client.disconnect()
    await eventually(() => room.state.connectedCount === 0, "the server to see Alice go")
    server.clock.advance(grace - 1_000)
    expect(server.app.rivalis.rooms.get(code) ?? undefined).not.toBeUndefined()
    server.clock.advance(1_000)
    expect(server.app.rivalis.rooms.get(code) ?? undefined).toBeUndefined()
  })

  it("a lone host who refreshes in the lobby gets the game, and the host role, back", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    alice.client.disconnect()
    await alice.waitClosed()
    server.clock.advance(SEAT_GRACE - 1_000)
    const again = server.player("Alice") // same name => same token, like a refreshed tab
    again.connect(join(lobby.code))
    const back = await again.until((view) => view.phase === Phase.LOBBY)
    expect(back.you.isHost).toBe(true)
    expect(back.players).toHaveLength(1)
    // The empty-room timer was cancelled on the way back in.
    server.clock.advance(SEAT_GRACE)
    expect(server.app.rivalis.rooms.get(lobby.code) ?? undefined).not.toBeUndefined()
  })

  it("a host who leaves the lobby frees their seat at once and hands over", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)
    alice.send(ClientTopic.LEAVE)
    await alice.waitClosed()
    expect(alice.client.connected).toBe(false)
    expect(alice.closedFor).toBe(CloseReason.LEFT)
    const after = await bob.untilLatest((view) => view.players.length === 1)
    expect(after.you.isHost).toBe(true)
  })

  it("a spectator joins to watch, and can take a seat in the lobby", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const sam = server.player("Sam")
    sam.connect(join(lobby.code, Role.SPECTATOR))
    const watching = await sam.until((view) => view.spectators.length === 1)
    expect(watching.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(watching.players).toHaveLength(1)
    expect(watching.spectators[0]).toMatchObject({ name: "Sam", type: Role.SPECTATOR })
    expect(watching.spectators[0]).not.toHaveProperty("colour")
    sam.send(ClientTopic.SET_ROLE, { role: Role.PLAYER })
    const seated = await alice.untilLatest((view) => view.players.some((player) => player.name === "Sam"))
    expect(seated.players.find((player) => player.name === "Sam")!.colour).toBeGreaterThanOrEqual(0)
  })

  it("the host hands over to another player", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    const two = await alice.until((view) => view.players.length === 2)
    alice.send(ClientTopic.MAKE_HOST, { playerId: two.players.find((player) => player.name === "Bob")!.id })
    await bob.until((view) => view.you.isHost)
    await alice.untilLatest((view) => !view.you.isHost)
  })

  it("the host removes a player: their connection closes as removed, and that seat cannot come back", async () => {
    const { alice, bob, code, bobId } = await server.aliceAndBob()
    alice.send(ClientTopic.KICK, { playerId: bobId })
    await bob.waitClosed()
    expect(bob.closedFor).toBe(CloseReason.REMOVED)
    await alice.untilLatest((view) => view.players.length === 1)

    const bobAgain = server.player("Bob")
    bobAgain.connect(join(code))
    await bobAgain.waitClosed()
    expect(bobAgain.closedFor).toBe(CloseReason.REMOVED)
  })

  it("a player removed during a reveal still has their name and colour in its results", async () => {
    const { alice, bob, bobId } = await server.aliceAndBob()
    alice.send(ClientTopic.START)
    const round = await alice.until((view) => view.phase === Phase.GUESSING)
    const at = answerCentre(askedIn(round).answer)
    alice.sendPaint(paintAt(askedIn(round), at.lat, at.lon))
    alice.send(ClientTopic.LOCK)
    bob.send(ClientTopic.LOCK)
    const revealing = await alice.until((view) => view.phase === Phase.REVEAL)
    const bobSeat = revealing.players.find((player) => player.id === bobId)!

    alice.send(ClientTopic.KICK, { playerId: bobId })
    const after = await alice.untilLatest((view) => view.players.length === 1)
    expect(viewIn(after, Phase.REVEAL).reveal.results).toContainEqual(
      expect.objectContaining({ playerId: bobId, name: bobSeat.name, colour: bobSeat.colour })
    )
  })

  it("a second tab replaces the first, whose closing then leaves the seat alone", async () => {
    const { alice, bob, code } = await server.aliceAndBob()
    const bobTab2 = server.player("Bob")
    bobTab2.connect(join(code))
    await bob.waitClosed()
    expect(bob.closedFor).toBe(CloseReason.REPLACED)

    bobTab2.send(ClientTopic.RENAME, { name: "Bobby" })
    await alice.untilLatest((view) => view.players.some((player) => player.name === "Bobby" && player.connected))
    server.clock.advance(SEAT_GRACE)
    bobTab2.send(ClientTopic.RENAME, { name: "Bob" })
    const after = await alice.untilLatest((view) => view.players.some((player) => player.name === "Bob"))
    expect(after.players).toHaveLength(2)
    expect(after.players.every((player) => player.connected)).toBe(true)
  })

  it("while the host is away the next player acts as host, until the host is back", async () => {
    const { alice, bob, code } = await server.aliceAndBob()
    alice.client.disconnect()
    await bob.untilLatest((view) => view.you.isHost)

    const aliceAgain = server.player("Alice")
    aliceAgain.connect(join(code))
    await aliceAgain.untilLatest((view) => view.you.isHost)
    await bob.untilLatest((view) => !view.you.isHost)
  })

  it("a full game turns a newcomer away", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const { code } = await alice.until((view) => view.phase === Phase.LOBBY)
    for (let i = 1; i < MAX_PLAYERS + MAX_SPECTATORS; i++) {
      const testPlayer = server.player(`P${i}`)
      testPlayer.connect(join(code, i >= MAX_PLAYERS ? Role.SPECTATOR : Role.PLAYER))
    }
    await alice.until((view) => view.players.length + view.spectators.length === MAX_PLAYERS + MAX_SPECTATORS, 10_000)
    const late = server.player("Late")
    late.connect(join(code))
    await late.waitClosed()
    expect(late.closedFor).toBe(CloseReason.FULL)
  })

  it("once the game is over, a newcomer is told so, and a player who dropped can come back to the results", async () => {
    const { alice, bob, code } = await server.aliceAndBob()
    alice.send(ClientTopic.START)
    await bob.until((view) => view.phase === Phase.GUESSING)
    alice.send(ClientTopic.END)
    await bob.until((view) => view.phase === Phase.RESULTS)

    const late = server.player("Late")
    late.connect(join(code))
    await late.waitClosed()
    expect(late.closedFor).toBe(CloseReason.FINISHED)

    bob.client.disconnect()
    await alice.untilLatest((view) => view.players.some((player) => player.name === "Bob" && !player.connected))
    const bobAgain = server.player("Bob")
    bobAgain.connect(join(code))
    await bobAgain.until((view) => view.phase === Phase.RESULTS)
  })
})
