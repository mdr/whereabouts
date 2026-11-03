import { useState } from "preact/hooks"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { YouRoleType } from "@whereabouts/shared/roles"
import { useGameService } from "../../../../game-service/use-game-service"
import { askedToWatch, savedName } from "../../../../settings/settings"
import { ConnectionNote } from "../../../../ui/connection/ConnectionNote/ConnectionNote"
import type { ConfirmRequest } from "../../../../ui/ConfirmDialog/ConfirmDialog"
import { cx } from "../../../../ui/cx"
import kit from "../../../../ui/kit.module.css"
import { LobbyPanel } from "../../LobbyPanel/LobbyPanel"
import { InviteButtons } from "../InviteButtons/InviteButtons"
import { invitePanelTestIds } from "./InvitePanelTestIds"
import { RenameForm } from "../RenameForm"
import { RoleSwitch } from "../RoleSwitch/RoleSwitch"
import { Roster } from "../Roster/Roster"
import styles from "./InvitePanel.module.css"

/** The left panel: the code and link to share, who is here, and the player/watcher choice. */
export const InvitePanel = ({ view, ask }: { view: GameView; ask: (request: ConfirmRequest) => void }) => {
  const game = useGameService()
  const [renaming, setRenaming] = useState(false)
  const current = view.you.name
  const { players } = view
  const seatsFull = players.length >= MAX_PLAYERS
  return (
    <LobbyPanel>
      <h2>Invite</h2>
      <p class={kit.tagline}>Share this code with your friends</p>
      <div class={styles.code} data-testid={invitePanelTestIds.code}>
        {view.code}
      </div>
      <InviteButtons code={view.code} />
      <ConnectionNote />
      <h2>
        Players{" "}
        <span class={styles.count} title={`Up to ${MAX_PLAYERS} players`}>
          {players.length}/{MAX_PLAYERS}
        </span>
      </h2>
      <Roster view={view} ask={ask} onRename={() => setRenaming(true)} />
      {players.length + view.spectators.length === 1 && (
        <p class={cx(kit.hint, styles.waiting)}>Waiting for friends to join…</p>
      )}
      {view.you.role.type === YouRoleType.SPECTATOR && !askedToWatch.value && seatsFull && (
        <p class={kit.hint}>
          All {MAX_PLAYERS} player seats are taken, so you're watching. You can join if one frees up.
        </p>
      )}
      <RoleSwitch view={view} />
      {renaming && (
        <RenameForm
          current={current}
          onDone={(name) => {
            if (name && name !== current) {
              game.rename(name)
              savedName.value = name
            }
            setRenaming(false)
          }}
        />
      )}
    </LobbyPanel>
  )
}
