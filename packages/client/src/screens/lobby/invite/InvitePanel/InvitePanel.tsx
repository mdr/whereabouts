import { useState } from "preact/hooks"
import { MAX_PLAYERS, type GameView } from "@whereabouts/shared/protocol"
import { YouRoleType } from "@whereabouts/shared/roles"
import type { Connection } from "../../../../net/net"
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
import s from "./InvitePanel.module.css"

/** The left panel: the code and link to share, who is here, and the player/watcher choice. */
export function InvitePanel({
  conn,
  view,
  online,
  ask
}: {
  conn: Connection
  view: GameView
  online: boolean
  ask: (request: ConfirmRequest) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const current = view.you.name
  const { players } = view
  const seatsFull = players.length >= MAX_PLAYERS
  return (
    <LobbyPanel>
      <h2>Invite</h2>
      <p class={kit.tagline}>Share this code with your friends</p>
      <div class={s.code} data-testid={invitePanelTestIds.code}>
        {view.code}
      </div>
      <InviteButtons code={view.code} />
      <ConnectionNote conn={conn} />
      <h2>
        Players{" "}
        <span class={s.count} title={`Up to ${MAX_PLAYERS} players`}>
          {players.length}/{MAX_PLAYERS}
        </span>
      </h2>
      <Roster conn={conn} view={view} ask={ask} onRename={() => setRenaming(true)} />
      {players.length + view.spectators.length === 1 && (
        <p class={cx(kit.hint, s.waiting)}>Waiting for friends to join…</p>
      )}
      {view.you.role.type === YouRoleType.SPECTATOR && !askedToWatch.value && seatsFull && (
        <p class={kit.hint}>
          All {MAX_PLAYERS} player seats are taken, so you're watching. You can join if one frees up.
        </p>
      )}
      <RoleSwitch conn={conn} view={view} online={online} />
      {renaming && (
        <RenameForm
          current={current}
          online={online}
          onDone={(name) => {
            if (name && name !== current) {
              conn.rename(name)
              savedName.value = name
            }
            setRenaming(false)
          }}
        />
      )}
    </LobbyPanel>
  )
}
