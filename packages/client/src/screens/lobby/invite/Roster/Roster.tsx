import { Fragment } from "preact"
import { MAX_SPECTATORS, type GameView } from "@whereabouts/shared/protocol"
import type { PlayerView } from "@whereabouts/shared/roles"
import type { Connection } from "../../../../net/net"
import { PlayerList } from "../../../../ui/players/PlayerList/PlayerList"
import { kickRequest, makeHostRequest, type ConfirmRequest } from "../../../../ui/ConfirmDialog/ConfirmDialog"
import { rosterTestIds } from "./RosterTestIds"
import s from "./Roster.module.css"

/** Players, then (if any) the watchers under their own heading. */
export function Roster({
  conn,
  view,
  ask,
  onRename
}: {
  conn: Connection
  view: GameView
  ask: (request: ConfirmRequest) => void
  onRename: () => void
}) {
  const host = view.you.isHost
  const { players, spectators: watchers } = view
  const list = (people: PlayerView[]) => (
    <PlayerList
      players={people}
      you={view.you.id}
      showScores={false}
      avatars
      onRename={onRename}
      onKick={host ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
      onMakeHost={host ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
    />
  )
  return (
    <>
      {players.length > 0 && <Fragment key={0}>{list(players)}</Fragment>}
      {watchers.length > 0 && (
        <Fragment key={1}>
          <h3 class={s.watchingHeading} data-testid={rosterTestIds.watchingHeading}>
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
