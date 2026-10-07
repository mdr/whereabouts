/**
 * The question mix: how many rounds of each kind of question. The host sets
 * a count per kind with − / +; the counts are the game's rounds. A strip of coloured cells, one per round, shows the game at a
 * glance, to the host and (in the setup summary) to guests.
 */
import { MAX_ROUNDS, QUESTION_TYPES, mixTotal, type QuestionMix, type QuestionType } from "@whereabouts/shared"
import { Stepper } from "./Controls"
import { mixEditorTestIds } from "./MixEditorTestIds"

const UNITS: Record<QuestionType, [string, string]> = {
  landmarks: ["landmark", "landmarks"],
  places: ["place name", "place names"],
  countries: ["whole country", "whole countries"],
  flags: ["flag", "flags"]
}

/** "4 landmarks · 1 flag": the kinds a game asks, in the host's order. */
export function describeMix(mix: QuestionMix): string {
  return QUESTION_TYPES.filter((t) => mix[t.id] > 0)
    .map((t) => `${mix[t.id]} ${UNITS[t.id][mix[t.id] === 1 ? 0 : 1]}`)
    .join(" · ")
}

export function MixEditor({ mix, onChange }: { mix: QuestionMix; onChange: (mix: QuestionMix) => void }) {
  const rounds = mixTotal(mix)
  return (
    <div class="mix-editor">
      <ul class="mix-rows">
        {QUESTION_TYPES.map((t) => {
          const others = rounds - mix[t.id]
          return (
            <li key={t.id} class={`mix-row type-${t.id}`} data-testid={mixEditorTestIds.row} data-type={t.id}>
              <span class="swatch" aria-hidden="true" />
              <span class="type">
                <b>{t.label}</b>
                <small>{t.detail}</small>
              </span>
              <Stepper
                label={t.label}
                value={mix[t.id]}
                // A game has at least one round and at most MAX_ROUNDS.
                min={others === 0 ? 1 : 0}
                max={MAX_ROUNDS - others}
                onChange={(n) => onChange({ ...mix, [t.id]: n })}
              />
            </li>
          )
        })}
      </ul>
      <RoundStrip mix={mix} />
    </div>
  )
}

/** One cell per round, coloured by kind, with the total unless `total` is false. The real order is shuffled. */
export function RoundStrip({ mix, total = true }: { mix: QuestionMix; total?: boolean }) {
  const rounds = mixTotal(mix)
  return (
    <div class="round-strip">
      <div class="cells" role="img" aria-label={describeMix(mix)}>
        {QUESTION_TYPES.flatMap((t) =>
          Array.from({ length: mix[t.id] }, (_, i) => <span key={`${t.id}${i}`} class={`cell type-${t.id}`} />)
        )}
      </div>
      {total && (
        <span class="strip-text">
          {rounds} {rounds === 1 ? "round" : "rounds"}, in a random order
        </span>
      )}
    </div>
  )
}
