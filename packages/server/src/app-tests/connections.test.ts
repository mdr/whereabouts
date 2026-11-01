import { describe, expect, it } from "vite-plus/test"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { PAINT_CELL_BUDGET } from "@whereabouts/shared/paint/compact"
import { PROTOCOL_VERSION, encodeTicket, type Ticket } from "@whereabouts/shared/protocol/ticket"
import { SEAT_GRACE } from "@whereabouts/shared/protocol/config"
import { Phase } from "@whereabouts/shared/protocol/views"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { gridDisk, h3Resolution, latLngToCell } from "@whereabouts/shared/h3"
import { HintAxis } from "@whereabouts/shared/hints"
import { roomCode } from "@whereabouts/shared/ids"
import { answerCentre } from "@whereabouts/shared/questions"
import { MAX_PAYLOAD_BYTES } from "../app.ts"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { askedIn, host, join, eventually, paintAt, pollErrors, useGameServer } from "./test-server.ts"

describe("connections", () => {
  const server = useGameServer()

  it("rejects bad codes and malformed tickets, and tells an outdated client so", async () => {
    const nobody = server.player("Nobody")
    nobody.connect(join(roomCode("ZZZZ")))
    await nobody.waitClosed()
    expect(nobody.client.connected).toBe(false)
    expect(nobody.states).toHaveLength(0)
    expect(nobody.closedFor).toBe(CloseReason.NO_SUCH_GAME)

    const old = server.player("Old")
    old.client.connect(encodeTicket({ v: PROTOCOL_VERSION - 1, token: old.token, name: old.name } as unknown as Ticket))
    await old.waitClosed()
    expect(old.closedFor).toBe(CloseReason.OUTDATED)

    const garbage = server.player("Garbage")
    garbage.client.connect("not-a-ticket")
    await garbage.waitClosed()
    expect(garbage.client.connected).toBe(false)
  })

  it("hosts a game under a code no game has, and joins it if someone just did", async () => {
    const alice = server.player("Alice")
    alice.connect(host(roomCode("VWZR")))
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    expect(lobby.code).toBe("VWZR")
    expect(lobby.you.isHost).toBe(true)

    const bob = server.player("Bob")
    bob.connect(host(roomCode("VWZR")))
    const bobView = await bob.until((view) => view.players.length === 2)
    expect(bobView.you.isHost).toBe(false)
  })

  it("answers bad messages with errors instead of dropping the player", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    await alice.until((view) => view.phase === Phase.LOBBY)
    alice.send("start")
    await alice.until((view) => view.phase === Phase.GUESSING)

    alice.client.send("rename", "this is not json")
    expect(await pollErrors(alice)).toContain("malformed message")
    alice.errors.length = 0

    alice.client.send("paint", "this is not paint")
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    const tooMany = gridDisk(latLngToCell(0, 0, h3Resolution(7)), 45).slice(0, PAINT_CELL_BUDGET + 1)
    alice.sendPaint({ cells: Object.fromEntries(tooMany.map((cell) => [cell, 1])), floor: 0 })
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    // Not a cell: scoring it would throw.
    const notACell = encodePaint({ cells: { [latLngToCell(0, 0, h3Resolution(5))]: 1 }, floor: 0 })
    notACell.fill(0xff, 8, 16)
    alice.client.send("paint", notACell)
    expect(await pollErrors(alice)).toContain("invalid paint")
    alice.errors.length = 0

    // A game-level rejection (as opposed to a schema one) also comes back as an error.
    alice.send("hint", { axis: HintAxis.LATITUDE })
    alice.send("hint", { axis: HintAxis.LONGITUDE })
    expect(await pollErrors(alice)).toContain("one hint per round")
    alice.errors.length = 0

    // Unknown topics are dropped silently rather than kicking (version skew tolerance).
    alice.client.send("no-such-topic", "{}")
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(alice.client.connected).toBe(true)
    expect(alice.errors).toHaveLength(0)
  })

  it("answers a ping with a pong", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    await alice.until((view) => view.phase === Phase.LOBBY)
    let pongs = 0
    alice.client.on("pong", () => pongs++)
    alice.client.send("ping", "")
    await eventually(() => pongs === 1, "a pong")
  })

  it("survives an oversized frame: the sender is dropped, everyone else carries on", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)

    // Just over the limit. ws rejects it with close code 1009.
    const huge = "x".repeat(MAX_PAYLOAD_BYTES + 1)
    bob.client.send("paint", huge)
    await bob.waitClosed()
    expect(bob.client.connected).toBe(false)

    // The process is alive and the room still works. Bob shows offline, and
    // his lobby seat is freed once the grace period passes.
    expect(alice.client.connected).toBe(true)
    await alice.untilLatest((view) => view.players.some((player) => player.name === "Bob" && !player.connected))
    server.clock.advance(SEAT_GRACE)
    await alice.untilLatest((view) => view.players.length === 1)
    const cara = server.player("Cara")
    cara.connect(join(lobby.code))
    await cara.until((view) => view.phase === Phase.LOBBY)
  })

  it("sends a round's reveal once, and again only to a player who reconnects", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)
    alice.send("start")
    const round = await bob.until((view) => view.phase === Phase.GUESSING)
    const question = askedIn(round)
    const at = answerCentre(question.answer)
    const paint = paintAt(question, at.lat, at.lon)
    alice.sendPaint(paint)
    alice.send("lock")
    bob.send("lock")
    await alice.until((view) => view.phase === Phase.REVEAL)

    bob.send("rename", { name: "Bobby" })
    const renamed = await alice.untilLatest((view) => view.players.some((player) => player.name === "Bobby"))
    expect(viewIn(renamed, Phase.REVEAL).reveal.results).toHaveLength(2)
    expect(alice.reveals).toHaveLength(1)
    const aCell = Object.keys(paint.cells)[0]!
    expect(alice.rawStates.at(-1)).not.toContain(aCell)

    bob.client.disconnect()
    await alice.until((view) => view.players.some((player) => player.name === "Bobby" && !player.connected))
    const bobAgain = server.player("Bob")
    bobAgain.connect(join(lobby.code))
    const back = await bobAgain.until((view) => view.phase === Phase.REVEAL)
    expect(viewIn(back, Phase.REVEAL).reveal.results).toHaveLength(2)
    expect(bobAgain.reveals).toHaveLength(1)
    await alice.untilLatest((view) => view.players.every((player) => player.connected))
    expect(alice.reveals).toHaveLength(1)
  })

  it("closes a connection that floods messages, and only that one", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = server.player("Bob")
    bob.connect(join(lobby.code))
    await alice.until((view) => view.players.length === 2)

    for (let i = 0; i < 40; i++) bob.send("rename", { name: i % 2 ? "Bob" : "Bobby" })
    await bob.waitClosed()
    expect(bob.client.connected).toBe(false)
    expect(alice.client.connected).toBe(true)
  })

  it("shutting the server down tells players it restarted", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    await alice.until((view) => view.phase === Phase.LOBBY)
    await server.app.close()
    await alice.waitClosed()
    expect(alice.closedFor).toBe(CloseReason.SERVER_RESTARTED)
  })

  it("the last player leaving closes the game without waiting", async () => {
    const alice = server.player("Alice")
    alice.connect(host())
    const lobby = await alice.until((view) => view.phase === Phase.LOBBY)
    alice.send("leave")
    await alice.waitClosed()
    await eventually(() => !server.app.rivalis.rooms.get(lobby.code), "the room to close")
  })
})

describe("connections per address", () => {
  const server = useGameServer({ addressLimits: { maxOpen: 2, burst: 100, perSecond: 1 } })

  it("refuses connections over the limit, and lets them in once one closes", async () => {
    const [alice, bob, carol] = ["Alice", "Bob", "Carol"].map((name) => server.player(name))
    alice!.connect(host())
    const { code } = await alice!.until((view) => view.phase === Phase.LOBBY)
    bob!.connect(join(code))
    await alice!.until((view) => view.players.length === 2)

    carol!.connect(join(code))
    await carol!.waitClosed()
    expect(carol!.states).toEqual([])

    bob!.client.disconnect()
    await alice!.untilLatest((view) => view.players.some((player) => player.name === "Bob" && !player.connected))
    carol!.connect(join(code))
    await alice!.until((view) => view.players.some((player) => player.name === "Carol"))
  })
})
