import { ROUND_LENGTHS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { MAX_HINTS } from "@whereabouts/shared/hints"
import { useGameService } from "../../../../game-service/use-game-service"
import { configureAsHost } from "../../../../settings/host-setup"
import { Pills } from "../../../../ui/setup/Pills/Pills"
import { MixEditor } from "../../../../ui/setup/MixEditor/MixEditor"
import { MapDetailPicker } from "../../../../ui/setup/MapDetailPicker/MapDetailPicker"
import { hostSettingsTestIds } from "./HostSettingsTestIds"
import styles from "./HostSettings.module.css"

const ROUND_LENGTH_OPTIONS = ROUND_LENGTHS.map((ms) => ({ value: ms, label: String(ms / 1000) }))
const HINTS = Array.from({ length: MAX_HINTS + 1 }, (_, n) => ({ value: n, label: String(n) }))

export const HostSettings = ({ view }: { view: GameView }) => {
  const game = useGameService()
  return (
    <fieldset class={styles.settings} disabled={!game.online.value}>
      <div class={styles.setting} data-testid={hostSettingsTestIds.questionsSetting}>
        <span class={styles.settingLabel}>Questions</span>
        <MixEditor mix={view.config.mix} onChange={(mix) => configureAsHost(game, { mix })} />
      </div>
      <div class={styles.setting} data-testid={hostSettingsTestIds.secondsSetting}>
        <span class={styles.settingLabel}>Seconds per round</span>
        <Pills
          label="Seconds per round"
          options={ROUND_LENGTH_OPTIONS}
          value={view.config.roundLength}
          onChange={(roundLength) => configureAsHost(game, { roundLength })}
        />
      </div>
      <div class={styles.setting} data-testid={hostSettingsTestIds.hintsSetting}>
        <span class={styles.settingLabel}>Hints per player</span>
        <Pills
          label="Hints per player"
          options={HINTS}
          value={view.config.hints}
          onChange={(hints) => configureAsHost(game, { hints })}
        />
      </div>
      <div class={styles.setting}>
        <span class={styles.settingLabel}>Map detail</span>
        <MapDetailPicker value={view.config.mapDetail} onChange={(mapDetail) => configureAsHost(game, { mapDetail })} />
      </div>
    </fieldset>
  )
}
