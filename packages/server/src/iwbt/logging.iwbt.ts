import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect } from "vite-plus/test"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { QuestionType } from "@whereabouts/shared/questions"
import { LogCode } from "../telemetry/log-event.ts"
import { eventually } from "../test-support/eventually.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("the game's lifecycle in the logs", () => {
  const it = useInProcessServer()

  it("logs a game played to the end, event by event", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()
    await alice.paintOnAnswer()
    await alice.lockIn()
    server.passDeadline()
    await alice.expectReveal(0)
    await alice.next()
    await bob.expectGuessing(1)
    server.passDeadline()
    await bob.expectReveal(1)
    await alice.ready()
    await bob.ready()
    await alice.expectResults()

    expect(server.logEvents.map((line) => line.code)).toEqual([
      LogCode.ROOM_OPENED,
      LogCode.PLAYER_JOINED,
      LogCode.PLAYER_JOINED,
      LogCode.GAME_STARTED,
      LogCode.ROUND_STARTED,
      LogCode.ROUND_REVEALED,
      LogCode.ROUND_STARTED,
      LogCode.ROUND_REVEALED,
      LogCode.GAME_ENDED
    ])
    const [opened, joinedAlice, joinedBob, started, firstRound, firstReveal, , , ended] = server.logEvents
    expect(opened).toMatchObject({ room: alice.code, component: "room" })
    expect(joinedAlice).toMatchObject({ room: alice.code, playerId: alice.id, name: "Alice", rejoined: false })
    expect(joinedBob).toMatchObject({ name: "Bob", rejoined: false })
    expect(started).toMatchObject({ playerCount: 2, rounds: 2 })
    expect(firstRound).toMatchObject({ index: 0, questionType: QuestionType.PLACE })
    expect(firstReveal).toMatchObject({ index: 0, painted: 1, passed: 0, missing: 1 })
    expect(ended).toMatchObject({ completed: true, roundsPlayed: 2, playerCount: 2 })
  })

  it("leaves out where players come from, and what they painted", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()
    await alice.paintOnAnswer()
    await alice.lockIn()
    await alice.expectReveal(0)

    for (const line of server.logEvents) expect(Object.keys(line)).not.toContain("address")
    expect(JSON.stringify(server.logLines)).not.toMatch(/"(paint|guess|score)"/)
  })

  it("logs a game ended early as not completed", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()
    await alice.endGame()
    await alice.expectResults()

    expect(server.logEvents.at(-1)).toMatchObject({
      code: LogCode.GAME_ENDED,
      completed: false,
      roundsPlayed: 1,
      playerCount: 1
    })
  })

  it("logs a player leaving, coming back, and being removed", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    bob.disconnect()
    await eventually(
      () => server.logEvents.some((line) => line.code === LogCode.PLAYER_LEFT),
      () => "Bob's departure to be logged"
    )
    await bob.reconnect()
    await alice.remove(bob)
    await eventually(
      () => server.logEvents.filter((line) => line.code === LogCode.PLAYER_LEFT).length === 2,
      () => "Bob's removal to be logged as a departure"
    )

    const events = server.logEvents.map((line) => line.code)
    expect(events.slice(-4)).toEqual([
      LogCode.PLAYER_LEFT,
      LogCode.PLAYER_JOINED,
      LogCode.PLAYER_REMOVED,
      LogCode.PLAYER_LEFT
    ])
    expect(server.logEvents.filter((line) => line.code === LogCode.PLAYER_JOINED).at(-1)).toMatchObject({
      name: "Bob",
      rejoined: true
    })
    expect(server.logEvents.find((line) => line.code === LogCode.PLAYER_REMOVED)).toMatchObject({ name: "Bob" })
  })

  it("logs a room closing, with how long it was open", async ({ server }) => {
    const alice = await server.host("Alice")
    server.clock.advance(5000)
    await alice.leave()
    await server.untilGameFreed(alice.code)

    expect(server.logEvents.at(-1)).toMatchObject({
      code: LogCode.ROOM_CLOSED,
      openMs: expect.toSatisfy((ms: number) => ms >= 5000)
    })
  })

  it("logs a player turned away, with where they came from", async ({ server }) => {
    const alice = await server.host("Alice")
    await alice.start()
    await alice.expectGuessing()
    await alice.endGame()
    await alice.expectResults()
    await server.player("Late").join(alice.code)
    await eventually(
      () => server.logEvents.some((line) => line.code === LogCode.PLAYER_TURNED_AWAY),
      () => "the turn-away to be logged"
    )
    expect(server.logEvents.find((line) => line.code === LogCode.PLAYER_TURNED_AWAY)).toMatchObject({
      name: "Late",
      reason: CloseReason.FINISHED,
      address: expect.any(String)
    })
  })

  it("writes what Rivalis logs as JSON with the component that logged it", async ({ server }) => {
    await server.host("Alice")
    const transport = server.logLines.find((line) => line.component === "transport:websocket")
    expect(transport).toMatchObject({ level: "info", msg: "initialized" })
  })
})

describe("request logging", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wa-logging-"))
  mkdirSync(path.join(directory, "assets"))
  writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>t</title>")
  writeFileSync(path.join(directory, "assets", "index-abc123.js"), "export {};")
  afterAll(() => rmSync(directory, { recursive: true, force: true }))
  const it = useInProcessServer({ staticDir: directory })

  it("leaves out health checks and files served fine", async ({ server }) => {
    await fetch(`${server.httpUrl}/api/health`)
    await fetch(`${server.httpUrl}/assets/index-abc123.js`)
    await fetch(`${server.httpUrl}/`)
    await fetch(`${server.httpUrl}/some/app/route`)

    expect(server.logEvents.filter((line) => line.code === LogCode.REQUEST)).toEqual([])
  })

  it("logs a bundle file that is gone, which an old tab asks for after a deploy", async ({ server }) => {
    await fetch(`${server.httpUrl}/assets/index-old.js`)

    await eventually(
      () => server.logEvents.some((line) => line.code === LogCode.REQUEST),
      () => "the request to be logged"
    )
    expect(server.logEvents.find((line) => line.code === LogCode.REQUEST)).toMatchObject({
      level: "info",
      method: "GET",
      path: "/assets/index-old.js",
      statusCode: 404
    })
  })
})
