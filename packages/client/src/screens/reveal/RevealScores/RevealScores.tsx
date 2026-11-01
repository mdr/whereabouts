import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { PlayerId } from "@whereabouts/shared/ids"
import { RoundGuessType } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import type { RevealShown } from "../../../round/reveal"
import { Card } from "../../../ui/Card/Card"
import { cx } from "../../../ui/cx"
import { Icon } from "../../../ui/icons"
import kit from "../../../ui/kit.module.css"
import players from "../../../ui/players/Players.module.css"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { ShownRowType, type RevealModel } from "../../../round/round-model"
import { RevealRow } from "../RevealRow/RevealRow"
import { revealScoresTestIds } from "./RevealScoresTestIds"

/** Everyone's score, each row picking whose paint the map shows. */
export function RevealScores({
  model,
  where,
  answerFlag,
  onSelect,
  onHover,
  onKick
}: {
  model: RevealModel
  where: ReadonlyMap<PlayerId, PaintedCountry | undefined>
  answerFlag: string | undefined
  onSelect: (pick: RevealShown) => void
  /** A row under the mouse, or undefined when it moves off. */
  onHover: (playerId: PlayerId | undefined) => void
  /** Host only: remove this player. */
  onKick: ((player: PlayingPlayerView) => void) | undefined
}) {
  return (
    <Card title="Scores">
      <ul class={cx(players.list, players.pick)} data-testid={revealScoresTestIds.scoresList}>
        {model.rows.map((row) =>
          row.type === ShownRowType.EVERYONE ? (
            <li
              key="everyone"
              class={cx(players.everyone, row.selected && players.selected)}
              onClick={() => onSelect(row.pick)}
              data-testid={revealScoresTestIds.everyoneRow}
            >
              <Swatch type={SwatchType.EVERYONE} />
              <span class={players.name}>Everyone</span>
            </li>
          ) : row.type === ShownRowType.HIDE_PAINT ? (
            <li
              key="hide"
              class={cx(players.hidePaint, row.selected && players.selected)}
              onClick={() => onSelect(row.pick)}
              data-testid={revealScoresTestIds.hidePaintRow}
              title="Show the map and the answer without anyone's paint"
            >
              <span class={players.swatchIcon}>
                <Icon name="eyeOff" size={13} />
              </span>
              <span class={players.name}>Hide paint</span>
            </li>
          ) : (
            <RevealRow
              key={row.player.id}
              p={row.player}
              r={row.result}
              you={row.you}
              ready={row.ready}
              selected={row.selected}
              where={where.get(row.player.id)}
              answerFlag={answerFlag}
              onSelect={() => onSelect(row.pick)}
              onHover={(on) =>
                onHover(on && row.result?.guess.type === RoundGuessType.PAINTED ? row.player.id : undefined)
              }
              onKick={onKick && !row.you ? () => onKick(row.player) : undefined}
            />
          )
        )}
      </ul>
      <p class={kit.hint}>Pick a player to see just their guess.</p>
    </Card>
  )
}
