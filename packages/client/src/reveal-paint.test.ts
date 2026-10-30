import { describe, expect, it } from "vite-plus/test"
import { h3Cell, h3Res } from "@whereabouts/shared/h3"
import { colourCss, playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import type { PlayerView, RoundResultView } from "@whereabouts/shared/protocol"
import { paintsOf } from "./reveal-paint"

const NAMES = ["alice", "bob"]
const idOf = (name: string) => playerId(`p${NAMES.indexOf(name) + 1}`)

function player(name: string, colour = 0): PlayerView {
  return {
    id: idOf(name),
    name: playerName(name),
    colour: playerColour(colour),
    watching: false,
    connected: true,
    isHost: false,
    locked: false,
    score: 0,
    rank: 1,
    previousRank: undefined
  }
}
function result(name: string, score = 500): RoundResultView {
  return {
    playerId: idOf(name),
    score,
    A: 0,
    B: 0,
    res: h3Res(5),
    paint: { cells: { [h3Cell("85283473fffffff")]: 1 }, floor: 0.05 }
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
    expect(paints.map((p) => p.colour)).toEqual([colourCss(bob.colour), colourCss(alice.colour)])
    expect(paints[1]!.features[0]!.properties).toMatchObject({ colour: colourCss(alice.colour) })
  })
})
