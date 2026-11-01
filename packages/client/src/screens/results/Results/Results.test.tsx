// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { commonsFile, flagCode, outlineId, playerId, playerName } from "@whereabouts/shared/ids"
import { playerColour } from "@whereabouts/shared/colours"
import { type ResultsGameView } from "@whereabouts/shared/protocol"
import { FeatureType, QuestionType } from "@whereabouts/shared/questions"
import { signal } from "@preact/signals"
import { type Connection, type ConnectionState, type PlainState, ConnectionStatus } from "../../../net/net"
import { Results } from "./Results"
import { resultsTestIds } from "./ResultsTestIds"
import { standingsTestIds } from "../Standings/StandingsTestIds"
import { roundsTestIds } from "../Rounds/RoundsTestIds"
import { roundListTestIds } from "../RoundList/RoundListTestIds"
import { scoreTableTestIds } from "../ScoreTable/ScoreTableTestIds"
import { roundWhatTestIds } from "../RoundWhat/RoundWhatTestIds"
import standings from "../Standings/Standings.module.css"
import scoreTable from "../ScoreTable/ScoreTable.module.css"
import roundList from "../RoundList/RoundList.module.css"
import roundWhat from "../RoundWhat/RoundWhat.module.css"
import roundPicture from "../RoundPicture/RoundPicture.module.css"
import pictures from "../../../ui/pictures/SmallPicture.module.css"
import { makePlayer, makeResultsView } from "../../../test-view"

const tid = (id: string) => `[data-testid="${id}"]`

const makeConn = (status: PlainState["type"] = ConnectionStatus.CONNECTED, again = vi.fn()) =>
  ({
    again,
    status: signal<ConnectionState>({ type: status }),
    online: signal(status === ConnectionStatus.CONNECTED),
    lastError: signal(undefined)
  }) as unknown as Connection

// The outlines are a download; these tests only need where a shape goes.
vi.mock("../../../data/outlines", async (original) => ({ ...(await original<object>()), useOutline: () => undefined }))

function view(isHost: boolean): ResultsGameView {
  return makeResultsView({
    you: { id: playerId("p2"), isHost },
    players: [
      makePlayer({ score: 1500 }),
      makePlayer({
        id: playerId("p2"),
        name: playerName("Bob"),
        colour: playerColour(1),
        isHost: false,
        score: 900,
        rank: 2
      })
    ],
    results: [
      { playerId: playerId("p1"), total: 1500, rounds: [{ score: 800 }, { score: 700 }] },
      { playerId: playerId("p2"), total: 1250, rounds: [{ score: 500 }, { score: 750 }] }
    ],
    playedRounds: [
      { label: "Taj Mahal, Agra", type: QuestionType.LANDMARK, image: commonsFile("Taj Mahal.jpeg") },
      { label: "Perth, Australia", type: QuestionType.PLACE }
    ],
    awards: [{ emoji: "🐔", title: "Chicken", playerIds: [playerId("p2")], line: "{0} passed 2 times. Brave." }]
  })
}

