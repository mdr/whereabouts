import { describe, expect } from "vite-plus/test"
import { MAX_PLAYERS, mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { YouRoleType } from "@whereabouts/shared/roles"
import { expectRefused } from "../test-support/refused.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

describe("rules, as players meet them", () => {
  const it = useInProcessServer()

  it("seats a would-be player as a spectator when the game has all its players", async ({ server }) => {
    const alice = await server.host("Alice")
    server.seat(
      alice.code,
      Array.from({ length: MAX_PLAYERS - 1 }, (_, index) => `P${index + 1}`)
    )
    const late = server.player("Late")
    await late.join(alice.code)
    const lobby = await late.expectLobby()
    expect(lobby.you.role.type).toBe(YouRoleType.SPECTATOR)
  })

  it("lets a player switch to watching in the lobby", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await bob.watch()
    expect((await alice.expectLobby()).players.map((player) => player.name)).toEqual(["Alice"])
    await bob.takeSeat()
  })

  it("refuses to let a player leave once the game has started", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await alice.start()
    await bob.expectGuessing()

    await expectRefused(() => bob.leave(), "you can only leave from the lobby")
    bob.expectStillConnected()
  })

  it("refuses a player who is not the host the host's controls", async ({ server }) => {
    const alice = await server.host("Alice")
    const bob = await alice.invite("Bob")
    await expectRefused(() => bob.setMix(mixOf({ [QuestionType.PLACE]: 1 })), "only the host can change settings")
    await alice.start()
    await bob.expectGuessing()
    await expectRefused(() => bob.remove(alice), "only the host can remove players")

    server.passDeadline()
    await bob.expectReveal(0)
    await expectRefused(() => bob.next(), "only the host can advance")

    await alice.endGame()
    await bob.expectResults()
    await expectRefused(() => bob.playAgain(), "only the host can restart")
  })
})
