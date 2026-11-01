// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render, screen, within } from "@testing-library/preact"
import { signal } from "@preact/signals"
import { playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName, roomCode } from "@whereabouts/shared/ids"
import { mixOf, type GameView, MapDetail } from "@whereabouts/shared/protocol"
import { QuestionType } from "@whereabouts/shared/questions"
import { Role } from "@whereabouts/shared/roles"
import { type Connection, type ConnectionState, ConnectionStatus } from "../../../net/net"
import { hostSetup, joinedCode, startOnPan } from "../../../settings/settings"
import { route, RouteType } from "../../../router"
import { Lobby } from "./Lobby"
import { lobbyTestIds } from "./LobbyTestIds"
import { rosterTestIds } from "../invite/Roster/RosterTestIds"
import { roleSwitchTestIds } from "../invite/RoleSwitch/RoleSwitchTestIds"
import { deviceSwitchesTestIds } from "../setup/DeviceSwitches/DeviceSwitchesTestIds"
import { setupSummaryTestIds } from "../setup/SetupSummary/SetupSummaryTestIds"
import { confirmDialogTestIds } from "../../../ui/ConfirmDialog/ConfirmDialogTestIds"
import { pillsTestIds } from "../../../ui/setup/Pills/PillsTestIds"
import { stepperTestIds } from "../../../ui/setup/Stepper/StepperTestIds"
import { mapDetailPickerTestIds } from "../../../ui/setup/MapDetailPicker/MapDetailPickerTestIds"
import { roundStripTestIds } from "../../../ui/setup/RoundStrip/RoundStripTestIds"
import { playerListTestIds } from "../../../ui/players/PlayerList/PlayerListTestIds"
import setupSummary from "../setup/SetupSummary/SetupSummary.module.css"
import players from "../../../ui/players/Players.module.css"
import { SPECTATING, makePlayer, makeSpectator, makeLobbyView } from "../../../test-view"

vi.mock("../../../map/map-prefetch", () => ({ prefetchMap: () => undefined, mapPrefetched: { value: false } }))

/** Queries within a render's container. */
const inside = (element: Element) => within(element as HTMLElement)

const MIX = mixOf({ [QuestionType.LANDMARK]: 3, [QuestionType.PLACE]: 2 })

function view(isHost: boolean): GameView {
  const base = makeLobbyView()
  return makeLobbyView({
    config: { ...base.config, mix: MIX, hints: 1 },
    you: { isHost },
    players: [makePlayer()]
  })
}

const guest = (id: string, name: string, colour = 1) =>
  makePlayer({ id: playerId(id), name: playerName(name), colour: playerColour(colour), isHost: false })

const watcher = (id: string, name: string) => makeSpectator({ id: playerId(id), name: playerName(name) })

const configure = vi.fn()
const leave = vi.fn()
const setRole = vi.fn()
const conn = {
  status: signal<ConnectionState>({ type: ConnectionStatus.CONNECTED }),
  online: signal(true),
  lastError: signal(undefined),
  configure,
  start: vi.fn(),
  leave,
  setRole
} as unknown as Connection

beforeEach(() => {
  vi.clearAllMocks()
  hostSetup.value = {}
})

describe("Lobby", () => {
  afterEach(() => {
    startOnPan.value = false
  })

  it("offers a per-device choice to start rounds on the Pan tool, to hosts and guests alike", () => {
    for (const isHost of [true, false]) {
      const { container, unmount } = render(<Lobby conn={conn} view={view(isHost)} />)
      const box = inside(container).getByTestId<HTMLInputElement>(deviceSwitchesTestIds.startOnPanSwitch)
      expect(box.checked).toBe(false)
      fireEvent.click(box)
      expect(startOnPan.value).toBe(true)
      unmount()
      startOnPan.value = false
    }
  })

  it("shows the saved choice", () => {
    startOnPan.value = true
    const { container } = render(<Lobby conn={conn} view={view(false)} />)
    expect(inside(container).getByTestId<HTMLInputElement>(deviceSwitchesTestIds.startOnPanSwitch).checked).toBe(true)
  })
})

