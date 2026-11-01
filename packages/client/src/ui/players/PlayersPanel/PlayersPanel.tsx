/**
 * Who else is in the game and how they are doing, tucked behind a small pill
 * in the HUD so the map stays clear. Starts collapsed; the choice sticks for
 * the session.
 */
import { signal } from "@preact/signals"
import type { GameView } from "@whereabouts/shared/protocol/views"
import type { PlayerView } from "@whereabouts/shared/roles"
import { PlayerList } from "../PlayerList/PlayerList"
import { Icon } from "../../icons"
import { playersPanelTestIds } from "./PlayersPanelTestIds"
import { Card } from "../../Card/Card"
import { cx } from "../../cx"
import styles from "./PlayersPanel.module.css"
import { Phase } from "@whereabouts/shared/protocol/views"

/** Open, it may take more of a phone's screen (HudRight's `roomy`). */
export const playersPanelOpen = signal(false)

export function PlayersPanel({
  view,
  onKick,
  onMakeHost
}: {
  view: GameView
  onKick?: (player: PlayerView) => void
  onMakeHost?: (player: PlayerView) => void
}) {
  const { players } = view
  const watching = view.spectators.length
  const online = players.filter((player) => player.connected).length
  const open = playersPanelOpen.value
  return (
    <div class={cx(styles.panel, open && styles.open)}>
      <button
        class={styles.toggle}
        data-testid={playersPanelTestIds.toggle}
        onClick={() => (playersPanelOpen.value = !open)}
        aria-expanded={open}
        title={open ? "Hide players" : "Show players"}
      >
        <Icon name="users" />
        <span>
          {players.length} {players.length === 1 ? "player" : "players"}
          {online < players.length ? ` · ${online} online` : ""}
          {watching > 0 ? ` · ${watching} watching` : ""}
        </span>
        <Icon name={open ? "collapse" : "expand"} size={14} />
      </button>
      {open && (
        <Card class={styles.card} data-testid={playersPanelTestIds.card}>
          <PlayerList
            players={players}
            you={view.you.id}
            showScores
            showLocked={view.phase === Phase.GUESSING}
            onKick={onKick}
            onMakeHost={onMakeHost}
          />
        </Card>
      )}
    </div>
  )
}
