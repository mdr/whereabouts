import { Fragment } from "preact"
import { useState } from "preact/hooks"
import { MAX_PLAYERS, MAX_SPECTATORS, type GameView, type PlayerView } from "@whereabouts/shared/protocol"
import type { PlayerName } from "@whereabouts/shared/ids"
import type { Connection } from "../../net/net"
import { askedToWatch, nameToJoin, savedName } from "../../settings/settings"
import { PlayerList } from "../../ui/players/PlayerList"
import { ConnectionNote } from "../../ui/connection/ConnectionNote"
import { Icon } from "../../ui/icons"
import { kickRequest, makeHostRequest, type ConfirmRequest } from "../../ui/ConfirmDialog"
import { lobbyTestIds } from "./LobbyTestIds"
import { cx } from "../../ui/cx"
import kit from "../../ui/kit.module.css"
import s from "./Lobby.module.css"

interface InviteProps {
  conn: Connection
  view: GameView
  online: boolean
  ask: (request: ConfirmRequest) => void
}

/** The left panel: the code and link to share, who is here, and the player/watcher choice. */
export function InvitePanel({ conn, view, online, ask }: InviteProps) {
  const [renaming, setRenaming] = useState(false)
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? ""
  const players = view.players.filter((p) => !p.watching)
  const seatsFull = players.length >= MAX_PLAYERS
  return (
    <section class={s.panel}>
      <h2>Invite</h2>
      <p class={kit.tagline}>Share this code with your friends</p>
      <div class={s.code} data-testid={lobbyTestIds.code}>
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
      {view.players.length === 1 && <p class={cx(kit.hint, s.waiting)}>Waiting for friends to join…</p>}
      {view.you.watching && !askedToWatch.value && seatsFull && (
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
    </section>
  )
}

function InviteButtons({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${location.pathname}#/game/${code}`
  const canShare = typeof navigator.share === "function"
  return (
    <div class={s.invite}>
      <button
        onClick={() => {
          // Missing outside a secure context (a LAN address over http), whatever the DOM types say.
          // oxlint-disable-next-line typescript/no-unnecessary-condition
          void navigator.clipboard?.writeText(url).then(() => setCopied(true))
        }}
      >
        <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy link"}
      </button>
      {canShare && (
        <button
          onClick={() => {
            void navigator.share({ title: "Whereabouts", text: `Join my game: ${code}`, url }).catch(() => {
              // Closing the share sheet rejects too; there is nothing to report.
            })
          }}
        >
          <Icon name="share" /> Share
        </button>
      )}
    </div>
  )
}

/** Players, then (if any) the watchers under their own heading. */
function Roster({ conn, view, ask, onRename }: Pick<InviteProps, "conn" | "view" | "ask"> & { onRename: () => void }) {
  const host = view.you.isHost
  const players = view.players.filter((p) => !p.watching)
  const watchers = view.players.filter((p) => p.watching)
  const list = (people: PlayerView[]) => (
    <PlayerList
      players={people}
      you={view.you.id}
      showScores={false}
      avatars
      onRename={onRename}
      onKick={host ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
      onMakeHost={host ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
    />
  )
  return (
    <>
      {players.length > 0 && <Fragment key={0}>{list(players)}</Fragment>}
      {watchers.length > 0 && (
        <Fragment key={1}>
          <h3 class={s.watchingHeading} data-testid={lobbyTestIds.watchingHeading}>
            Watching{" "}
            <span class={s.count} title={`Up to ${MAX_SPECTATORS} people can watch`}>
              {watchers.length}/{MAX_SPECTATORS}
            </span>
          </h3>
          {list(watchers)}
        </Fragment>
      )}
    </>
  )
}

function RoleSwitch({ conn, view, online }: Pick<InviteProps, "conn" | "view" | "online">) {
  const seatsFull = view.players.filter((p) => !p.watching).length >= MAX_PLAYERS
  const watchersFull = view.players.filter((p) => p.watching).length >= MAX_SPECTATORS
  return (
    <div class={s.roleSwitch} data-testid={lobbyTestIds.roleSwitch}>
      {view.you.watching ? (
        <button
          onClick={() => conn.setRole(false)}
          disabled={seatsFull || !online}
          title={seatsFull ? `All ${MAX_PLAYERS} seats are taken` : undefined}
        >
          <Icon name="play" /> Play instead
        </button>
      ) : (
        <button
          onClick={() => conn.setRole(true)}
          disabled={watchersFull || !online}
          title="See every round without playing"
        >
          <Icon name="eye" /> Just watch
        </button>
      )}
    </div>
  )
}

function RenameForm({
  current,
  online,
  onDone
}: {
  current: string
  online: boolean
  onDone: (name: PlayerName | undefined) => void
}) {
  const [name, setName] = useState(current)
  return (
    <form
      class={kit.join}
      onSubmit={(e) => {
        e.preventDefault()
        onDone(nameToJoin(name))
      }}
    >
      <input
        class={cx(kit.codeInput, kit.nameInput)}
        type="text"
        maxLength={20}
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(undefined)
        }}
        autoFocus
      />
      <button type="submit" disabled={nameToJoin(name) === undefined || !online}>
        Save
      </button>
    </form>
  )
}
