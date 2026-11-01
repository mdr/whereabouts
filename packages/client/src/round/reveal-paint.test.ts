import { describe, expect, it } from "vite-plus/test"
import { colourCss, playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { makePainted, makePlayer } from "../test-view"
import type { RoundResultView } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { paintsOf } from "./reveal-paint"

const NAMES = ["alice", "bob"]
const idOf = (name: string) => playerId(`p${NAMES.indexOf(name) + 1}`)

const player = (name: string, colour = 0): PlayingPlayerView =>
  makePlayer({ id: idOf(name), name: playerName(name), colour: playerColour(colour) })
function result(name: string, score = 500): RoundResultView {
  return {
    playerId: idOf(name),
    score,
    guess: makePainted()
  }
}

describe("paintsOf", () => {
  const alice = player("alice", 0)
  const bob = player("bob", 1)
  const players = [alice, bob]

  it("builds each player's paint once per reveal, however often it is shown", () => {
    const results = [result("alice"), result("bob")]
    const [bobInEveryone, aliceInEveryone] = paintsOf(results, players)
    const [aliceAgain] = paintsOf([results[0]!], players)
    const [bobAgain] = paintsOf([results[1]!], players)
    expect(aliceAgain).toBe(aliceInEveryone)
    expect(bobAgain).toBe(bobInEveryone)
  })

  it("builds afresh for a new reveal", () => {
    const [before] = paintsOf([result("alice")], players)
    const [after] = paintsOf([result("alice")], players)
    expect(after).not.toBe(before)
    expect(after!.layer).not.toBe(before!.layer)
  })

  it("puts the best last, to draw on top, each in its player's colour", () => {
    const paints = paintsOf([result("alice", 800), result("bob", 300)], players)
    expect(paints.map((paint) => paint.colour)).toEqual([colourCss(bob.colour), colourCss(alice.colour)])
    expect(paints[1]!.features[0]!.properties).toMatchObject({ colour: colourCss(alice.colour) })
  })
})
