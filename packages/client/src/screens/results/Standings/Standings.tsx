import type { PlayerId } from "@whereabouts/shared/ids"
import type { FinalStanding } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { cx } from "../../../ui/cx"
import { HostTag } from "../../../ui/players/HostTag/HostTag"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { standingsTestIds } from "./StandingsTestIds"
import styles from "./Standings.module.css"

const MEDALS = ["🥇", "🥈", "🥉"]
/** Past this many players the standings tighten up, the podium aside. */
const MANY_PLAYERS = 8

export function Standings({
  standings,
  byId,
  you
}: {
  standings: FinalStanding[]
  byId: ReadonlyMap<PlayerId, PlayingPlayerView>
  you: string
}) {
  return (
    <ol class={cx(styles.standings, standings.length > MANY_PLAYERS && styles.many)} aria-label="Final standings">
      {standings.map((st, i) => {
        const p = byId.get(st.playerId)
        return (
          <li
            key={st.playerId}
            class={cx(styles.row, st.playerId === you && styles.you, i >= MEDALS.length && styles.minor)}
            data-testid={standingsTestIds.standingsRow}
            data-player={p?.name}
          >
            <span class={styles.place} data-testid={standingsTestIds.place}>
              {MEDALS[i] ?? i + 1}
            </span>
            <span class={styles.dot}>{p && <Swatch as="i" type={SwatchType.PLAYER} colour={p.colour} />}</span>
            <span class={styles.name}>
              <span class={styles.nameText}>{p?.name ?? "?"}</span>
              {p?.isHost && <HostTag />}
            </span>
            <span class={styles.total} title="Total" data-testid={standingsTestIds.total}>
              {Math.round(st.total).toLocaleString()}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
