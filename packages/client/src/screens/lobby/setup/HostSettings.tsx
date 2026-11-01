import { ROUND_LENGTHS, type GameView } from "@whereabouts/shared/protocol"
import { MAX_HINTS } from "@whereabouts/shared/hints"
import type { Connection } from "../../../net/net"
import { configureAsHost } from "../../../settings/host-setup"
import { Pills } from "../../../ui/setup/Pills"
import { MixEditor } from "../../../ui/setup/MixEditor"
import { MapDetailPicker } from "../../../ui/setup/MapDetailPicker"
import { hostSettingsTestIds } from "./HostSettingsTestIds"
import s from "./HostSettings.module.css"

const SECONDS = ROUND_LENGTHS.map((ms) => ({ value: ms, label: String(ms / 1000) }))
const HINTS = Array.from({ length: MAX_HINTS + 1 }, (_, n) => ({ value: n, label: String(n) }))

export function HostSettings({ conn, view, online }: { conn: Connection; view: GameView; online: boolean }) {
  return (
    <fieldset class={s.settings} disabled={!online}>
      <div class={s.setting} data-testid={hostSettingsTestIds.questionsSetting}>
        <span class={s.settingLabel}>Questions</span>
        <MixEditor mix={view.config.mix} onChange={(mix) => configureAsHost(conn, { mix })} />
      </div>
      <div class={s.setting} data-testid={hostSettingsTestIds.secondsSetting}>
        <span class={s.settingLabel}>Seconds per round</span>
        <Pills
          label="Seconds per round"
          options={SECONDS}
          value={view.config.roundLength}
          onChange={(roundLength) => configureAsHost(conn, { roundLength })}
        />
      </div>
      <div class={s.setting} data-testid={hostSettingsTestIds.hintsSetting}>
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
