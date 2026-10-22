// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { playerColour, playerId, playerName, roomCode, type GameView } from "@whereabouts/shared"
import type { Connection } from "../net"
import { Results } from "./Results"

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
    playedRounds: [{ label: "Taj Mahal, Agra", image: "Taj Mahal.jpeg" }, { label: "Perth, Australia" }],
    awards: [{ emoji: "🐔", title: "Chicken", playerIds: [playerId("p2")], line: "{0} passed 2 times. Brave." }]
  }
}

describe("Results", () => {
  it("names the winner, lists the standings by total, and highlights you", () => {
    const conn = { again: vi.fn() } as unknown as Connection
    const { container } = render(<Results conn={conn} view={view(false)} />)
    expect(container.querySelector(".tagline")!.textContent).toContain("Alice")
    expect(container.querySelector(".tagline")!.textContent).toContain("wins")
    const rows = container.querySelectorAll(".standings-row")
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector(".place")!.textContent).toBe("🥇")
    expect(rows[1]!.querySelector(".place")!.textContent).toBe("🥈")
    expect(rows[0]!.querySelector(".total")!.textContent).toBe("1,500")
    expect(rows[1]!.className).toContain("you")
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.textContent).toContain("The host can start another game")
  })

  it("tables each round: what it asked, everyone's score in finishing order, its best picked out", () => {
    const conn = { again: vi.fn() } as unknown as Connection
    const { container } = render(<Results conn={conn} view={view(false)} />)
    const heads = [...container.querySelectorAll(".score-table thead th .player-name")].map((h) => h.textContent)
    expect(heads).toEqual(["Alice", "Bob"])
    const rounds = [...container.querySelectorAll(".score-table tbody tr")]
    expect(rounds.map((r) => r.querySelector(".round-label")!.textContent)).toEqual([
      "Taj Mahal, Agra",
      "Perth, Australia"
    ])
    expect(rounds.map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent))).toEqual([
      ["800", "500"],
      ["700", "750"]
    ])
    // Alice took round 1, Bob round 2.
    expect(rounds.map((r) => r.querySelector("td.best")!.textContent)).toEqual(["800", "750"])
    expect(rounds[0]!.querySelectorAll(".round-photo")).toHaveLength(1)
  })

  it("lists each round's winner and your score where the table won't fit, with the table a click away", () => {
    // A ResizeObserver that reports at once; happy-dom lays nothing out, so the width is 0.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly report: () => void) {}
        observe() {
          this.report()
        }
        disconnect() {}
      }
    )
    try {
      const conn = { again: vi.fn() } as unknown as Connection
      const { container, getByText } = render(<Results conn={conn} view={view(false)} />)
      expect(container.querySelectorAll(".score-table table")).toHaveLength(0)
      const rounds = [...container.querySelectorAll(".round-list li:not(.round-list-head)")]
      expect(rounds.map((r) => r.querySelector(".round-label")!.textContent)).toEqual([
        "Taj Mahal, Agra",
        "Perth, Australia"
      ])
      expect(rounds.map((r) => r.querySelector(".round-winner")!.textContent)).toEqual(["Alice800", "Bob750"])
      // You are Bob: your score, picked out where you won.
      expect(rounds.map((r) => r.querySelector(".round-yours")!.textContent)).toEqual(["500", "750"])
      expect(rounds[1]!.querySelector(".round-yours")!.className).toContain("best")
      fireEvent.click(getByText("Everyone's scores (2)"))
      expect(container.querySelectorAll(".score-table table")).toHaveLength(1)
      fireEvent.click(getByText("Just the winners"))
      expect(container.querySelectorAll(".score-table table")).toHaveLength(0)
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
