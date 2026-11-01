import { useEffect, useRef } from "preact/hooks"
import { ROUND_LENGTHS, MAP_DETAILS, mixTotal, type GameView } from "@whereabouts/shared/protocol"
import { MAX_HINTS } from "@whereabouts/shared/hints"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import type { Connection } from "../net/net"
import { configureAsHost } from "../settings/host-setup"
import { globeView, soundOn, startOnPan } from "../settings/settings"
import { HostWord } from "../ui/players/PlayerList"
import { Icon } from "../ui/icons"
import { Pills } from "../ui/setup/Controls"
import { MixEditor, RoundStrip, describeMix } from "../ui/setup/MixEditor"
import { MapDetailPicker, MapDetailSummary } from "../ui/setup/MapDetailPicker"
import { VrButton } from "../ui/VrButton"
import type { VrView } from "../vr/view/view"
import { lobbyTestIds, setupSummaryTestIds } from "./LobbyTestIds"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import s from "./Lobby.module.css"

const SECONDS = ROUND_LENGTHS.map((ms) => ({ value: ms, label: String(ms / 1000) }))
const HINTS = Array.from({ length: MAX_HINTS + 1 }, (_, n) => ({ value: n, label: String(n) }))

/** The right panel: the game's setup, this device's switches, and the way to start. */
export function SetupPanel({
  conn,
  view,
  online,
  vrView,
  playerCount
}: {
  conn: Connection
  view: GameView
  online: boolean
  vrView: VrView
  playerCount: number
}) {
  const host = view.you.isHost
  return (
    <section class={s.panel}>
      <h2>Game setup</h2>
      {host ? (
        <HostSettings conn={conn} view={view} online={online} />
      ) : (
        <>
          <SetupSummary view={view} />
          <p class={kit.hint}>
            <HostWord capital /> picks these.
          </p>
        </>
      )}
      <h2>This device</h2>
      <DeviceSwitches />
      <div class={s.start}>
        <VrButton view={vrView} />
        {host ? (
          <button
            class="primary big"
            data-testid={lobbyTestIds.startButton}
            onClick={() => conn.start()}
            disabled={playerCount < 1 || !online}
            title={playerCount < 1 ? "Someone needs to play: take a seat, or wait for a player" : undefined}
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
  )
}

function HostSettings({ conn, view, online }: { conn: Connection; view: GameView; online: boolean }) {
  return (
    <fieldset class={s.settings} disabled={!online}>
      <div class={s.setting} data-testid={lobbyTestIds.questionsSetting}>
        <span class={s.settingLabel}>Questions</span>
        <MixEditor mix={view.config.mix} onChange={(mix) => configureAsHost(conn, { mix })} />
      </div>
      <div class={s.setting} data-testid={lobbyTestIds.secondsSetting}>
        <span class={s.settingLabel}>Seconds per round</span>
        <Pills
          label="Seconds per round"
          options={SECONDS}
          value={view.config.roundLength}
          onChange={(roundLength) => configureAsHost(conn, { roundLength })}
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
        <MapDetailPicker value={view.config.mapDetail} onChange={(mapDetail) => configureAsHost(conn, { mapDetail })} />
      </div>
    </fieldset>
  )
}

function DeviceSwitches() {
  return (
    <>
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
    </>
  )
}

/** The setup in a line, for a guest in the headset. */
export function setupLine(view: GameView): string {
  const { roundLength, mix, mapDetail, hints } = view.config
  const rounds = mixTotal(mix)
  const map = MAP_DETAILS.find((d) => d.id === mapDetail)?.label ?? mapDetail
  return `${rounds} ${rounds === 1 ? "round" : "rounds"} of ${roundLength / 1000} s, ${hints} ${hints === 1 ? "hint" : "hints"} each: ${describeMix(mix)}. ${map} map.`
}

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) with a class
 * that plays a short highlight; nothing flashes on first load.
 */
function SetupSummary({ view }: { view: GameView }) {
  const { roundLength, mix, mapDetail, hints } = view.config
  const rounds = mixTotal(mix)
  const shown = useRef(view.config)
  const before = shown.current
  useEffect(() => {
    shown.current = view.config
  })
  const mixChanged = QUESTION_TYPES.some((t) => mix[t] !== before.mix[t])
  const tiles = [
    {
      key: "rounds",
      testId: setupSummaryTestIds.rounds,
      value: String(rounds),
      label: rounds === 1 ? "round" : "rounds",
      changed: rounds !== mixTotal(before.mix)
    },
    {
      key: "seconds",
      testId: setupSummaryTestIds.seconds,
      value: `${roundLength / 1000} s`,
      label: "per round",
      changed: roundLength !== before.roundLength
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
