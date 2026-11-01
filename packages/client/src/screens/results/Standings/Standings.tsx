import type { PlayerId } from "@whereabouts/shared/ids"
import type { FinalStanding } from "@whereabouts/shared/protocol/views"
import { cx } from "../../../ui/cx"
import { HostTag } from "../../../ui/players/HostTag/HostTag"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { standingsTestIds } from "./StandingsTestIds"
import styles from "./Standings.module.css"

const MEDALS = ["🥇", "🥈", "🥉"]
/** Past this many players the standings tighten up, the podium aside. */
const MANY_PLAYERS = 8

export const Standings = ({
  standings,
  host,
  you
}: {
  standings: FinalStanding[]
  host: PlayerId | undefined
  you: PlayerId
}) => (
  <ol class={cx(styles.standings, standings.length > MANY_PLAYERS && styles.many)} aria-label="Final standings">
    {standings.map((standing, i) => (
      <li
        key={standing.playerId}
        class={cx(styles.row, standing.playerId === you && styles.you, i >= MEDALS.length && styles.minor)}
        data-testid={standingsTestIds.standingsRow}
        data-player={standing.name}
      >
        <span class={styles.place} data-testid={standingsTestIds.place}>
          {MEDALS[i] ?? i + 1}
        </span>
        <span class={styles.dot}>
          <Swatch as="i" type={SwatchType.PLAYER} colour={standing.colour} />
        </span>
        <span class={styles.name}>
          <span class={styles.nameText}>{standing.name}</span>
          {standing.playerId === host && <HostTag />}
        </span>
        <span class={styles.total} title="Total" data-testid={standingsTestIds.total}>
          {Math.round(standing.total).toLocaleString()}
        </span>
      </li>
    ))}
  </ol>
)
