import type { PaintedCountry } from "@whereabouts/shared/borders"
import { HintAxis } from "@whereabouts/shared/hints"
import { RoundGuessType, type RoundResultView } from "@whereabouts/shared/protocol/views"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import { onActivateKey } from "../../../keyboard/activate-key"
import { cx } from "../../../ui/cx"
import players from "../../../ui/players/Players.module.css"
import { Icon } from "../../../ui/icons"
import { HostTag } from "../../../ui/players/HostTag/HostTag"
import { RankArrow } from "../../../ui/players/RankArrow/RankArrow"
import { rankMove } from "../../../ui/players/rank-move"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { PaintedIn } from "../../../ui/round/flag-reveal/PaintedIn/PaintedIn"
import { roundScoreText } from "../../../round/round-words"
import { revealRowTestIds } from "./RevealRowTestIds"

const HINT_AXIS_NOUN: Record<HintAxis, string> = { [HintAxis.LATITUDE]: "latitude", [HintAxis.LONGITUDE]: "longitude" }
const hintedText = (axis: HintAxis) => `Used a ${HINT_AXIS_NOUN[axis]} hint this round`

export const RevealRow = ({
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
  p: PlayingPlayerView
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
}) => (
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- A list item cannot take a button role, so the row is made focusable and keyed instead.
  <li
    class={cx(selected && players.selected, you && players.you, where && players.withWhere)}
    aria-current={selected}
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- As above.
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={onActivateKey(onSelect)}
    onPointerEnter={(event) => event.pointerType === "mouse" && onHover(true)}
    onPointerLeave={(event) => event.pointerType === "mouse" && onHover(false)}
    data-testid={revealRowTestIds.playerRow}
    data-player={p.name}
  >
    <Swatch type={SwatchType.PLAYER} colour={p.colour} />
    <span class={players.name}>
      <span class={players.nameText} data-testid={revealRowTestIds.playerName}>
        {p.name}
      </span>
      {p.isHost && <HostTag />}
      {r?.guess.type === RoundGuessType.PASSED && (
        <span class={players.tag} title="Made no guess this round" data-testid={revealRowTestIds.passedTag}>
          passed
        </span>
      )}
      {r?.hint && (
        <span class={players.hinted} title={hintedText(r.hint)} data-testid={revealRowTestIds.hintTag}>
          <Icon name="hint" size={11} />
          <span class="sr-only">{hintedText(r.hint)}</span>
        </span>
      )}
      {ready && (
        <span class={cx(players.tag, players.ready)} title="Ready for the next round">
          <span aria-hidden="true">✓</span>
          <span class="sr-only">ready</span>
        </span>
      )}
    </span>
    {onKick && (
      <button
        class={cx("icon", players.kick)}
        title={`Remove ${p.name} from the game`}
        aria-label={`Remove ${p.name} from the game`}
        onClick={(event) => {
          event.stopPropagation()
          onKick()
        }}
      >
        <Icon name="kick" size={13} />
      </button>
    )}
    <span class={players.roundScore} title="This round" data-testid={revealRowTestIds.roundScore}>
      {roundScoreText(r)}
    </span>
    <RankArrow move={rankMove(p)} />
    <span class={players.scoreNum} title="Total so far" data-testid={revealRowTestIds.total}>
      {Math.round(p.score).toLocaleString()}
    </span>
    {where && (
      <span class={players.where}>
        <PaintedIn where={where} answer={answerFlag} whose={you ? "your" : `${p.name}'s`} />
      </span>
    )}
  </li>
)
