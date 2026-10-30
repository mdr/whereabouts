/**
 * The score review, for playtesters tuning the scoring: made-up guesses at
 * real questions (see score-review.ts), the answer and the scores they get.
 * One guess alone asks whether its score is fair; two at the same answer
 * ask which deserves more. Verdicts stay in the browser until exported, a
 * line of JSON each, every one carrying its cases so they can be re-scored
 * as the scoring changes. Linked from nowhere.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { QUESTIONS } from "@whereabouts/shared/questions"
import {
  REVIEW_VERSION,
  guessCase,
  reviewCases,
  scoreGuess,
  type ReviewPools,
  type ScoreVerdict
} from "@whereabouts/shared/score-review"
import { colourCss, playerColour } from "@whereabouts/shared/colours"
import { kernelById } from "@whereabouts/shared/scoring"
import { MapView, usePaint } from "../ui/MapView"
import { Answer, Card, QuestionCard } from "../ui/bits"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop } from "../ui/Hud"
import { ScoreCard } from "../ui/Round"
import { Swatch } from "../ui/PlayerList"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import pl from "../ui/Players.module.css"
import s from "./ScoreReview.module.css"
import { isTyping } from "../keys"
import { featureQuestions, regions } from "../regions"
import { LoadingOutlines } from "../ui/LoadingOutlines"
import { reviewSet, scoreVerdicts, soloKernelId } from "../settings"
import { scoreReviewTestIds } from "./ScoreReviewTestIds"

type Choice = -2 | -1 | 0 | 1 | 2

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

const PAIR_COLOURS = [colourCss(playerColour(0)), colourCss(playerColour(1))] as const

export function ScoreReview() {
  return (
    <MapView>
      <ReviewLoader />
    </MapView>
  )
}

function ReviewLoader() {
  const byId = regions.value
  const features = featureQuestions.value
  const pools = useMemo<ReviewPools | undefined>(
    () =>
      byId &&
      features && {
        places: QUESTIONS,
        countries: [...byId.values()].filter((q) => q.topic === undefined),
        features: features.filter((q) => q.topic !== "state"),
        states: features.filter((q) => q.topic === "state")
      },
    [byId, features]
  )
  if (!pools) return <LoadingOutlines />
  return <Review pools={pools} />
}

function Review({ pools }: { pools: ReviewPools }) {
  const paint = usePaint()
  const set = reviewSet.value
  const cases = useMemo(() => reviewCases(set, pools), [set, pools])
  const judged = new Set(
    scoreVerdicts.value.filter((v) => v.version === REVIEW_VERSION && v.set === set).map((v) => v.index)
  )
  const firstOpen = (from: number) => {
    for (let i = 0; i < cases.length; i++) if (!judged.has((from + i) % cases.length)) return (from + i) % cases.length
    return undefined
  }
  const [index, setIndex] = useState(() => firstOpen(0) ?? 0)
  useEffect(() => setIndex(firstOpen(0) ?? 0), [set])
  const [choice, setChoiceState] = useState<Choice | undefined>(undefined)
  // Read by submit, so Enter straight after a number key sees the new choice before a render.
  const chosen = useRef<Choice | undefined>(undefined)
  const setChoice = (c: Choice | undefined) => {
    chosen.current = c
    setChoiceState(c)
  }
  const [shouldBe, setShouldBe] = useState("")
  const [note, setNote] = useState("")
  /** In a pair, the one guess shown alone: pinned by a click, or under the mouse. */
  const [pinned, setPinned] = useState<0 | 1 | undefined>(undefined)
  const [hovered, setHovered] = useState<0 | 1 | undefined>(undefined)
  const done = judged.size >= cases.length
  const c = cases[index]!
  const q = c.question
  const guesses = c.kind === "single" ? [c.guess] : c.guesses
  const kernel = kernelById(soloKernelId.value)
  const scores = useMemo(() => guesses.map((g) => scoreGuess(q, g.layer, kernel).score), [c, kernel.id])

  const frame = (fc: GeoJSON.FeatureCollection) => {
    if (q.kind === "region") paint.gameMap.fitRegionAndPaint(q.answer, q.outline, fc, q.toleranceKm)
    else paint.gameMap.fitAnswerAndPaint(q.answer, fc, q.toleranceKm)
  }
  const showPair = (only: 0 | 1 | undefined) =>
    paint.showLayers(
      guesses.flatMap((g, i) =>
        only === undefined || only === i ? [{ layer: g.layer, colour: PAIR_COLOURS[i]! }] : []
      )
    )

  useEffect(() => {
    paint.reset(q.toleranceKm)
    paint.enabled.value = false
    paint.gameMap.setDetail("reveal")
    if (q.kind === "region") paint.gameMap.showRegionReveal(q.outline)
    else paint.gameMap.showReveal(q.answer, q.toleranceKm)
    if (c.kind === "single") {
      paint.layer.replaceCells(c.guess.layer.cells)
      paint.showOwn()
      frame(paint.layer.toGeoJSON())
    } else frame(showPair(undefined))
    setChoice(undefined)
    setShouldBe("")
    setNote("")
    setPinned(undefined)
    setHovered(undefined)
  }, [c])

  // Not reframed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (c.kind === "pair") showPair(hovered ?? pinned)
  }, [hovered, pinned])

  const submit = async () => {
    const choice = chosen.current
    if (choice === undefined) return
    const base = {
      version: REVIEW_VERSION,
      set,
      index,
      ...(note.trim() ? { note: note.trim() } : {}),
      at: new Date().toISOString()
    }
    let entry: ScoreVerdict
    if (c.kind === "single") {
      const target = Number(shouldBe)
      entry = {
        ...base,
        guess: c.guess.kind,
        verdict: choice,
        ...(shouldBe.trim() !== "" && Number.isFinite(target) ? { shouldBe: target } : {}),
        case: await guessCase(q, c.guess.layer, kernel)
      }
    } else {
      const [a, b] = c.guesses
      entry = {
        ...base,
        pair: true,
        guesses: [a.kind, b.kind],
        prefer: choice,
        cases: [await guessCase(q, a.layer, kernel), await guessCase(q, b.layer, kernel)]
      }
    }
    scoreVerdicts.value = [
      ...scoreVerdicts.value.filter((v) => v.version !== REVIEW_VERSION || v.set !== set || v.index !== index),
      entry
    ]
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
      if (n >= 1 && n <= 5) setChoice((n - 3) as Choice)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const options = c.kind === "single" ? FAIRNESS : PREFERENCE
  const ownVerdicts = scoreVerdicts.value
  return (
    <Hud reveal>
      <HudTop>
        <HudHeader home round={index + 1} total={cases.length} right={<HeaderNote nowrap>Set {set}</HeaderNote>} />
        <QuestionCard q={q} hud="reveal" credit countryFlag={q.kind === "region" ? q.countryFlag : undefined}>
          <Answer label={q.label} wiki={q.wiki} />
        </QuestionCard>
        {c.kind === "single" && (
          <ScoreCard
            score={Math.round(scores[0]!)}
            label={q.kind === "region" ? "scored on shape and nearness" : `scored with ${kernel.label}`}
            testIds={{ score: scoreReviewTestIds.score }}
          />
        )}
      </HudTop>
      <HudRight>
        <Card title={c.kind === "single" ? "Is this score fair?" : "Which deserves more?"} class={s.review}>
          {c.kind === "pair" && (
            <ul class={cx(pl.list, pl.pick)} data-testid={scoreReviewTestIds.pair}>
              {(["A", "B"] as const).map((name, i) => (
                <li
                  class={pinned === i ? pl.selected : undefined}
                  onClick={() => setPinned(pinned === i ? undefined : (i as 0 | 1))}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i as 0 | 1)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(undefined)}
                >
                  <Swatch css={PAIR_COLOURS[i]} />
                  <span class={pl.name}>{name}</span>
                  <span class={pl.roundScore} data-testid={scoreReviewTestIds.pairScore}>
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
                onClick={() => setChoice(o.value)}
                data-testid={scoreReviewTestIds.verdict}
                data-verdict={o.value}
              >
                <kbd>{i + 1}</kbd> {o.label}
              </button>
            ))}
          </div>
          {c.kind === "single" && (
            <label class={s.shouldBe}>
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
          )}
          <textarea
            rows={2}
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            placeholder="Why? (optional)"
          />
          <p class={kit.hint} data-testid={scoreReviewTestIds.progress}>
            {judged.size} of {cases.length} judged in this set
            {done ? ": all done." : "."}
            {c.kind === "pair" && " Point at A or B to see it alone; click to keep it."}
          </p>
          <div class={s.actions}>
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
      </HudRight>
      <HudBottom>
        <button type="button" onClick={skip}>
          Skip
        </button>
        <button
          class="primary"
          onClick={() => void submit()}
          disabled={choice === undefined}
          data-testid={scoreReviewTestIds.submitButton}
        >
          Submit <kbd>Enter</kbd>
        </button>
      </HudBottom>
    </Hud>
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
