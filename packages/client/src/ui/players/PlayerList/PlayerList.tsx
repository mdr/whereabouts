import { colourCss } from "@whereabouts/shared/colours"
import type { PlayerId } from "@whereabouts/shared/ids"
import { Role, type PlayerView, type PlayingPlayerView } from "@whereabouts/shared/roles"
import { Icon } from "../../icons"
import { playerListTestIds } from "./PlayerListTestIds"
import { cx } from "../../cx"
import { HostTag } from "../HostTag/HostTag"
import { RankArrow } from "../RankArrow/RankArrow"
import { Swatch, SwatchType } from "../Swatch"
import s from "../Players.module.css"

const graphemes = new Intl.Segmenter()

/** A name's first character as a reader sees it, so a flag or family emoji stays whole. */
export function initial(name: string): string {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next()
  return first.done ? "?" : first.value.segment.toUpperCase()
}

export function PlayerList({
  players,
  you,
  showScores,
  arrows,
  showLocked,
  avatars,
  onRename,
  onKick,
  onMakeHost
}: {
  players: PlayerView[]
  you: PlayerId
  showScores: boolean
  arrows?: boolean
  /** Mark players who have finished guessing this round. */
  showLocked?: boolean
  /** A coloured circle with the initial instead of the small dot (the lobby). */
  avatars?: boolean
  /** When given, your own row gets a pencil that calls this. */
  onRename?: () => void
  /** Host only: when given, every other row gets a remove button that calls this. */
  onKick?: (player: PlayerView) => void
  /** Host only: when given, other connected players' rows get a crown button that calls this. */
  onMakeHost?: (player: PlayerView) => void
}) {
  return (
    <ul class={s.list} data-testid={playerListTestIds.list}>
      {players.map((p) => {
        const isYou = p.id === you
        return (
          <li
            key={p.id}
            class={cx(!p.connected && s.offline)}
            data-testid={playerListTestIds.player}
            data-player={p.name}
          >
            <Mark p={p} avatars={avatars} />
            <span class={s.name}>
              <span class={s.nameText} data-testid={playerListTestIds.name}>
                {p.name}
              </span>
              {p.isHost ? <HostTag /> : undefined}
              {isYou ? <span class={s.tag}>you</span> : undefined}
              {!p.connected ? <span class={s.tag}>offline</span> : undefined}
              {p.type === Role.SPECTATOR && !avatars ? <span class={s.tag}>watching</span> : undefined}
              {showLocked && p.type === Role.PLAYER && p.locked ? (
                <span class={cx(s.tag, s.done)} title="Finished guessing">
                  <Icon name="check" size={11} /> done
                </span>
              ) : undefined}
            </span>
            {isYou && onRename && (
              <button class="icon" title="Change your name" aria-label="Change your name" onClick={onRename}>
                ✎
              </button>
            )}
            {!isYou && onMakeHost && p.connected && !p.isHost && (
              <button
                class={cx("icon", s.makeHost)}
                title={`Make ${p.name} the host`}
                aria-label={`Make ${p.name} the host`}
                onClick={(e) => {
                  e.stopPropagation()
                  onMakeHost(p)
                }}
              >
                <Icon name="crown" size={13} />
              </button>
            )}
            {!isYou && onKick && (
              <button
                class={cx("icon", s.kick)}
                data-testid={playerListTestIds.kickButton}
                title={`Remove ${p.name} from the game`}
                aria-label={`Remove ${p.name} from the game`}
                onClick={(e) => {
                  e.stopPropagation()
                  onKick(p)
                }}
              >
                <Icon name="kick" size={13} />
              </button>
            )}
            {showScores && p.type === Role.PLAYER && <Score p={p} arrows={arrows} />}
          </li>
        )
      })}
    </ul>
  )
}

/** A spectator's eye, or a player's colour as an avatar or a dot. */
function Mark({ p, avatars }: { p: PlayerView; avatars: boolean | undefined }) {
  if (p.type === Role.SPECTATOR) {
    return (
      <span class={cx(avatars ? s.avatar : s.swatch, s.watcher)} title="Watching" aria-hidden="true">
        {avatars && <Icon name="eye" size={14} />}
      </span>
    )
  }
  if (!avatars) return <Swatch type={SwatchType.PLAYER} colour={p.colour} />
  return (
    <span class={s.avatar} style={{ background: colourCss(p.colour) }} aria-hidden="true">
      {initial(p.name)}
    </span>
  )
}

function Score({ p, arrows }: { p: PlayingPlayerView; arrows: boolean | undefined }) {
  const delta = arrows && p.previousRank !== undefined ? p.previousRank - p.rank : 0
  return (
    <>
      {arrows && <RankArrow delta={delta} />}
      <span class={s.scoreNum} data-testid={playerListTestIds.score}>
        {Math.round(p.score).toLocaleString()}
      </span>
    </>
  )
}
