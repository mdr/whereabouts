import { useEffect } from "preact/hooks"
import { MAX_PLAYERS, MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { colourCss } from "@whereabouts/shared/colours"
import { Role, YouRoleType, everyone } from "@whereabouts/shared/roles"
import { useGameService } from "../../../game-service/use-game-service"
import type { GameService } from "../../../game-service/game-service"
import { useGameData } from "../../../data/game-data"
import { mapPrefetched, prefetchMap } from "../../../map/map-prefetch"
import { joinedCode } from "../../../settings/settings"
import { connectionText } from "../../../ui/connection/ConnectionNote/ConnectionNote"
import { hostActions, pickable, takeSeat, vrPicked } from "../../../vr/view/vr-actions"
import { Icon } from "../../../ui/icons"
import { leaveRequest } from "../../../ui/ConfirmDialog/confirm-requests"
import { useConfirm } from "../../../ui/ConfirmDialog/ConfirmDialog"
import { navigate } from "../../../router"
import { Banner } from "../../../ui/Banner/Banner"
import { useVrView } from "../../../ui/VrButton/VrButton"
import { VrViewType, type VrView } from "../../../vr/view/view"
import { DevDrawer } from "../../../ui/dev/DevDrawer/DevDrawer"
import { ExtraPlayersDev } from "../../../ui/dev/ExtraPlayersDev/ExtraPlayersDev"
import { ConnectionDev } from "../../../ui/connection/ConnectionDev"
import { InvitePanel } from "../invite/InvitePanel/InvitePanel"
import { SetupPanel } from "../setup/SetupPanel/SetupPanel"
import { setupLine } from "../setup/setup-line"
import { lobbyTestIds } from "./LobbyTestIds"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import styles from "./Lobby.module.css"

/**
 * Waiting room: invite on the left (code, link, players), the game setup on
 * the right. The host gets the controls; guests see the decided values,
 * which highlight briefly when the host changes one.
 */
export const Lobby = ({ view }: { view: GameView }) => {
  const game = useGameService()
  const { dialog, ask } = useConfirm()
  useEffect(prefetchMap, [])
  useGameData(view.config.mix, mapPrefetched.value)
  const host = view.you.isHost
  const playerCount = view.players.length
  // Home, giving up the seat now; the tab forgets the game so a refresh or
  // Back does not quietly rejoin it. Leaving the screen disconnects.
  const leave = () => {
    game.leave()
    joinedCode.value = ""
    navigate("/")
  }
  const vrView = lobbyVrView(game, view, leave)
  useVrView(vrView)
  return (
    <>
      <div class={kit.page}>
        <div class={cx(kit.pageCard, styles.card)} data-testid={lobbyTestIds.page}>
          {dialog}
          <Banner tall>
            <button
              class={styles.leave}
              data-testid={lobbyTestIds.leaveButton}
              onClick={() =>
                host
                  ? ask(leaveRequest(everyone(view).find((player) => player.id === view.you.nextHost)?.name, leave))
                  : leave()
              }
            >
              <Icon name="back" size={15} /> Leave
            </button>
          </Banner>
          <div class={styles.cols}>
            <InvitePanel view={view} ask={ask} />
            <SetupPanel view={view} vrView={vrView} playerCount={playerCount} />
          </div>
        </div>
      </div>
      <DevDrawer>
        <ExtraPlayersDev code={view.code} phase={view.phase} />
        <ConnectionDev view={view} />
      </DevDrawer>
    </>
  )
}

/** What the lobby shows in the headset: the players, and the host's or guest's actions. */
const lobbyVrView = (game: GameService, view: GameView, leave: () => void): VrView => {
  const host = view.you.isHost
  const { players, spectators } = view
  return {
    type: VrViewType.LOBBY,
    summary: {
      title: `Game ${view.code}`,
      scoreLine: host ? "Start when everyone's in" : "Waiting for the host to start",
      table: {
        title: `Players ${players.length}/${MAX_PLAYERS}`,
        rows: everyone(view).map((player) => ({
          colour: player.type === Role.PLAYER ? colourCss(player.colour) : undefined,
          name: `${player.name}${player.id === view.you.id ? " (you)" : ""}`,
          detail: [player.isHost && "host", player.type === Role.SPECTATOR && "watching", !player.connected && "away"]
            .filter(Boolean)
            .join(", "),
          total: "",
          ...pickable(view, player)
        })),
        hint: host ? "Point at a player to remove them or make them host." : undefined
      },
      note:
        connectionText(game) ??
        `Friends join with the code ${view.code}. ${setupLine(view)}${host ? " Take the headset off to change it." : ""}`,
      actions: host
        ? [{ label: "Start game", press: () => game.start(), enabled: game.online.value && players.length >= 1 }]
        : []
    },
    more: [
      view.you.role.type === YouRoleType.SPECTATOR
        ? takeSeat(game, view, "Play instead")
        : {
            label: "Just watch",
            press: () => game.setRole(Role.SPECTATOR),
            enabled: game.online.value && spectators.length < MAX_SPECTATORS
          },
      ...hostActions(game, view, vrPicked.value),
      { label: "Leave", confirm: host ? "Press again to leave" : undefined, press: leave }
    ]
  }
}
