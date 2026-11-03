import { colourCss } from "@whereabouts/shared/colours"
import type { PlayerId } from "@whereabouts/shared/ids"
import { Role, type PlayerView } from "@whereabouts/shared/roles"
import { Icon } from "../../icons"
import { playerListTestIds } from "./PlayerListTestIds"
import { cx } from "../../cx"
import { canMakeHost } from "../can-make-host"
import { HostTag } from "../HostTag/HostTag"
import { initial } from "../initial"
import { PLAYER_TAG_TEXT, PlayerTag, playerTags } from "../player-tags"
import { Swatch, SwatchType } from "../Swatch"
import styles from "../Players.module.css"

export const PlayerList = ({
  players,
  you,
  showScores,
  showLocked,
  avatars,
  onRename,
  onKick,
  onMakeHost
}: {
  players: PlayerView[]
  you: PlayerId
  showScores: boolean
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
}) => (
  <ul class={styles.list} data-testid={playerListTestIds.list}>
    {players.map((player) => {
      const isYou = player.id === you
      const tags = playerTags(player, { isYou, markWatchers: !avatars, showLocked: showLocked === true })
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
            {tags.map((tag) => (
              <Tag key={tag} tag={tag} />
            ))}
          </span>
          {isYou && onRename && (
            <button
              class="icon"
              title="Change your name"
              aria-label="Change your name"
              data-testid={playerListTestIds.renameButton}
              onClick={onRename}
            >
              ✎
            </button>
          )}
          {onMakeHost && canMakeHost(you, player) && (
            <button
              class={cx("icon", styles.makeHost)}
              data-testid={playerListTestIds.makeHostButton}
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
          {showScores && player.type === Role.PLAYER && (
            <span class={styles.scoreNum} data-testid={playerListTestIds.score}>
              {Math.round(player.score).toLocaleString()}
            </span>
          )}
        </li>
      )
    })}
  </ul>
)

const Tag = ({ tag }: { tag: PlayerTag }) => {
  if (tag === PlayerTag.HOST) return <HostTag />
  const text = PLAYER_TAG_TEXT[tag]
  return tag === PlayerTag.DONE ? (
    <span
      class={cx(styles.tag, styles.done)}
      title="Finished guessing"
      data-testid={playerListTestIds.tag}
      data-tag={tag}
    >
      <Icon name="check" size={11} /> {text}
    </span>
  ) : (
    <span class={styles.tag} data-testid={playerListTestIds.tag} data-tag={tag}>
      {text}
    </span>
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