describe("Lobby setup", () => {
  it("gives the host the controls", () => {
    const { container } = render(<Lobby conn={conn} view={view(true)} />)
    fireEvent.click(container.querySelector('[aria-label="More flags"]')!)
    expect(configure).toHaveBeenCalledWith({ mix: { ...MIX, [QuestionType.FLAG]: 1 } })
    fireEvent.click(container.querySelector('[aria-label="Fewer landmarks"]')!)
    expect(configure).toHaveBeenCalledWith({ mix: { ...MIX, [QuestionType.LANDMARK]: 2 } })
    expect(inside(container).getAllByTestId(roundStripTestIds.cell)).toHaveLength(5)
    const picker = inside(container).getByTestId(mapDetailPickerTestIds.picker)
    const minimal = picker.querySelector('[aria-checked="true"]')!
    expect(minimal.textContent).toBe("Minimal")
    fireEvent.click([...picker.querySelectorAll("button")].find((button) => button.textContent === "Water")!)
    expect(configure).toHaveBeenCalledWith({ mapDetail: MapDetail.WATER })
    expect(inside(container).queryAllByTestId(setupSummaryTestIds.summary)).toHaveLength(0)
    // Remembered for the next game this browser hosts.
    expect(hostSetup.value).toEqual({ mix: { ...MIX, [QuestionType.LANDMARK]: 2 }, mapDetail: MapDetail.WATER })
  })

  it("shows guests the decided values, not controls", () => {
    const { container } = render(<Lobby conn={conn} view={view(false)} />)
    for (const id of [pillsTestIds.option, stepperTestIds.value, mapDetailPickerTestIds.picker])
      expect(inside(container).queryAllByTestId(id)).toHaveLength(0)
    const summary = inside(container).getByTestId(setupSummaryTestIds.summary)
    expect(inside(summary).getAllByTestId(roundStripTestIds.cell)).toHaveLength(5)
    const tiles = [...summary.children].map((tile) => tile.textContent)
    expect(tiles).toEqual([
      "5rounds",
      "60 sper round",
      "1hint each",
      "3 landmarks · 2 place names",
      "Minimalmap · coastlines only"
    ])
    // Nothing is highlighted on first load.
    expect(container.querySelectorAll(`.${setupSummary.changed}`)).toHaveLength(0)
  })

  it("highlights only the value the host just changed", () => {
    const { container, rerender } = render(<Lobby conn={conn} view={view(false)} />)
    const next = view(false)
    next.config = { ...next.config, roundLength: 30_000 }
    rerender(<Lobby conn={conn} view={next} />)
    expect([...container.querySelectorAll(`.${setupSummary.changed}`)].map((tile) => tile.textContent)).toEqual([
      "30 sper round"
    ])
  })
})

describe("Lobby leave", () => {
  it("takes a guest straight home, giving up the seat and forgetting the game", () => {
    joinedCode.value = roomCode("AB12")
    const { container } = render(<Lobby conn={conn} view={view(false)} />)
    fireEvent.click(inside(container).getByTestId(lobbyTestIds.leaveButton))
    expect(leave).toHaveBeenCalledTimes(1)
    expect(joinedCode.value).toBe("")
    expect(route.value).toEqual({ type: RouteType.HOME })
  })

  it("asks the host first, naming who takes over", () => {
    const gameView = view(true)
    const bob = guest("p2", "Bob")
    gameView.players = [...gameView.players, bob]
    gameView.you.nextHost = bob.id
    const { container } = render(<Lobby conn={conn} view={gameView} />)
    fireEvent.click(inside(container).getByTestId(lobbyTestIds.leaveButton))
    expect(leave).not.toHaveBeenCalled()
    const modal = screen.getByTestId(confirmDialogTestIds.dialog)
    expect(modal.textContent).toContain("Bob becomes the host.")
    fireEvent.click([...modal.querySelectorAll("button")].find((button) => button.textContent === "Leave")!)
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it("warns a host on their own that the game closes", () => {
    const { container } = render(<Lobby conn={conn} view={view(true)} />)
    fireEvent.click(inside(container).getByTestId(lobbyTestIds.leaveButton))
    expect(screen.getByTestId(confirmDialogTestIds.dialog).textContent).toContain(
      "It closes, since no one else is here."
    )
  })
})

describe("Lobby spectators", () => {
  it("lists spectators apart from the players, with their own count", () => {
    const gameView = view(true)
    gameView.players = [...gameView.players, guest("p2", "Bob")]
    gameView.spectators = [watcher("p3", "Sam")]
    const { container } = render(<Lobby conn={conn} view={gameView} />)
    const lists = inside(container).getAllByTestId(playerListTestIds.list)
    expect(lists).toHaveLength(2)
    expect(lists[0]!.textContent).toContain("Bob")
    expect(lists[1]!.textContent).toContain("Sam")
    expect(lists[1]!.querySelectorAll(`.${players.watcher}`)).not.toHaveLength(0)
    expect(inside(container).getByTestId(rosterTestIds.watchingHeading).textContent).toContain("1/8")
  })

  it("lets a player step back to watch, and a spectator take a seat", () => {
    const { container, unmount } = render(<Lobby conn={conn} view={view(false)} />)
    fireEvent.click(inside(container).getByTestId(roleSwitchTestIds.roleSwitch).querySelector("button")!)
    expect(setRole).toHaveBeenLastCalledWith(Role.SPECTATOR)
    unmount()
    const gameView = view(false)
    gameView.you.role = SPECTATING
    gameView.players = []
    gameView.spectators = [watcher("p1", "Alice")]
    const { container: c2 } = render(<Lobby conn={conn} view={gameView} />)
    const play = inside(c2).getByTestId(roleSwitchTestIds.roleSwitch).querySelector("button")!
    expect(play.textContent).toContain("Play instead")
    fireEvent.click(play)
    expect(setRole).toHaveBeenLastCalledWith(Role.PLAYER)
  })

  it("keeps the seat button off when all sixteen seats are taken", () => {
    const gameView = view(false)
    gameView.you.role = SPECTATING
    gameView.players = Array.from({ length: 16 }, (_, i) => guest(`p${i + 10}`, `P${i}`, i))
    gameView.spectators = [watcher("p1", "Alice")]
    const { container } = render(<Lobby conn={conn} view={gameView} />)
    expect(inside(container).getByTestId(roleSwitchTestIds.roleSwitch).querySelector("button")!.disabled).toBe(true)
    expect(container.textContent).toContain("All 16 player seats are taken")
  })
})
