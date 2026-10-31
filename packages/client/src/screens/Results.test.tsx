// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { flagCode, playerId, playerName, regionId, roomCode } from "@whereabouts/shared/ids"
import { playerColour } from "@whereabouts/shared/colours"
import type { GameView } from "@whereabouts/shared/protocol"
import type { Connection } from "../net"
import { Results } from "./Results"
import { resultsTestIds as ids } from "./ResultsTestIds"
import s from "./Results.module.css"
import pictures from "../ui/Pictures.module.css"

const tid = (id: string) => `[data-testid="${id}"]`

// The outlines are a download; these tests only need where a shape goes.
vi.mock("../regions", async (original) => ({ ...(await original<object>()), useRegion: () => undefined }))

const MIX = { landmarks: 1, places: 1, countries: 0, flags: 0, features: 0, states: 0 }

function view(isHost: boolean): GameView {
  return {
    code: roomCode("AB12"),
    phase: "results",
    config: {
      rounds: 2,
      roundMs: 60000,
      mix: MIX,
      mapDetail: "minimal",
      kernelId: "multi-equal",
      hints: 1
    },
    serverTime: 0,
    you: {
      id: playerId("p2"),
      isHost,
      spectating: false,
      watching: false,
      locked: false,
      paint: undefined,
      hintsLeft: 1
    },
    players: [
      {
        id: playerId("p1"),
        name: playerName("Alice"),
        colour: playerColour(0),
        watching: false,
        connected: true,
        isHost: true,
        locked: false,
        score: 1500,
        rank: 1,
        previousRank: 1
      },
      {
        id: playerId("p2"),
        name: playerName("Bob"),
        colour: playerColour(1),
        watching: false,
        connected: true,
        isHost: false,
        locked: false,
        score: 900,
        rank: 2,
        previousRank: 2
      }
    ],
    round: undefined,
    reveal: undefined,
    results: [
      { playerId: playerId("p1"), total: 1500, rounds: [{ score: 800 }, { score: 700 }] },
      { playerId: playerId("p2"), total: 1250, rounds: [{ score: 500 }, { score: 750 }] }
    ],
    playedRounds: [
      { label: "Taj Mahal, Agra", type: "landmarks", image: "Taj Mahal.jpeg" },
      { label: "Perth, Australia", type: "places" }
    ],
    awards: [{ emoji: "🐔", title: "Chicken", playerIds: [playerId("p2")], line: "{0} passed 2 times. Brave." }]
  }
}

describe("Results", () => {
  it("names the winner, lists the standings by total, and highlights you", () => {
    const conn = { again: vi.fn() } as unknown as Connection
    const { container } = render(<Results conn={conn} view={view(false)} />)
    expect(container.querySelector(tid(ids.winner))!.textContent).toContain("Alice")
    expect(container.querySelector(tid(ids.winner))!.textContent).toContain("wins")
    const rows = container.querySelectorAll(tid(ids.standingsRow))
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector(tid(ids.place))!.textContent).toBe("🥇")
    expect(rows[1]!.querySelector(tid(ids.place))!.textContent).toBe("🥈")
    expect(rows[0]!.querySelector(tid(ids.total))!.textContent).toBe("1,500")
    expect(rows[1]!.classList.contains(s.you!)).toBe(true)
    expect(container.querySelectorAll(`button:not(.${pictures.smallPicture!})`)).toHaveLength(0)
    expect(container.textContent).toContain("The host can start another game")
  })

  it("tables each round: what it asked, everyone's score in finishing order, its best picked out", () => {
    const conn = { again: vi.fn() } as unknown as Connection
    const { container } = render(<Results conn={conn} view={view(false)} />)
    const heads = [...container.querySelectorAll(tid(ids.playerName))].map((h) => h.textContent)
    expect(heads).toEqual(["Alice", "Bob"])
    const rounds = [...container.querySelectorAll(tid(ids.playedRound))]
    expect(rounds.map((r) => r.querySelector(tid(ids.roundLabel))!.textContent)).toEqual([
      "Taj Mahal, Agra",
      "Perth, Australia"
    ])
    expect(rounds.map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent))).toEqual([
      ["800", "500"],
      ["700", "750"]
    ])
    // Alice took round 1, Bob round 2.
    expect(rounds.map((r) => r.querySelector(`td.${s.best!}`)!.textContent)).toEqual(["800", "750"])
    expect(rounds[0]!.querySelectorAll(`.${pictures.smallPicture!} img`)).toHaveLength(1)
    expect(rounds.map((r) => r.querySelector(tid(ids.roundType))!.textContent)).toEqual(["Landmark", "Place name"])
  })

  it("tells a flag round from a country round: the flag, or the shape with the flag by its name", () => {
    const conn = { again: vi.fn() } as unknown as Connection
    const v = view(false)
    v.playedRounds = [
      { label: "Turkey", type: "flags", flag: flagCode("tr") },
      { label: "Bangladesh", type: "countries", regionId: regionId("bangladesh-region"), flag: flagCode("bd") },
      { label: "Black Sea", type: "features", topic: "sea", regionId: regionId("sea-black-sea") }
    ]
    const { container } = render(<Results conn={conn} view={v} />)
    const rounds = [...container.querySelectorAll(tid(ids.playedRound))]
    expect(rounds.map((r) => r.querySelector(tid(ids.roundType))!.textContent)).toEqual([
      "Flag",
      "Whole country",
      "Sea"
    ])
    expect(rounds.map((r) => r.querySelectorAll(`.${s.shape!}`).length)).toEqual([0, 1, 1])
    expect(rounds.map((r) => r.querySelectorAll(`.${s.labelFlag!}`).length)).toEqual([0, 1, 0])
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
      const conn = { again: vi.fn() } as unknown as Connection
      const { container, getByText } = render(<Results conn={conn} view={view(false)} />)
      expect(container.querySelectorAll(tid(ids.table))).toHaveLength(0)
      const rounds = [...container.querySelectorAll(tid(ids.playedRound))]
      expect(rounds.map((r) => r.querySelector(tid(ids.roundLabel))!.textContent)).toEqual([
        "Taj Mahal, Agra",
        "Perth, Australia"
      ])
      expect(rounds.map((r) => r.querySelector(tid(ids.roundWinner))!.textContent)).toEqual(["Alice800", "Bob750"])
      // You are Bob: your score, picked out where you won.
      expect(rounds.map((r) => r.querySelector(tid(ids.roundYours))!.textContent)).toEqual(["500", "750"])
      expect(rounds[1]!.querySelector(tid(ids.roundYours))!.classList.contains(s.best!)).toBe(true)
      fireEvent.click(getByText("Everyone's scores (2)"))
      expect(container.querySelectorAll(tid(ids.table))).toHaveLength(1)
      fireEvent.click(getByText("Just the winners"))
      expect(container.querySelectorAll(tid(ids.table))).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lets the host play again", () => {
    const again = vi.fn()
    const conn = { again } as unknown as Connection
    const { getByText } = render(<Results conn={conn} view={view(true)} />)
    fireEvent.click(getByText("Play again"))
    expect(again).toHaveBeenCalledTimes(1)
  })
})
