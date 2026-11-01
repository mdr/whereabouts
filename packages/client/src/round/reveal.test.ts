import { AnswerType, type Outline } from "@whereabouts/shared/questions"
import { describe, expect, it } from "vite-plus/test"
import { h3Res } from "@whereabouts/shared/h3"
import { placeId, playerId, playerName, wikiTitle } from "@whereabouts/shared/ids"
import type { PlayerView, RevealView, RoundResultView } from "@whereabouts/shared/protocol"
import { SHOW_EVERYONE, SHOW_NOBODY, revealedFromView, revealOrder, showPlayer, shownResults } from "./reveal"
import { makePlayer, makeQuestionView } from "../test-view"

const NAMES = ["alice", "bob", "cara", "dan", "eve", "fay", "sam"]
const idOf = (name: string) => playerId(`p${NAMES.indexOf(name) + 1}`)

const player = (name: string, rank: number): PlayerView => makePlayer({ id: idOf(name), name: playerName(name), rank })
const paint = { cells: { "85283473fffffff": 1 }, floor: 0.05 }
function result(name: string, score: number, painted = true): RoundResultView {
  return {
    playerId: idOf(name),
    score,
    parts: { type: AnswerType.POINT, A: 0, B: 0 },
    res: h3Res(5),
    paint: painted ? paint : undefined
  }
}

describe("revealOrder", () => {
  it("leaves spectators out", () => {
    const sam = { ...player("sam", 0), watching: true, colour: undefined }
    const rows = revealOrder([player("alice", 1), sam], [result("alice", 500)])
    expect(rows.map((x) => x.p.name)).toEqual(["alice"])
  })

  it("puts this round's winner first, passes in score order, then anyone who sat out", () => {
    // Standings say Alice leads overall, but Cara won this round.
    const players = [
      player("alice", 1),
      player("bob", 2),
      player("cara", 3),
      player("dan", 4),
      player("eve", 5),
      player("fay", 6)
    ]
    const results = [
      result("alice", 610),
      result("bob", 250, false), // passed: scores 250, below the vague 590 but ranked by score
      result("cara", 842),
      result("dan", 590),
      result("fay", 120) // a confident miss scores below a pass
      // eve joined mid-round: no result at all
    ]
    expect(revealOrder(players, results).map((row) => row.p.name)).toEqual([
      "cara",
      "alice",
      "dan",
      "bob",
      "fay",
      "eve"
    ])
  })

  it("keeps the standings order for ties", () => {
    const players = [player("bob", 2), player("alice", 1)]
    const results = [result("alice", 500), result("bob", 500)]
    expect(revealOrder(players, results).map((row) => row.p.name)).toEqual(["alice", "bob"])
  })
})

describe("shownResults", () => {
  const results = [result("alice", 700), result("bob", 250, false), result("cara", 500)]

  it("shows everyone who painted, leaving out passes", () => {
    expect(shownResults(results, SHOW_EVERYONE).map((r) => r.playerId)).toEqual([idOf("alice"), idOf("cara")])
  })

  it("shows one player's paint alone", () => {
    expect(shownResults(results, showPlayer(idOf("cara"))).map((r) => r.playerId)).toEqual([idOf("cara")])
  })

  it("shows nobody's when paint is hidden", () => {
    expect(shownResults(results, SHOW_NOBODY)).toEqual([])
  })
})

describe("revealedFromView", () => {
  const reveal: RevealView = {
    index: 0,
    total: 5,
    question: makeQuestionView(),
    answer: { lat: 35, lon: 135.8 },
    place: placeId("kyoto"),
    label: "Kyoto",
    wiki: wikiTitle("Kyoto"),
    results: [],
    ready: []
  }

  it("takes the answer from the reveal, with the outline once loaded", () => {
    const outline: Outline = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    ]
    expect(revealedFromView(reveal, outline)).toEqual({
      label: "Kyoto",
      wiki: "Kyoto",
      answer: { lat: 35, lon: 135.8 },
      outline,
      photo: undefined
    })
    expect(revealedFromView(reveal, undefined).outline).toBeUndefined()
  })
})
