/**
 * The question mix: how many rounds of each type of question. The host sets
 * a count per type with − / +; the counts are the game's rounds. A strip of coloured cells, one per round, shows the game at a
 * glance, to the host and (in the setup summary) to guests.
 */
import { MAX_ROUNDS, mixTotal, type QuestionMix } from "@whereabouts/shared/protocol"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_LOOKS, typeColour } from "../question-types"
import { Stepper } from "./Controls"
import { mixEditorTestIds } from "./MixEditorTestIds"
import { cx } from "./cx"
import s from "./MixEditor.module.css"

/** "4 landmarks · 1 flag": the types a game asks, in the host's order. */
export function describeMix(mix: QuestionMix): string {
  return QUESTION_TYPES.filter((t) => mix[t] > 0)
    .map((t) => `${mix[t]} ${QUESTION_TYPE_LOOKS[t].unit[mix[t] === 1 ? 0 : 1]}`)
    .join(" · ")
}

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

/**
 * One cell per round, coloured by type, with the total unless `total` is
 * false; `centred` in a tile. The real order is shuffled.
 */
export function RoundStrip({ mix, total = true, centred }: { mix: QuestionMix; total?: boolean; centred?: boolean }) {
  const rounds = mixTotal(mix)
  return (
    <div class={cx(s.strip, centred && s.centred)} data-testid={mixEditorTestIds.strip}>
      <div class={s.cells} role="img" aria-label={describeMix(mix)}>
        {QUESTION_TYPES.flatMap((t) =>
          Array.from({ length: mix[t] }, (_, i) => (
            <span key={`${t}${i}`} class={s.cell} style={typeColour(t)} data-testid={mixEditorTestIds.cell} />
          ))
        )}
      </div>
      {total && (
        <span class={s.stripText}>
          {rounds} {rounds === 1 ? "round" : "rounds"}, in a random order
        </span>
      )}
    </div>
  )
}
