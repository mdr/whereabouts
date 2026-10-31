/**
 * Who else is in the game and how they are doing, tucked behind a small pill
 * in the HUD so the map stays clear. Starts collapsed; the choice sticks for
 * the session.
 */
import { signal } from "@preact/signals"
import type { GameView, PlayerView } from "@whereabouts/shared/protocol"
import { PlayerList } from "./PlayerList"
import { Icon } from "./icons"
import { playersPanelTestIds } from "./PlayersPanelTestIds"
import { Card } from "./Card"
import { cx } from "./cx"
import s from "./PlayersPanel.module.css"

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
  const players = view.players.filter((p) => !p.watching)
  const watching = view.players.length - players.length
  const online = players.filter((p) => p.connected).length
  const open = playersPanelOpen.value
  return (
    <div class={cx(s.panel, open && s.open)}>
      <button
        class={s.toggle}
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
        <Card class={s.card} data-testid={playersPanelTestIds.card}>
          <PlayerList
            players={players}
            you={view.you.id}
            showScores
            showLocked={view.phase === "guessing"}
            onKick={onKick}
            onMakeHost={onMakeHost}
          />
        </Card>
      )}
    </div>
  )
}
