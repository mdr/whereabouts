import { colourCss } from "@whereabouts/shared/colours"
import type { PlayerId } from "@whereabouts/shared/ids"
import { Role, type PlayerView, type PlayingPlayerView } from "@whereabouts/shared/roles"
import { Icon } from "../../icons"
import { playerListTestIds } from "./PlayerListTestIds"
import { cx } from "../../cx"
import { HostTag } from "../HostTag/HostTag"
import { RankArrow } from "../RankArrow/RankArrow"
import { Swatch, SwatchType } from "../Swatch"
import styles from "../Players.module.css"

const graphemes = new Intl.Segmenter()

/** A name's first character as a reader sees it, so a flag or family emoji stays whole. */
export const initial = (name: string): string => {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next()
  return first.done ? "?" : first.value.segment.toUpperCase()
}

export const PlayerList = ({
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
}) => {
  return (
    <ul class={styles.list} data-testid={playerListTestIds.list}>
      {players.map((player) => {
        const isYou = player.id === you
        return (
          <li
            key={player.id}
            class={cx(!player.connected && styles.offline)}
            data-testid={playerListTestIds.player}
            data-player={player.name}
          >
            <Mark player={player} avatars={avatars} />
            <span class={styles.name}>
              <span class={styles.nameText} data-testid={playerListTestIds.name}>
                {player.name}
              </span>
              {player.isHost ? <HostTag /> : undefined}
              {isYou ? <span class={styles.tag}>you</span> : undefined}
              {!player.connected ? <span class={styles.tag}>offline</span> : undefined}
              {player.type === Role.SPECTATOR && !avatars ? <span class={styles.tag}>watching</span> : undefined}
              {showLocked && player.type === Role.PLAYER && player.locked ? (
                <span class={cx(styles.tag, styles.done)} title="Finished guessing">
                  <Icon name="check" size={11} /> done
                </span>
              ) : undefined}
            </span>
            {isYou && onRename && (
              <button class="icon" title="Change your name" aria-label="Change your name" onClick={onRename}>
                ✎
              </button>
            )}
            {!isYou && onMakeHost && player.connected && !player.isHost && (
              <button
                class={cx("icon", styles.makeHost)}
                title={`Make ${player.name} the host`}
                aria-label={`Make ${player.name} the host`}
                onClick={(event) => {
                  event.stopPropagation()
                  onMakeHost(player)
                }}
              >
                <Icon name="crown" size={13} />
              </button>
            )}
            {!isYou && onKick && (
              <button
                class={cx("icon", styles.kick)}
                data-testid={playerListTestIds.kickButton}
                title={`Remove ${player.name} from the game`}
                aria-label={`Remove ${player.name} from the game`}
                onClick={(event) => {
                  event.stopPropagation()
                  onKick(player)
                }}
              >
                <Icon name="kick" size={13} />
              </button>
            )}
            {showScores && player.type === Role.PLAYER && <Score player={player} arrows={arrows} />}
          </li>
        )
      })}
    </ul>
  )
}

/** A spectator's eye, or a player's colour as an avatar or a dot. */
const Mark = ({ player, avatars }: { player: PlayerView; avatars: boolean | undefined }) => {
  if (player.type === Role.SPECTATOR) {
    return (
      <span class={cx(avatars ? styles.avatar : styles.swatch, styles.watcher)} title="Watching" aria-hidden="true">
        {avatars && <Icon name="eye" size={14} />}
      </span>
    )
  }
  if (!avatars) return <Swatch type={SwatchType.PLAYER} colour={player.colour} />
  return (
    <span class={styles.avatar} style={{ background: colourCss(player.colour) }} aria-hidden="true">
      {initial(player.name)}
    </span>
  )
}

const Score = ({ player, arrows }: { player: PlayingPlayerView; arrows: boolean | undefined }) => {
  const delta = arrows && player.previousRank !== undefined ? player.previousRank - player.rank : 0
  return (
    <>
      {arrows && <RankArrow delta={delta} />}
      <span class={styles.scoreNum} data-testid={playerListTestIds.score}>
        {Math.round(player.score).toLocaleString()}
      </span>
    </>
  )
}
