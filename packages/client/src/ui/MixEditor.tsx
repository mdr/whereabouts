/**
 * The question mix: how many rounds of each kind of question. The host sets
 * a count per kind with − / +; the counts are the game's rounds. A strip of coloured cells, one per round, shows the game at a
 * glance, to the host and (in the setup summary) to guests.
 */
import { MAX_ROUNDS, QUESTION_TYPES, mixTotal, type QuestionMix, type QuestionType } from "@whereabouts/shared/protocol"
import { Stepper } from "./Controls"
import { mixEditorTestIds } from "./MixEditorTestIds"
import { cx } from "./cx"
import s from "./MixEditor.module.css"

const UNITS: Record<QuestionType, [string, string]> = {
  landmarks: ["landmark", "landmarks"],
  places: ["place name", "place names"],
  countries: ["whole country", "whole countries"],
  flags: ["flag", "flags"],
  features: ["island, lake or sea", "islands, lakes or seas"],
  states: ["US state", "US states"]
}

/** Sets `--type` to the colour of a kind of question, for what is drawn in it. */
export function typeColour(type: QuestionType): Record<string, string> {
  return { "--type": `var(--type-${type})` }
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
    <div class={s.editor}>
      <ul class={s.rows}>
        {QUESTION_TYPES.map((t) => {
          const others = rounds - mix[t.id]
          return (
            <li key={t.id} class={s.row} style={typeColour(t.id)} data-testid={mixEditorTestIds.row} data-type={t.id}>
              <span class={s.swatch} aria-hidden="true" />
              <span class={s.type}>
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

/**
 * One cell per round, coloured by kind, with the total unless `total` is
 * false; `centred` in a tile. The real order is shuffled.
 */
export function RoundStrip({ mix, total = true, centred }: { mix: QuestionMix; total?: boolean; centred?: boolean }) {
  const rounds = mixTotal(mix)
  return (
    <div class={cx(s.strip, centred && s.centred)} data-testid={mixEditorTestIds.strip}>
      <div class={s.cells} role="img" aria-label={describeMix(mix)}>
        {QUESTION_TYPES.flatMap((t) =>
          Array.from({ length: mix[t.id] }, (_, i) => (
            <span key={`${t.id}${i}`} class={s.cell} style={typeColour(t.id)} data-testid={mixEditorTestIds.cell} />
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
