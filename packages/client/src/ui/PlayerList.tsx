import { colourCss, type PlayerColour } from "@whereabouts/shared/colours"
import type { PlayerId } from "@whereabouts/shared/ids"
import type { PlayerView } from "@whereabouts/shared/protocol"
import { Icon } from "./icons"
import { playerListTestIds } from "./PlayerListTestIds"
import { cx } from "./cx"
import s from "./Players.module.css"

/** A player's colour dot; or `everyone`'s, all their colours. */
export function Swatch({
  colour,
  css,
  everyone,
  as: Tag = "span",
  class: cls
}: {
  colour?: PlayerColour
  /** A colour that is no player's. */
  css?: string
  everyone?: boolean
  as?: "span" | "i"
  class?: string
}) {
  const style = everyone ? undefined : { background: css ?? colourCss(colour) }
  return <Tag class={cx(s.swatch, everyone && s.everyone, cls)} style={style} />
}

/** ▲ or ▼ as a player's rank moved. */
export function RankArrow({ delta }: { delta: number }) {
  return (
    <span class={cx(s.arrow, delta > 0 && s.up, delta < 0 && s.down)} data-testid={playerListTestIds.arrow}>
      {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
    </span>
  )
}

const graphemes = new Intl.Segmenter()

/** A name's first character as a reader sees it, so a flag or family emoji stays whole. */
export function initial(name: string): string {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next()
  return first.done ? "?" : first.value.segment.toUpperCase()
}

/** Crown tag marking the host in a player row; the word stays for screen readers. */
export function HostTag() {
  return (
    <span class={s.host} title="Host" data-testid={playerListTestIds.hostTag}>
      <Icon name="crown" size={12} />
      <span class="sr-only">host</span>
    </span>
  )
}

/** "the host" in running text, with the crown. */
export function HostWord({ capital }: { capital?: boolean }) {
  return (
    <span class={s.hostWord}>
      <Icon name="crown" size={12} />
      {capital ? "The host" : "the host"}
    </span>
  )
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
  /** Undefined in a view of no player. */
  you: PlayerId | undefined
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
        const delta = arrows && p.previousRank !== undefined ? p.previousRank - p.rank : 0
        const isYou = p.id === you
        return (
          <li
            key={p.id}
            class={cx(!p.connected && s.offline)}
            data-testid={playerListTestIds.player}
            data-player={p.name}
          >
            {p.watching ? (
              <span class={cx(avatars ? s.avatar : s.swatch, s.watcher)} title="Watching" aria-hidden="true">
                {avatars && <Icon name="eye" size={14} />}
              </span>
            ) : avatars ? (
              <span class={s.avatar} style={{ background: colourCss(p.colour) }} aria-hidden="true">
                {initial(p.name)}
              </span>
            ) : (
              <Swatch colour={p.colour} />
            )}
            <span class={s.name}>
              <span class={s.nameText} data-testid={playerListTestIds.name}>
                {p.name}
              </span>
              {p.isHost ? <HostTag /> : undefined}
              {isYou ? <span class={s.tag}>you</span> : undefined}
              {!p.connected ? <span class={s.tag}>offline</span> : undefined}
              {p.watching && !avatars ? <span class={s.tag}>watching</span> : undefined}
              {showLocked && p.locked ? (
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
            {showScores && (
              <>
                {arrows && <RankArrow delta={delta} />}
                <span class={s.scoreNum} data-testid={playerListTestIds.score}>
                  {Math.round(p.score).toLocaleString()}
                </span>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
