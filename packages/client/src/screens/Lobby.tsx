import { Fragment } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import {
  MAX_PLAYERS,
  MAX_SPECTATORS,
  QUESTION_TYPES,
  ROUND_LENGTHS_MS,
  MAP_DETAILS,
  type GameView
} from "@whereabouts/shared/protocol"
import { MAX_HINTS } from "@whereabouts/shared/hints"
import { colourCss } from "@whereabouts/shared/colours"
import { nextHostAfter } from "@whereabouts/shared/game"
import type { PlayerName } from "@whereabouts/shared/ids"
import type { Connection } from "../net"
import { configureAsHost } from "../host-setup"
import { askedToWatch, globeView, joinedCode, nameToJoin, savedName, soundOn, startOnPan } from "../settings"
import { HostWord, PlayerList } from "../ui/PlayerList"
import { ConnectionNote, connectionText } from "../ui/ConnectionNote"
import { hostActions, pickable, takeSeat, vrPicked } from "../vr-actions"
import { Icon } from "../ui/icons"
import { Pills } from "../ui/Controls"
import { MixEditor, RoundStrip, describeMix } from "../ui/MixEditor"
import { kickRequest, leaveRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog"
import { navigate } from "../router"
import { Banner } from "../ui/Banner"
import { MapDetailPicker, MapDetailSummary } from "../ui/MapDetailPicker"
import { VrButton, useVrView } from "../ui/VrButton"
import type { VrView } from "../vr/view"
import { lobbyTestIds, setupSummaryTestIds } from "./LobbyTestIds"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import s from "./Lobby.module.css"

const SECONDS = ROUND_LENGTHS_MS.map((ms) => ({ value: ms, label: String(ms / 1000) }))
const HINTS = Array.from({ length: MAX_HINTS + 1 }, (_, n) => ({ value: n, label: String(n) }))

/**
 * Waiting room: invite on the left (code, link, players), the game setup on
 * the right. The host gets the controls; guests see the decided values,
 * which highlight briefly when the host changes one.
 */
export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const { dialog, ask } = useConfirm()
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? ""
  const host = view.you.isHost
  const canShare = typeof navigator.share === "function"
  const players = view.players.filter((p) => !p.watching)
  const watchers = view.players.filter((p) => p.watching)
  const seatsFull = players.length >= MAX_PLAYERS
  const vrView: VrView = {
    kind: "lobby",
    summary: {
      title: `Game ${view.code}`,
      scoreLine: host ? "Start when everyone's in" : "Waiting for the host to start",
      table: {
        title: `Players ${players.length}/${MAX_PLAYERS}`,
        rows: view.players.map((p) => ({
          colour: colourCss(p.colour),
          name: `${p.name}${p.id === view.you.id ? " (you)" : ""}`,
          detail: [p.isHost && "host", p.watching && "watching", !p.connected && "away"].filter(Boolean).join(", "),
          total: "",
          ...pickable(view, p)
        })),
        hint: host ? "Point at a player to remove them or make them host." : undefined
      },
      note:
        connectionText(conn) ??
        `Friends join with the code ${view.code}. ${setupLine(view)}${host ? " Take the headset off to change it." : ""}`,
      actions: host ? [{ label: "Start game", press: () => conn.start(), enabled: players.length >= 1 }] : []
    },
    more: [
      view.you.watching
        ? takeSeat(conn, view, "Play instead")
        : { label: "Just watch", press: () => conn.setRole(true), enabled: watchers.length < MAX_SPECTATORS },
      ...hostActions(conn, view, vrPicked.value),
      { label: "Leave", confirm: host ? "Press again to leave" : undefined, press: () => leave() }
    ]
  }
  useVrView(vrView, "lobby")
  // Home, giving up the seat now; the tab forgets the game so a refresh or
  // Back does not quietly rejoin it. Leaving the screen disconnects.
  const leave = () => {
    conn.leave()
    joinedCode.value = ""
    navigate("/")
  }
  return (
    <div class={kit.page}>
      <div class={cx(kit.pageCard, s.card)} data-testid={lobbyTestIds.page}>
        {dialog}
        <Banner tall>
          <button
            class={s.leave}
            data-testid={lobbyTestIds.leaveButton}
            onClick={() => (host ? ask(leaveRequest(nextHostAfter(view.players, view.you.id)?.name, leave)) : leave())}
          >
            <Icon name="back" size={15} /> Leave
          </button>
        </Banner>
        <div class={s.cols}>
          <section class={s.panel}>
            <h2>Invite</h2>
            <p class={kit.tagline}>Share this code with your friends</p>
            <div class={s.code} data-testid={lobbyTestIds.code}>
              {view.code}
            </div>
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
                    void navigator
                      .share({ title: "Whereabouts", text: `Join my game: ${view.code}`, url })
                      .catch(() => {
                        // Closing the share sheet rejects too; there is nothing to report.
                      })
                  }}
                >
                  <Icon name="share" /> Share
                </button>
              )}
            </div>
            <ConnectionNote conn={conn} />
            <h2>
              Players{" "}
              <span class={s.count} title={`Up to ${MAX_PLAYERS} players`}>
                {players.length}/{MAX_PLAYERS}
              </span>
            </h2>
            {[players, watchers].map((list, i) =>
              list.length === 0 ? undefined : (
                <Fragment key={i}>
                  {i === 1 && (
                    <h3 class={s.watchingHeading} data-testid={lobbyTestIds.watchingHeading}>
                      Watching{" "}
                      <span class={s.count} title={`Up to ${MAX_SPECTATORS} people can watch`}>
                        {watchers.length}/{MAX_SPECTATORS}
                      </span>
                    </h3>
                  )}
                  <PlayerList
                    players={list}
                    you={view.you.id}
                    showScores={false}
                    avatars
                    onRename={() => setRenaming(true)}
                    onKick={host ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
                    onMakeHost={host ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
                  />
                </Fragment>
              )
            )}
            {view.players.length === 1 && <p class={cx(kit.hint, s.waiting)}>Waiting for friends to join…</p>}
            {view.you.watching && !askedToWatch.value && seatsFull && (
              <p class={kit.hint}>
                All {MAX_PLAYERS} player seats are taken, so you're watching. You can join if one frees up.
              </p>
            )}
            <div class={s.roleSwitch} data-testid={lobbyTestIds.roleSwitch}>
              {view.you.watching ? (
                <button
                  onClick={() => conn.setRole(false)}
                  disabled={seatsFull}
                  title={seatsFull ? `All ${MAX_PLAYERS} seats are taken` : undefined}
                >
                  <Icon name="play" /> Play instead
                </button>
              ) : (
                <button
                  onClick={() => conn.setRole(true)}
                  disabled={watchers.length >= MAX_SPECTATORS}
                  title="See every round without playing"
                >
                  <Icon name="eye" /> Just watch
                </button>
              )}
            </div>
            {renaming && (
              <RenameForm
                current={current}
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

          <section class={s.panel}>
            <h2>Game setup</h2>
            {host ? (
              <>
                <div class={s.setting} data-testid={lobbyTestIds.questionsSetting}>
                  <span class={s.settingLabel}>Questions</span>
                  <MixEditor mix={view.config.mix} onChange={(mix) => configureAsHost(conn, { mix })} />
                </div>
                <div class={s.setting} data-testid={lobbyTestIds.secondsSetting}>
                  <span class={s.settingLabel}>Seconds per round</span>
                  <Pills
                    label="Seconds per round"
                    options={SECONDS}
                    value={view.config.roundMs}
                    onChange={(roundMs) => configureAsHost(conn, { roundMs })}
                  />
                </div>
                <div class={s.setting} data-testid={lobbyTestIds.hintsSetting}>
                  <span class={s.settingLabel}>Hints per player</span>
                  <Pills
                    label="Hints per player"
                    options={HINTS}
                    value={view.config.hints}
                    onChange={(hints) => configureAsHost(conn, { hints })}
                  />
                </div>
                <div class={s.setting}>
                  <span class={s.settingLabel}>Map detail</span>
                  <MapDetailPicker
                    value={view.config.mapDetail}
                    onChange={(mapDetail) => configureAsHost(conn, { mapDetail })}
                  />
                </div>
              </>
            ) : (
              <>
                <SetupSummary view={view} />
                <p class={kit.hint}>
                  <HostWord capital /> picks these.
                </p>
              </>
            )}
            <h2>This device</h2>
            <label class={cx(kit.check, kit.switch)}>
              <input
                type="checkbox"
                role="switch"
                data-testid={lobbyTestIds.startOnPanSwitch}
                checked={startOnPan.value}
                onChange={(e) => (startOnPan.value = (e.target as HTMLInputElement).checked)}
              />
              Start each round with the Pan tool (handy on a tablet)
            </label>
            <label class={cx(kit.check, kit.switch)}>
              <input
                type="checkbox"
                role="switch"
                checked={soundOn.value}
                onChange={(e) => (soundOn.value = (e.target as HTMLInputElement).checked)}
              />
              Sounds (spray, countdown and round cues)
            </label>
            <label class={cx(kit.check, kit.switch)}>
              <input
                type="checkbox"
                role="switch"
                checked={globeView.value}
                onChange={(e) => (globeView.value = (e.target as HTMLInputElement).checked)}
              />
              Paint on a globe
            </label>
            <div class={s.start}>
              <VrButton view={vrView} />
              {host ? (
                <button
                  class="primary big"
                  data-testid={lobbyTestIds.startButton}
                  onClick={() => conn.start()}
                  disabled={players.length < 1}
                  title={players.length < 1 ? "Someone needs to play: take a seat, or wait for a player" : undefined}
                >
                  <Icon name="play" /> Start game
                </button>
              ) : (
                <p class={kit.hint}>
                  Waiting for <HostWord /> to start…
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function RenameForm({ current, onDone }: { current: string; onDone: (name: PlayerName | undefined) => void }) {
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
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(undefined)
        }}
        autoFocus
      />
      <button type="submit" disabled={nameToJoin(name) === undefined}>
        Save
      </button>
    </form>
  )
}

/** The setup in a line, for a guest in the headset. */
function setupLine(view: GameView): string {
  const { rounds, roundMs, mix, mapDetail, hints } = view.config
  const map = MAP_DETAILS.find((d) => d.id === mapDetail)?.label ?? mapDetail
  return `${rounds} ${rounds === 1 ? "round" : "rounds"} of ${roundMs / 1000} s, ${hints} ${hints === 1 ? "hint" : "hints"} each: ${describeMix(mix)}. ${map} map.`
}

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) with a class
 * that plays a short highlight; nothing flashes on first load.
 */
function SetupSummary({ view }: { view: GameView }) {
  const { rounds, roundMs, mix, mapDetail, hints } = view.config
  const shown = useRef(view.config)
  const before = shown.current
  useEffect(() => {
    shown.current = view.config
  })
  const mixChanged = QUESTION_TYPES.some((t) => mix[t.id] !== before.mix[t.id])
  const tiles = [
    {
      key: "rounds",
      testId: setupSummaryTestIds.rounds,
      value: String(rounds),
      label: rounds === 1 ? "round" : "rounds",
      changed: rounds !== before.rounds
    },
    {
      key: "seconds",
      testId: setupSummaryTestIds.seconds,
      value: `${roundMs / 1000} s`,
      label: "per round",
      changed: roundMs !== before.roundMs
    },
    {
      key: "hints",
      testId: setupSummaryTestIds.hints,
      value: String(hints),
      label: hints === 1 ? "hint each" : "hints each",
      changed: hints !== before.hints
    }
  ]
  return (
    <div class={s.summary} data-testid={setupSummaryTestIds.summary}>
      {tiles.map((t) => (
        <div key={`${t.key}:${t.value}`} class={cx(s.tile, t.changed && s.changed)} data-testid={t.testId}>
          <span class={s.value} data-testid={setupSummaryTestIds.tileValue}>
            {t.value}
          </span>
          <span class={s.label}>{t.label}</span>
        </div>
      ))}
      <div
        key={`questions:${describeMix(mix)}`}
        class={cx(s.tile, s.questions, mixChanged && s.changed)}
        data-testid={setupSummaryTestIds.questions}
      >
        <span class={s.label}>{describeMix(mix)}</span>
        <RoundStrip mix={mix} total={false} centred />
      </div>
      <div
        key={`map:${mapDetail}`}
        class={cx(s.tile, s.mapDetail, mapDetail !== before.mapDetail && s.changed)}
        data-testid={setupSummaryTestIds.mapDetail}
      >
        <MapDetailSummary value={mapDetail} />
      </div>
    </div>
  )
}
