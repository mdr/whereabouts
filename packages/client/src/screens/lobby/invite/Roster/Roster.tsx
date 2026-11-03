import { Fragment } from "preact"
import { MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import type { PlayerView } from "@whereabouts/shared/roles"
import { useGameService } from "../../../../game-service/use-game-service"
import { PlayerList } from "../../../../ui/players/PlayerList/PlayerList"
import { kickRequest, makeHostRequest, type ConfirmRequest } from "../../../../ui/ConfirmDialog/confirm-requests"
import { rosterTestIds } from "./RosterTestIds"
import styles from "./Roster.module.css"

/** Players, then (if any) the watchers under their own heading. */
export const Roster = ({
  view,
  ask,
  onRename
}: {
  view: GameView
  ask: (request: ConfirmRequest) => void
  onRename: () => void
}) => {
  const game = useGameService()
  const host = view.you.isHost
  const { players, spectators: watchers } = view
  const list = (people: PlayerView[]) => (
    <PlayerList
      players={people}
      you={view.you.id}
      showScores={false}
      avatars
      onRename={onRename}
      onKick={host ? (player) => ask(kickRequest(player.name, () => game.kick(player.id))) : undefined}
      onMakeHost={host ? (player) => ask(makeHostRequest(player.name, () => game.makeHost(player.id))) : undefined}
    />
  )
  return (
    <>
      {players.length > 0 && <Fragment key={0}>{list(players)}</Fragment>}
      {watchers.length > 0 && (
        <Fragment key={1}>
          <h3 class={styles.watchingHeading} data-testid={rosterTestIds.watchingHeading}>
            Watching{" "}
            <span title={`Up to ${MAX_SPECTATORS} people can watch`}>
              {watchers.length}/{MAX_SPECTATORS}
            </span>
          </h3>
          {list(watchers)}
        </Fragment>
      )}
    </>
  )
}
