import type { Points } from "@whereabouts/shared/units"
import type { FinalStanding, PlayedRound } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { cx } from "../../../ui/cx"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { RoundWhat } from "../RoundWhat/RoundWhat"
import { roundListTestIds } from "./RoundListTestIds"
import { roundsTestIds } from "../Rounds/RoundsTestIds"
import s from "./RoundList.module.css"

export interface RoundListProps {
  rounds: PlayedRound[]
  standings: FinalStanding[]
  byId: Map<string, PlayingPlayerView>
  you: string
  best: Points[]
}

/** A line per round: what it asked, who won it (and how many tied), and your score. */
export function RoundList({ rounds, standings, byId, you, best }: RoundListProps) {
  const mine = standings.find((s) => s.playerId === you)
  return (
    <ol class={s.list}>
      <li class={s.head} aria-hidden="true">
        <span class={s.text} />
        <span>Best</span>
        {mine && <span class={s.yours}>You</span>}
      </li>
      {rounds.map((round, r) => {
        const winners = standings.filter((s) => s.rounds[r]?.score === best[r]).map((s) => byId.get(s.playerId))
        const first = winners[0]
        const yours = mine?.rounds[r]?.score
        return (
          <li key={r} data-testid={roundsTestIds.playedRound}>
            <RoundWhat number={r + 1} round={round} textClass={s.text} />
            {first && (
              <span
                class={s.winner}
                data-testid={roundListTestIds.roundWinner}
                title={`Won by ${winners.map((p) => p?.name ?? "?").join(", ")}`}
              >
                <Swatch as="i" type={SwatchType.PLAYER} colour={first.colour} />
                <span class={s.winnerName}>{first.name}</span>
                {winners.length > 1 && <span class={s.tied}>+{winners.length - 1}</span>}
                <b>{Math.round(best[r]!)}</b>
              </span>
            )}
            {mine && (
              <span
                class={cx(s.yours, yours !== undefined && yours === best[r] && s.best)}
                title="Your score"
                data-testid={roundListTestIds.roundYours}
              >
                {yours === undefined ? "–" : Math.round(yours)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
