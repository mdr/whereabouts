import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { HintAxis } from "@whereabouts/shared/hints"
import { RoundGuessType, type PlayerView, type RoundResultView } from "@whereabouts/shared/protocol"
import { cx } from "../../ui/cx"
import pl from "../../ui/players/Players.module.css"
import { Icon } from "../../ui/icons"
import { HostTag } from "../../ui/players/HostTag"
import { RankArrow } from "../../ui/players/RankArrow"
import { Swatch, SwatchType } from "../../ui/players/Swatch"
import { PaintedIn } from "../../ui/round/FlagReveal"
import { roundScoreText } from "../../round/round-words"
import { revealRowTestIds } from "./RevealRowTestIds"

const hintedText = (axis: HintAxis) => `Used a ${axis.toLowerCase()} hint this round`

export function RevealRow({
  p,
  r,
  you,
  ready,
  selected,
  where,
  answerFlag,
  onSelect,
  onHover,
  onKick
}: {
  p: PlayerView
  r?: RoundResultView
  you: boolean
  ready: boolean
  selected: boolean
  /** A flag round: the country most of their paint was in. */
  where: PaintedCountry | undefined
  answerFlag?: string
  onSelect: () => void
  /** The mouse coming onto the row or leaving it. Not a touch, which would leave it on. */
  onHover: (on: boolean) => void
  /** Host only: remove this player. */
  onKick?: () => void
}) {
  const delta = p.previousRank !== undefined ? p.previousRank - p.rank : 0
  return (
    <li
      class={cx(selected && pl.selected, you && pl.you, where && pl.withWhere)}
      onClick={onSelect}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(false)}
      data-testid={revealRowTestIds.playerRow}
      data-player={p.name}
    >
      <Swatch type={SwatchType.PLAYER} colour={p.colour} />
      <span class={pl.name}>
        <span class={pl.nameText} data-testid={revealRowTestIds.playerName}>
          {p.name}
        </span>
        {p.isHost && <HostTag />}
        {r?.guess.type === RoundGuessType.PASSED && (
          <span class={pl.tag} title="Made no guess this round" data-testid={revealRowTestIds.passedTag}>
            passed
          </span>
        )}
        {r?.hint && (
          <span class={pl.hinted} title={hintedText(r.hint)} data-testid={revealRowTestIds.hintTag}>
            <Icon name="hint" size={11} />
            <span class="sr-only">{hintedText(r.hint)}</span>
          </span>
        )}
        {ready && (
          <span class={cx(pl.tag, pl.ready)} title="Ready for the next round">
            <span aria-hidden="true">✓</span>
            <span class="sr-only">ready</span>
          </span>
        )}
      </span>
      {onKick && (
        <button
          class={cx("icon", pl.kick)}
          title={`Remove ${p.name} from the game`}
          aria-label={`Remove ${p.name} from the game`}
          onClick={(e) => {
            e.stopPropagation()
            onKick()
          }}
        >
          <Icon name="kick" size={13} />
        </button>
      )}
      <span class={pl.roundScore} title="This round" data-testid={revealRowTestIds.roundScore}>
        {roundScoreText(r)}
      </span>
      <RankArrow delta={delta} />
      <span class={pl.scoreNum} title="Total so far">
        {Math.round(p.score).toLocaleString()}
      </span>
      {where && (
        <span class={pl.where}>
          <PaintedIn where={where} answer={answerFlag} whose={you ? "your" : `${p.name}'s`} />
        </span>
      )}
    </li>
  )
}
