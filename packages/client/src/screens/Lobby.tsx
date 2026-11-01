import { useEffect } from "preact/hooks"
import { MAX_PLAYERS, MAX_SPECTATORS, type GameView } from "@whereabouts/shared/protocol"
import { colourCss } from "@whereabouts/shared/colours"
import type { Connection } from "../net/net"
import { useGameData } from "../data/game-data"
import { mapPrefetched, prefetchMap } from "../map/map-prefetch"
import { joinedCode } from "../settings/settings"
import { connectionText } from "../ui/connection/ConnectionNote"
import { hostActions, pickable, takeSeat, vrPicked } from "../vr/view/vr-actions"
import { Icon } from "../ui/icons"
import { leaveRequest, useConfirm } from "../ui/ConfirmDialog"
import { navigate } from "../router"
import { Banner } from "../ui/Banner"
import { useVrView } from "../ui/VrButton"
import { VrViewType, type VrView } from "../vr/view/view"
import { InvitePanel } from "./LobbyInvite"
import { SetupPanel, setupLine } from "./LobbySetup"
import { lobbyTestIds } from "./LobbyTestIds"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import s from "./Lobby.module.css"

/**
 * Waiting room: invite on the left (code, link, players), the game setup on
 * the right. The host gets the controls; guests see the decided values,
 * which highlight briefly when the host changes one.
 */
export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const online = conn.online.value
  const { dialog, ask } = useConfirm(online)
  useEffect(prefetchMap, [])
  useGameData(view.config.mix, mapPrefetched.value)
  const host = view.you.isHost
  const playerCount = view.players.filter((p) => !p.watching).length
  // Home, giving up the seat now; the tab forgets the game so a refresh or
  // Back does not quietly rejoin it. Leaving the screen disconnects.
  const leave = () => {
    conn.leave()
    joinedCode.value = ""
    navigate("/")
  }
  const vrView = lobbyVrView(conn, view, online, leave)
  useVrView(vrView)
  return (
    <div class={kit.page}>
      <div class={cx(kit.pageCard, s.card)} data-testid={lobbyTestIds.page}>
        {dialog}
        <Banner tall>
          <button
            class={s.leave}
            data-testid={lobbyTestIds.leaveButton}
            onClick={() =>
              host ? ask(leaveRequest(view.players.find((p) => p.id === view.you.nextHost)?.name, leave)) : leave()
            }
          >
            <Icon name="back" size={15} /> Leave
          </button>
        </Banner>
        <div class={s.cols}>
          <InvitePanel conn={conn} view={view} online={online} ask={ask} />
          <SetupPanel conn={conn} view={view} online={online} vrView={vrView} playerCount={playerCount} />
        </div>
      </div>
    </div>
  )
}

/** What the lobby shows in the headset: the players, and the host's or guest's actions. */
function lobbyVrView(conn: Connection, view: GameView, online: boolean, leave: () => void): VrView {
  const host = view.you.isHost
  const players = view.players.filter((p) => !p.watching)
  const watchers = view.players.filter((p) => p.watching)
  return {
    type: VrViewType.LOBBY,
    summary: {
      title: `Game ${view.code}`,
      scoreLine: host ? "Start when everyone's in" : "Waiting for the host to start",
      table: {
        title: `Players ${players.length}/${MAX_PLAYERS}`,
        rows: view.players.map((p) => ({
          colour: colourCss(p.colour),
          name: `${p.name}${p.id === view.you.id ? " (you)" : ""}`,
          detail: [p.isHost && "host", p.watching && "watching", !p.connected && "away"].filter(Boolean).join(", "),
          total: "",
          ...pickable(view, p)
        })),
        hint: host ? "Point at a player to remove them or make them host." : undefined
      },
      note:
        connectionText(conn) ??
        `Friends join with the code ${view.code}. ${setupLine(view)}${host ? " Take the headset off to change it." : ""}`,
      actions: host ? [{ label: "Start game", press: () => conn.start(), enabled: online && players.length >= 1 }] : []
    },
    more: [
      view.you.watching
        ? takeSeat(conn, view, "Play instead")
        : { label: "Just watch", press: () => conn.setRole(true), enabled: watchers.length < MAX_SPECTATORS },
      ...hostActions(conn, view, vrPicked.value),
      { label: "Leave", confirm: host ? "Press again to leave" : undefined, press: leave }
    ]
  }
}
