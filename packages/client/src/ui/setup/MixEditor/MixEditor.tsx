/**
 * The question mix: how many rounds of each type of question. The host picks
 * a preset, or sets a count per type with − / +; the counts are the game's
 * rounds. A strip of coloured cells, one per round, shows the game at a
 * glance, to the host and (in the setup summary) to guests.
 */
import { type QuestionMix } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_DISPLAY_INFO, questionTypeColourStyle } from "../../../question-types"
import { Stepper } from "../Stepper/Stepper"
import { Pills } from "../Pills/Pills"
import { MIX_PRESETS, presetMix, presetOf } from "../mix-presets"
import { mixStepBounds } from "../mix-step-bounds"
import { mixEditorTestIds } from "./MixEditorTestIds"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { useTelemetry } from "../../../telemetry/use-telemetry"
import { RoundStrip } from "../RoundStrip/RoundStrip"
import styles from "./MixEditor.module.css"

export const MixEditor = ({ mix, onChange }: { mix: QuestionMix; onChange: (mix: QuestionMix) => void }) => {
  const { analytics } = useTelemetry()
  return (
    <div class={styles.editor}>
      <Pills
        label="Presets"
        options={MIX_PRESETS}
        value={presetOf(mix)}
        onChange={(preset) => {
          analytics.track(ANALYTICS_CODES.setup.presetChosen, "chose a question preset", { preset })
          onChange(presetMix(preset))
        }}
      />
      <ul class={styles.rows}>
        {QUESTION_TYPES.map((type) => {
          const displayInfo = QUESTION_TYPE_DISPLAY_INFO[type]
          return (
            <li
              key={type}
              class={styles.row}
              style={questionTypeColourStyle(type)}
              data-testid={mixEditorTestIds.row}
              data-type={type}
            >
              <span class={styles.swatch} aria-hidden="true" />
              <span class={styles.type}>
                <b>{displayInfo.heading}</b>
                <small>{displayInfo.description}</small>
              </span>
              <Stepper
                label={displayInfo.heading}
                value={mix[type]}
                {...mixStepBounds(mix, type)}
                onChange={(count) => onChange({ ...mix, [type]: count })}
              />
            </li>
          )
        })}
      </ul>
      <RoundStrip mix={mix} />
    </div>
  )
}
