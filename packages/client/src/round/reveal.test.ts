import type { Outline } from "@whereabouts/shared/questions"
import { describe, expect, it } from "vite-plus/test"
import { placeId, playerId, playerName, wikiTitle } from "@whereabouts/shared/ids"
import { RoundGuessType, type RevealView, type RoundResultView } from "@whereabouts/shared/protocol/views"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { SHOW_EVERYONE, SHOW_NOBODY, revealedFromView, revealOrder, showPlayer, shownResults } from "./reveal"
import { makeCountryQuestionView, makePainted, makePlayer, makeQuestionView } from "../test-view"
import { RevealedShapeType } from "./revealed-shape"

const NAMES = ["alice", "bob", "cara", "dan", "eve", "fay", "sam"]
const idOf = (name: string) => playerId(`p${NAMES.indexOf(name) + 1}`)

const player = (name: string, rank: number): PlayingPlayerView =>
  makePlayer({ id: idOf(name), name: playerName(name), rank })
const result = (name: string, score: number, painted = true): RoundResultView => ({
  playerId: idOf(name),
  score,
  guess: painted ? makePainted() : { type: RoundGuessType.PASSED }
})

describe("revealOrder", () => {
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
    expect(revealOrder(players, results).map((row) => row.player.name)).toEqual([
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
    expect(revealOrder(players, results).map((row) => row.player.name)).toEqual(["alice", "bob"])
  })
})

describe("shownResults", () => {
  const results = [result("alice", 700), result("bob", 250, false), result("cara", 500)]

  it("shows everyone who painted, leaving out passes", () => {
    expect(shownResults(results, SHOW_EVERYONE).map((result) => result.playerId)).toEqual([idOf("alice"), idOf("cara")])
  })

  it("shows one player's paint alone", () => {
    expect(shownResults(results, showPlayer(idOf("cara"))).map((result) => result.playerId)).toEqual([idOf("cara")])
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

  it("takes the answer from the reveal, as a point on a place round", () => {
    expect(revealedFromView(reveal, undefined)).toEqual({
      label: "Kyoto",
      wiki: "Kyoto",
      answer: { lat: 35, lon: 135.8 },
      shape: { type: RevealedShapeType.POINT },
      photo: undefined
    })
  })

  it("is an area on an area round, with its outline once loaded", () => {
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
    const area = { ...reveal, question: makeCountryQuestionView() }
    expect(revealedFromView(area, outline).shape).toEqual({ type: RevealedShapeType.AREA, outline })
    expect(revealedFromView(area, undefined).shape).toEqual({ type: RevealedShapeType.AREA, outline: undefined })
  })
})
