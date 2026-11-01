// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { render, screen } from "@testing-library/preact"
import { playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { makePlayer, makeSpectator } from "../../../test-view"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { PlayerList, initial } from "./PlayerList"
import { HostTag } from "../HostTag/HostTag"
import { playerListTestIds } from "./PlayerListTestIds"
import { rankArrowTestIds } from "../RankArrow/RankArrowTestIds"
import styles from "../Players.module.css"

const player = (over: Partial<PlayingPlayerView>): PlayingPlayerView => makePlayer({ isHost: false, ...over })

describe("PlayerList", () => {
  it("tags host, you and offline players", () => {
    const { container } = render(
      <PlayerList
        players={[
          player({ isHost: true }),
          player({ id: playerId("p2"), name: playerName("Bob"), connected: false, colour: playerColour(1) })
        ]}
        you={playerId("p1")}
        showScores={false}
      />
    )
    const rows = container.querySelectorAll("li")
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("host")
    expect(rows[0]!.textContent).toContain("you")
    expect(rows[1]!.classList.contains(styles.offline)).toBe(true)
    expect(rows[1]!.textContent).toContain("offline")
    // No scores requested.
    expect(screen.queryAllByTestId(playerListTestIds.score)).toHaveLength(0)
  })

  it("shows rank-change arrows only when a rank moved", () => {
    render(
      <PlayerList
        players={[
          player({ id: playerId("p1"), name: playerName("Up"), rank: 1, previousRank: 2, score: 900 }),
          player({ id: playerId("p2"), name: playerName("Same"), rank: 2, previousRank: 2, score: 500 }),
          player({ id: playerId("p3"), name: playerName("Down"), rank: 3, previousRank: 1, score: 100 })
        ]}
        you={playerId("p2")}
        showScores
        arrows
      />
    )
    const arrows = screen.getAllByTestId(rankArrowTestIds.arrow).map((arrow) => arrow.textContent)
    expect(arrows).toEqual(["▲", "", "▼"])
    expect(screen.getAllByTestId(playerListTestIds.score).map((element) => element.textContent)).toEqual([
      "900",
      "500",
      "100"
    ])
  })

  it("puts a rename pencil on your own row only when asked", () => {
    let clicks = 0
    const { container } = render(
      <PlayerList
        players={[player({ id: playerId("p1") }), player({ id: playerId("p2"), name: playerName("Bob") })]}
        you={playerId("p2")}
        showScores={false}
        onRename={() => clicks++}
      />
    )
    const pencils = container.querySelectorAll("button.icon")
    expect(pencils).toHaveLength(1)
    expect(pencils[0]!.closest("li")!.textContent).toContain("Bob")
    ;(pencils[0] as HTMLButtonElement).click()
    expect(clicks).toBe(1)
  })
})

describe("PlayerList status", () => {
  it("shows a done tag for players who have finished guessing, only when asked", () => {
    const players = [
      player({ id: playerId("p1"), locked: true }),
      player({ id: playerId("p2"), name: playerName("Bob"), locked: false })
    ]
    const { container: plain } = render(<PlayerList players={players} you={playerId("p2")} showScores={false} />)
    expect(plain.querySelectorAll(`.${styles.done}`)).toHaveLength(0)
    const { container } = render(<PlayerList players={players} you={playerId("p2")} showScores={false} showLocked />)
    const rows = container.querySelectorAll("li")
    expect(rows[0]!.querySelectorAll(`.${styles.done}`)).not.toHaveLength(0)
    expect(rows[1]!.querySelectorAll(`.${styles.done}`)).toHaveLength(0)
  })
})

describe("HostTag", () => {
  it("shows the crown with the word for screen readers", () => {
    const { container } = render(<HostTag />)
    expect(container.querySelectorAll(`.${styles.host} svg`)).not.toHaveLength(0)
    expect(container.textContent).toBe("host")
  })
})

describe("PlayerList kick", () => {
  it("offers a remove button on other players' rows only when asked", () => {
    const kicked: string[] = []
    const players = [player({ id: playerId("p1") }), player({ id: playerId("p2"), name: playerName("Bob") })]
    const { container: plain } = render(<PlayerList players={players} you={playerId("p1")} showScores={false} />)
    expect(plain.querySelectorAll(`button.${styles.kick}`)).toHaveLength(0)
    const { container } = render(
      <PlayerList
        players={players}
        you={playerId("p1")}
        showScores={false}
        onKick={(player) => kicked.push(player.id)}
      />
    )
    const buttons = container.querySelectorAll<HTMLButtonElement>(`button.${styles.kick}`)
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Remove Bob from the game")
    buttons[0]!.click()
    expect(kicked).toEqual(["p2"])
  })
})

describe("PlayerList make host", () => {
  it("offers the crown only on other players who are online and not already host", () => {
    const picked: string[] = []
    const players = [
      player({ id: playerId("p1"), isHost: true }),
      player({ id: playerId("p2"), name: playerName("Bob") }),
      player({ id: playerId("p3"), name: playerName("Cara"), connected: false })
    ]
    const { container: plain } = render(<PlayerList players={players} you={playerId("p1")} showScores={false} />)
    expect(plain.querySelectorAll(`button.${styles.makeHost}`)).toHaveLength(0)
    const { container } = render(
      <PlayerList
        players={players}
        you={playerId("p1")}
        showScores={false}
        onMakeHost={(player) => picked.push(player.id)}
      />
    )
    const buttons = container.querySelectorAll<HTMLButtonElement>(`button.${styles.makeHost}`)
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Make Bob the host")
    buttons[0]!.click()
    expect(picked).toEqual(["p2"])
  })
})
describe("PlayerList spectators", () => {
  it("shows a spectator without a colour, tagged as watching", () => {
    const { container } = render(<PlayerList players={[makeSpectator()]} you={playerId("p1")} showScores={false} />)
    const row = container.querySelector("li")!
    expect(row.querySelectorAll(`.${styles.watcher}`)).not.toHaveLength(0)
    expect(row.textContent).toContain("watching")
  })
})

describe("initial", () => {
  it("keeps a multi-part emoji whole", () => {
    expect(initial("alice")).toBe("A")
    expect(initial("  🇫🇷 Marie")).toBe("🇫🇷")
    expect(initial("👨‍👩‍👧 family")).toBe("👨‍👩‍👧")
    expect(initial("   ")).toBe("?")
  })
})
