import { describe, expect, it } from "vite-plus/test"
import { colourCss, playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName, type PlayerId } from "@whereabouts/shared/ids"
import { makePainted } from "../test-view"
import type { RoundResultView } from "@whereabouts/shared/protocol/views"
import { paintsOf } from "./reveal-paint"

const NAMES = ["alice", "bob"]
const idOf = (name: string): PlayerId => playerId(`p${NAMES.indexOf(name) + 1}`)

const result = (name: string, score = 500): RoundResultView => ({
  playerId: idOf(name),
  name: playerName(name),
  colour: playerColour(NAMES.indexOf(name)),
  score,
  guess: makePainted()
})

describe("paintsOf", () => {
  const alice = playerColour(0)
  const bob = playerColour(1)

  it("builds each player's paint once per reveal, however often it is shown", () => {
    const results = [result("alice"), result("bob")]
    const [bobInEveryone, aliceInEveryone] = paintsOf(results)
    const [aliceAgain] = paintsOf([results[0]!])
    const [bobAgain] = paintsOf([results[1]!])
    expect(aliceAgain).toBe(aliceInEveryone)
    expect(bobAgain).toBe(bobInEveryone)
  })

  it("builds afresh for a new reveal", () => {
    const [before] = paintsOf([result("alice")])
    const [after] = paintsOf([result("alice")])
    expect(after).not.toBe(before)
    expect(after!.layer).not.toBe(before!.layer)
  })

  it("puts the best last, to draw on top, each in its player's colour", () => {
    const paints = paintsOf([result("alice", 800), result("bob", 300)])
    expect(paints.map((paint) => paint.colour)).toEqual([colourCss(bob), colourCss(alice)])
    expect(paints[1]!.features[0]!.properties).toMatchObject({ colour: colourCss(alice) })
  })
})
