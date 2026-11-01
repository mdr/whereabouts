import type { FinalStanding, PlayerView } from "@whereabouts/shared/protocol"
import { cx } from "../../ui/cx"
import { HostTag } from "../../ui/players/HostTag"
import { Swatch, SwatchType } from "../../ui/players/Swatch"
import { standingsTestIds } from "./StandingsTestIds"
import s from "./Standings.module.css"

const MEDALS = ["🥇", "🥈", "🥉"]
/** Past this many players the standings tighten up, the podium aside. */
const MANY_PLAYERS = 8

export function Standings({
  standings,
  byId,
  you
}: {
  standings: FinalStanding[]
  byId: Map<string, PlayerView>
  you: string | undefined
}) {
  return (
    <ol class={cx(s.standings, standings.length > MANY_PLAYERS && s.many)} aria-label="Final standings">
      {standings.map((st, i) => {
        const p = byId.get(st.playerId)
        return (
          <li
            key={st.playerId}
            class={cx(s.row, st.playerId === you && s.you, i >= MEDALS.length && s.minor)}
            data-testid={standingsTestIds.standingsRow}
            data-player={p?.name}
          >
            <span class={s.place} data-testid={standingsTestIds.place}>
              {MEDALS[i] ?? i + 1}
            </span>
            <span class={s.dot}>
              <Swatch as="i" type={SwatchType.PLAYER} colour={p?.colour} />
            </span>
            <span class={s.name}>
              <span class={s.nameText}>{p?.name ?? "?"}</span>
              {p?.isHost && <HostTag />}
            </span>
            <span class={s.total} title="Total" data-testid={standingsTestIds.total}>
              {Math.round(st.total).toLocaleString()}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
