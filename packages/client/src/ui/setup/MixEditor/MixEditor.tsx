/**
 * The question mix: how many rounds of each type of question. The host sets
 * a count per type with − / +; the counts are the game's rounds. A strip of coloured cells, one per round, shows the game at a
 * glance, to the host and (in the setup summary) to guests.
 */
import { MAX_ROUNDS, mixTotal, type QuestionMix } from "@whereabouts/shared/protocol"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_LOOKS, typeColour } from "../../../question-types"
import { Stepper } from "../Stepper/Stepper"
import { mixEditorTestIds } from "./MixEditorTestIds"
import { RoundStrip } from "../RoundStrip/RoundStrip"
import styles from "./MixEditor.module.css"

export function MixEditor({ mix, onChange }: { mix: QuestionMix; onChange: (mix: QuestionMix) => void }) {
  const rounds = mixTotal(mix)
  return (
    <div class={styles.editor}>
      <ul class={styles.rows}>
        {QUESTION_TYPES.map((type) => {
          const others = rounds - mix[type]
          const look = QUESTION_TYPE_LOOKS[type]
          return (
            <li
              key={type}
              class={styles.row}
              style={typeColour(type)}
              data-testid={mixEditorTestIds.row}
              data-type={type}
            >
              <span class={styles.swatch} aria-hidden="true" />
              <span class={styles.type}>
                <b>{look.label}</b>
                <small>{look.detail}</small>
              </span>
              <Stepper
                label={look.label}
                value={mix[type]}
                // A game has at least one round and at most MAX_ROUNDS.
                min={others === 0 ? 1 : 0}
                max={MAX_ROUNDS - others}
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