describe("Results", () => {
  it("names the winner, lists the standings by total, and highlights you", () => {
    const conn = makeConn()
    const { container } = render(<Results conn={conn} view={view(false)} />)
    expect(container.querySelector(tid(resultsTestIds.winner))!.textContent).toContain("Alice")
    expect(container.querySelector(tid(resultsTestIds.winner))!.textContent).toContain("wins")
    const rows = container.querySelectorAll(tid(standingsTestIds.standingsRow))
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector(tid(standingsTestIds.place))!.textContent).toBe("🥇")
    expect(rows[1]!.querySelector(tid(standingsTestIds.place))!.textContent).toBe("🥈")
    expect(rows[0]!.querySelector(tid(standingsTestIds.total))!.textContent).toBe("1,500")
    expect(rows[1]!.classList.contains(standings.you)).toBe(true)
    expect(container.querySelectorAll(`button:not(.${pictures.smallPicture})`)).toHaveLength(0)
    expect(container.textContent).toContain("The host can start another game")
  })

  it("tables each round: what it asked, everyone's score in finishing order, its best picked out", () => {
    const conn = makeConn()
    const { container } = render(<Results conn={conn} view={view(false)} />)
    const heads = [...container.querySelectorAll(tid(scoreTableTestIds.playerName))].map(
      (heading) => heading.textContent
    )
    expect(heads).toEqual(["Alice", "Bob"])
    const rounds = [...container.querySelectorAll(tid(roundsTestIds.playedRound))]
    expect(rounds.map((round) => round.querySelector(tid(roundWhatTestIds.roundLabel))!.textContent)).toEqual([
      "Taj Mahal, Agra",
      "Perth, Australia"
    ])
    expect(rounds.map((round) => [...round.querySelectorAll("td")].map((cell) => cell.textContent))).toEqual([
      ["800", "500"],
      ["700", "750"]
    ])
    // Alice took round 1, Bob round 2.
    expect(rounds.map((round) => round.querySelector(`td.${scoreTable.best}`)!.textContent)).toEqual(["800", "750"])
    expect(rounds[0]!.querySelectorAll(`.${pictures.smallPicture} img`)).toHaveLength(1)
    expect(rounds.map((round) => round.querySelector(tid(roundWhatTestIds.roundType))!.textContent)).toEqual([
      "Landmark",
      "Place name"
    ])
  })

  it("tells a flag round from a country round: the flag, or the shape with the flag by its name", () => {
    const conn = makeConn()
    const gameView = view(false)
    gameView.playedRounds = [
      { label: "Turkey", type: QuestionType.FLAG, flag: flagCode("tr") },
      {
        label: "Bangladesh",
        type: QuestionType.COUNTRY,
        area: { outline: outlineId("bangladesh-region"), centre: { lat: 23.8, lon: 90.3 } },
        flag: flagCode("bd")
      },
      {
        label: "Black Sea",
        type: QuestionType.FEATURE,
        feature: FeatureType.SEA,
        area: { outline: outlineId("sea-black-sea"), centre: { lat: 43.4, lon: 34.3 } }
      }
    ]
    const { container } = render(<Results conn={conn} view={gameView} />)
    const rounds = [...container.querySelectorAll(tid(roundsTestIds.playedRound))]
    expect(rounds.map((round) => round.querySelector(tid(roundWhatTestIds.roundType))!.textContent)).toEqual([
      "Flag",
      "Whole country",
      "Sea"
    ])
    expect(rounds.map((round) => round.querySelectorAll(`.${roundPicture.shape}`).length)).toEqual([0, 1, 1])
    expect(rounds.map((round) => round.querySelectorAll(`.${roundWhat.labelFlag}`).length)).toEqual([0, 1, 0])
  })

  it("lists each round's winner and your score where the table won't fit, with the table a click away", () => {
    // A ResizeObserver that reports at once; happy-dom lays nothing out, so the width is 0.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly report: () => void
        constructor(report: () => void) {
          this.report = report
        }
        observe() {
          this.report()
        }
        disconnect() {}
      }
    )
    try {
      const conn = makeConn()
      const { container, getByText } = render(<Results conn={conn} view={view(false)} />)
      expect(container.querySelectorAll(tid(scoreTableTestIds.table))).toHaveLength(0)
      const rounds = [...container.querySelectorAll(tid(roundsTestIds.playedRound))]
      expect(rounds.map((round) => round.querySelector(tid(roundWhatTestIds.roundLabel))!.textContent)).toEqual([
        "Taj Mahal, Agra",
        "Perth, Australia"
      ])
      expect(rounds.map((round) => round.querySelector(tid(roundListTestIds.roundWinner))!.textContent)).toEqual([
        "Alice800",
        "Bob750"
      ])
      // You are Bob: your score, picked out where you won.
      expect(rounds.map((round) => round.querySelector(tid(roundListTestIds.roundYours))!.textContent)).toEqual([
        "500",
        "750"
      ])
      expect(rounds[1]!.querySelector(tid(roundListTestIds.roundYours))!.classList.contains(roundList.best)).toBe(true)
      fireEvent.click(getByText("Everyone's scores (2)"))
      expect(container.querySelectorAll(tid(scoreTableTestIds.table))).toHaveLength(1)
      fireEvent.click(getByText("Just the winners"))
      expect(container.querySelectorAll(tid(scoreTableTestIds.table))).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lets the host play again", () => {
    const again = vi.fn()
    const { getByText } = render(<Results conn={makeConn(ConnectionStatus.CONNECTED, again)} view={view(true)} />)
    fireEvent.click(getByText("Play again"))
    expect(again).toHaveBeenCalledTimes(1)
  })

  it("holds Play again while reconnecting, and says so", () => {
    const { container, getByText } = render(
      <Results conn={makeConn(ConnectionStatus.DISCONNECTED)} view={view(true)} />
    )
    expect(container.querySelector<HTMLButtonElement>(tid(resultsTestIds.playAgainButton))!.disabled).toBe(true)
    getByText("Reconnecting…")
  })
})
