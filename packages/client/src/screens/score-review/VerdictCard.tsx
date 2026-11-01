import { ReviewCaseType, type ReviewCase, type ScoreVerdict } from "@whereabouts/shared/scoring/score-review"
import { Card } from "../../ui/Card"
import { Swatch, SwatchType } from "../../ui/players/Swatch"
import { cx } from "../../ui/cx"
import kit from "../../ui/kit.module.css"
import pl from "../../ui/players/Players.module.css"
import { reviewSet, scoreVerdicts } from "../../settings/settings"
import { PAIR_COLOURS } from "./pair-colours"
import { verdictCardTestIds } from "./VerdictCardTestIds"
import s from "./VerdictCard.module.css"

export type Choice = -2 | -1 | 0 | 1 | 2

const FAIRNESS: { value: Choice; label: string }[] = [
  { value: -2, label: "Much too low" },
  { value: -1, label: "Too low" },
  { value: 0, label: "About right" },
  { value: 1, label: "Too high" },
  { value: 2, label: "Much too high" }
]

const PREFERENCE: { value: Choice; label: string }[] = [
  { value: -2, label: "A, clearly" },
  { value: -1, label: "A, a little" },
  { value: 0, label: "About the same" },
  { value: 1, label: "B, a little" },
  { value: 2, label: "B, clearly" }
]

/** The playtester's side of the review: the verdict, a note, and the progress through the set. */
export function VerdictCard({
  c,
  scores,
  choice,
  onChoose,
  shouldBe,
  onShouldBe,
  note,
  onNote,
  pinned,
  onPin,
  onHover,
  judged,
  total,
  set
}: {
  c: ReviewCase
  scores: number[]
  choice: Choice | undefined
  onChoose: (choice: Choice) => void
  shouldBe: string
  onShouldBe: (shouldBe: string) => void
  note: string
  onNote: (note: string) => void
  /** In a pair, the one guess shown alone: pinned by a click. */
  pinned: 0 | 1 | undefined
  onPin: (pinned: 0 | 1 | undefined) => void
  onHover: (hovered: 0 | 1 | undefined) => void
  judged: number
  total: number
  set: number
}) {
  const done = judged >= total
  const options = c.type === ReviewCaseType.SINGLE ? FAIRNESS : PREFERENCE
  const ownVerdicts = scoreVerdicts.value
  return (
    <Card title={c.type === ReviewCaseType.SINGLE ? "Is this score fair?" : "Which deserves more?"} class={s.review}>
      {c.type === ReviewCaseType.PAIR && (
        <ul class={cx(pl.list, pl.pick)} data-testid={verdictCardTestIds.pair}>
          {(["A", "B"] as const).map((name, i) => (
            <li
              class={pinned === i ? pl.selected : undefined}
              onClick={() => onPin(pinned === i ? undefined : (i as 0 | 1))}
              onPointerEnter={(e) => e.pointerType === "mouse" && onHover(i as 0 | 1)}
              onPointerLeave={(e) => e.pointerType === "mouse" && onHover(undefined)}
            >
              <Swatch type={SwatchType.CSS} css={PAIR_COLOURS[i]!} />
              <span class={pl.name}>{name}</span>
              <span class={pl.roundScore} data-testid={verdictCardTestIds.pairScore}>
                {Math.round(scores[i]!)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div class={s.verdicts} role="radiogroup">
        {options.map((o, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={choice === o.value}
            class={choice === o.value ? s.selected : undefined}
            onClick={() => onChoose(o.value)}
            data-testid={verdictCardTestIds.verdict}
            data-verdict={o.value}
          >
            <kbd>{i + 1}</kbd> {o.label}
          </button>
        ))}
      </div>
      {c.type === ReviewCaseType.SINGLE && (
        <label class={s.shouldBe}>
          It should be about
          <input
            type="number"
            min={0}
            max={1000}
            step={10}
            value={shouldBe}
            onInput={(e) => onShouldBe(e.currentTarget.value)}
            placeholder="optional"
          />
        </label>
      )}
      <textarea rows={2} value={note} onInput={(e) => onNote(e.currentTarget.value)} placeholder="Why? (optional)" />
      <p class={kit.hint} data-testid={verdictCardTestIds.progress}>
        {judged} of {total} judged in this set
        {done ? ": all done." : "."}
        {c.type === ReviewCaseType.PAIR && " Point at A or B to see it alone; click to keep it."}
      </p>
      <div class={s.actions}>
        <button
          type="button"
          onClick={() => exportVerdicts(ownVerdicts)}
          disabled={ownVerdicts.length === 0}
          data-testid={verdictCardTestIds.exportButton}
        >
          Export {ownVerdicts.length} verdict{ownVerdicts.length === 1 ? "" : "s"}
        </button>
        {done && (
          <button type="button" onClick={() => (reviewSet.value = set + 1)}>
            Next set
          </button>
        )}
      </div>
    </Card>
  )
}

function exportVerdicts(verdicts: ScoreVerdict[]): void {
  const text = verdicts.map((v) => JSON.stringify(v)).join("\n") + "\n"
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }))
  a.download = `score-verdicts-${new Date().toISOString().slice(0, 10)}.jsonl`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
