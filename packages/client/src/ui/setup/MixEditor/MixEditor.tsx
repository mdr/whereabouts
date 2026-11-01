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
import s from "./MixEditor.module.css"

export function MixEditor({ mix, onChange }: { mix: QuestionMix; onChange: (mix: QuestionMix) => void }) {
  const rounds = mixTotal(mix)
  return (
    <div class={s.editor}>
      <ul class={s.rows}>
        {QUESTION_TYPES.map((t) => {
          const others = rounds - mix[t]
          const look = QUESTION_TYPE_LOOKS[t]
          return (
            <li key={t} class={s.row} style={typeColour(t)} data-testid={mixEditorTestIds.row} data-type={t}>
              <span class={s.swatch} aria-hidden="true" />
              <span class={s.type}>
                <b>{look.label}</b>
                <small>{look.detail}</small>
              </span>
              <Stepper
                label={look.label}
                value={mix[t]}
                // A game has at least one round and at most MAX_ROUNDS.
                min={others === 0 ? 1 : 0}
                max={MAX_ROUNDS - others}
                onChange={(n) => onChange({ ...mix, [t]: n })}
              />
            </li>
          )
        })}
      </ul>
      <RoundStrip mix={mix} />
    </div>
  )
}
