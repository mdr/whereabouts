/**
 * The score review, for playtesters tuning the scoring: a made-up guess at
 * a real question (see score-review.ts), the answer and the score it gets,
 * and a verdict on whether that score is fair. Verdicts stay in the browser
 * until exported, a line of JSON each, every one carrying its case so it
 * can be re-scored as the scoring changes. Linked from nowhere.
 */
import { useEffect, useMemo, useState } from "preact/hooks"
import {
  REVIEW_FLOOR,
  buildDistribution,
  encodeCase,
  kernelById,
  reviewCases,
  scoreDistribution,
  type ScoreVerdict
} from "@whereabouts/shared"
import { MapView, usePaint } from "../ui/MapView"
import { Answer, Card, HudBottom, HudHeader, QuestionCard } from "../ui/bits"
import { isTyping } from "../keys"
import { reviewSet, scoreVerdicts, soloKernelId } from "../settings"
import { scoreReviewTestIds } from "./ScoreReviewTestIds"

const VERDICTS: { value: ScoreVerdict["verdict"]; label: string }[] = [
  { value: -2, label: "Much too low" },
  { value: -1, label: "Too low" },
  { value: 0, label: "About right" },
  { value: 1, label: "Too high" },
  { value: 2, label: "Much too high" }
]

export function ScoreReview() {
  return (
    <MapView>
      <Review />
    </MapView>
  )
}

function Review() {
  const paint = usePaint()
  const set = reviewSet.value
  const cases = useMemo(() => reviewCases(set), [set])
  const judged = new Set(scoreVerdicts.value.filter((v) => v.set === set).map((v) => v.index))
  const firstOpen = (from: number) => {
    for (let i = 0; i < cases.length; i++) if (!judged.has((from + i) % cases.length)) return (from + i) % cases.length
    return undefined
  }
  const [index, setIndex] = useState(() => firstOpen(0) ?? 0)
  useEffect(() => setIndex(firstOpen(0) ?? 0), [set])
  const [verdict, setVerdict] = useState<ScoreVerdict["verdict"] | undefined>(undefined)
  const [shouldBe, setShouldBe] = useState("")
  const [note, setNote] = useState("")
  const done = judged.size >= cases.length
  const c = cases[index]!
  const q = c.question
  const kernel = kernelById(soloKernelId.value)
  const score = useMemo(
    () => scoreDistribution(buildDistribution(c.layer.toCells(), REVIEW_FLOOR), q.answer, q.toleranceKm, kernel),
    [c, kernel.id]
  )

  useEffect(() => {
    paint.reset(q.toleranceKm)
    paint.enabled.value = false
    paint.layer.replaceCells(c.layer.cells)
    paint.showOwn()
    paint.gameMap.setDetail("reveal")
    paint.gameMap.showReveal(q.answer, q.toleranceKm)
    paint.gameMap.fitAnswerAndPaint(q.answer, paint.layer.toGeoJSON(), q.toleranceKm)
    setVerdict(undefined)
    setShouldBe("")
    setNote("")
  }, [c])

  const submit = async () => {
    if (verdict === undefined) return
    const target = Number(shouldBe)
    const text = await encodeCase({
      question: { kind: q.kind, id: q.id, label: q.label, answer: q.answer, toleranceKm: q.toleranceKm },
      kernel: kernel.id,
      floor: REVIEW_FLOOR,
      res: c.layer.res,
      score: score.score,
      parts: { A: score.A, B: score.B },
      cells: c.layer.toRecord()
    })
    const entry: ScoreVerdict = {
      set,
      index,
      guess: c.guess,
      verdict,
      ...(shouldBe.trim() !== "" && Number.isFinite(target) ? { shouldBe: target } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      at: new Date().toISOString(),
      case: text
    }
    scoreVerdicts.value = [...scoreVerdicts.value.filter((v) => v.set !== set || v.index !== index), entry]
    judged.add(index)
    setIndex(firstOpen(index + 1) ?? index)
  }
  const skip = () => setIndex((index + 1) % cases.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.key === "Enter") {
        e.preventDefault()
        void submit()
        return
      }
      if (isTyping(e.target ?? undefined)) return
      const n = Number(e.key)
      if (n >= 1 && n <= VERDICTS.length) setVerdict(VERDICTS[n - 1]!.value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const ownVerdicts = scoreVerdicts.value
  return (
    <div class="hud reveal">
      <div class="hud-top">
        <HudHeader home round={index + 1} total={cases.length} right={<span class="total">Set {set}</span>} />
        <QuestionCard q={q} credit>
          <Answer label={q.label} wiki={q.wiki} />
        </QuestionCard>
        <div class="card score">
          <div class="big" data-testid={scoreReviewTestIds.score}>
            {Math.round(score.score)}
          </div>
          <div class="label">scored with {kernel.label}</div>
        </div>
      </div>
      <div class="hud-right">
        <Card title="Is this score fair?" class="score-review">
          <div class="verdicts" role="radiogroup">
            {VERDICTS.map((v, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={verdict === v.value}
                class={verdict === v.value ? "selected" : ""}
                onClick={() => setVerdict(v.value)}
                data-testid={scoreReviewTestIds.verdict}
                data-verdict={v.value}
              >
                <kbd>{i + 1}</kbd> {v.label}
              </button>
            ))}
          </div>
          <label class="should-be">
            It should be about
            <input
              type="number"
              min={0}
              max={1000}
              step={10}
              value={shouldBe}
              onInput={(e) => setShouldBe((e.target as HTMLInputElement).value)}
              placeholder="optional"
            />
          </label>
          <textarea
            rows={2}
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            placeholder="Why? (optional)"
          />
          <p class="hint" data-testid={scoreReviewTestIds.progress}>
            {judged.size} of {cases.length} judged in this set
            {done ? ": all done." : "."}
          </p>
          <div class="review-actions">
            <button
              type="button"
              onClick={() => exportVerdicts(ownVerdicts)}
              disabled={ownVerdicts.length === 0}
              data-testid={scoreReviewTestIds.exportButton}
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
      </div>
      <HudBottom>
        <button type="button" onClick={skip}>
          Skip
        </button>
        <button
          class="primary"
          onClick={() => void submit()}
          disabled={verdict === undefined}
          data-testid={scoreReviewTestIds.submitButton}
        >
          Submit <kbd>Enter</kbd>
        </button>
      </HudBottom>
    </div>
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
