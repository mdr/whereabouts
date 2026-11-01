import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { AnswerType, type Outlines } from "@whereabouts/shared/questions"
import { CATALOGUE } from "@whereabouts/shared/catalogue/catalogue"
import { questionView } from "@whereabouts/shared/game/question-views"
import {
  REVIEW_VERSION,
  ReviewCaseType,
  guessCase,
  reviewCases,
  scoreGuess
} from "@whereabouts/shared/scoring/score-review"
import type { ScoreVerdict } from "@whereabouts/shared/scoring/score-verdict"
import { kernelById } from "@whereabouts/shared/scoring/scoring"
import { usePaint } from "../../ui/map/MapView/MapView"
import { CardPlace, QuestionCard } from "../../ui/round/question/QuestionCard/QuestionCard"
import { Answer } from "../../ui/round/question/Answer/Answer"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop } from "../../ui/map/Hud/Hud"
import { ScoreCard } from "../../ui/round/ScoreCard"
import { isTyping } from "../../keyboard/keys"
import { RevealDetail } from "../../map/shown-detail"
import { reviewSet, scoreVerdicts, soloKernelId } from "../../settings/settings"
import { scoreReviewTestIds } from "./ScoreReview/ScoreReviewTestIds"
import { VerdictCard, type Choice } from "./VerdictCard/VerdictCard"
import { PAIR_COLOURS } from "./pair-colours"

export function Review({ outlines }: { outlines: Outlines }) {
  const paint = usePaint()
  const set = reviewSet.value
  const cases = useMemo(() => reviewCases(set, CATALOGUE, outlines), [set, outlines])
  const judged = new Set(
    scoreVerdicts.value
      .filter((verdict) => verdict.version === REVIEW_VERSION && verdict.set === set)
      .map((verdict) => verdict.index)
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
  const setChoice = (next: Choice | undefined) => {
    chosen.current = next
    setChoiceState(next)
  }
  const [shouldBe, setShouldBe] = useState("")
  const [note, setNote] = useState("")
  /** In a pair, the one guess shown alone: pinned by a click, or under the mouse. */
  const [pinned, setPinned] = useState<0 | 1 | undefined>(undefined)
  const [hovered, setHovered] = useState<0 | 1 | undefined>(undefined)
  const reviewCase = cases[index]!
  const question = reviewCase.question
  const answer = reviewCase.answer
  const guesses = reviewCase.type === ReviewCaseType.SINGLE ? [reviewCase.guess] : reviewCase.guesses
  const kernel = kernelById(soloKernelId.value)
  const scores = useMemo(
    () => guesses.map((guess) => scoreGuess(answer, guess.layer, kernel).score),
    [reviewCase, kernel.id]
  )

  const frame = (features: GeoJSON.FeatureCollection) => {
    if (answer.type === AnswerType.AREA)
      paint.gameMap.fitRegionAndPaint(answer.centre, answer.polygons, features, answer.tolerance)
    else paint.gameMap.fitAnswerAndPaint(answer.at, features, answer.tolerance)
  }
  const showPair = (only: 0 | 1 | undefined) =>
    paint.showLayers(
      guesses.flatMap((guess, i) =>
        only === undefined || only === i ? [{ layer: guess.layer, colour: PAIR_COLOURS[i]! }] : []
      )
    )

  useEffect(() => {
    paint.reset(answer.tolerance)
    paint.enabled.value = false
    paint.gameMap.setDetail(RevealDetail.REVEAL)
    if (answer.type === AnswerType.AREA) paint.gameMap.showRegionReveal(answer.polygons)
    else paint.gameMap.showReveal(answer.at)
    if (reviewCase.type === ReviewCaseType.SINGLE) {
      paint.restore(reviewCase.guess.layer.toRecord())
      paint.showOwn()
      frame(paint.layer.toGeoJSON())
    } else frame(showPair(undefined))
    setChoice(undefined)
    setShouldBe("")
    setNote("")
    setPinned(undefined)
    setHovered(undefined)
  }, [reviewCase])

  // Not reframed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (reviewCase.type === ReviewCaseType.PAIR) showPair(hovered ?? pinned)
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
    if (reviewCase.type === ReviewCaseType.SINGLE) {
      const target = Number(shouldBe)
      entry = {
        ...base,
        guess: reviewCase.guess.type,
        verdict: choice,
        ...(shouldBe.trim() !== "" && Number.isFinite(target) ? { shouldBe: target } : {}),
        case: await guessCase(question, answer, reviewCase.guess.layer, kernel)
      }
    } else {
      const [first, second] = reviewCase.guesses
      entry = {
        ...base,
        pair: true,
        guesses: [first.type, second.type],
        prefer: choice,
        cases: [
          await guessCase(question, answer, first.layer, kernel),
          await guessCase(question, answer, second.layer, kernel)
        ]
      }
    }
    scoreVerdicts.value = [
      ...scoreVerdicts.value.filter(
        (verdict) => verdict.version !== REVIEW_VERSION || verdict.set !== set || verdict.index !== index
      ),
      entry
    ]
    judged.add(index)
    setIndex(firstOpen(index + 1) ?? index)
  }
  const skip = () => setIndex((index + 1) % cases.length)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement) return
      if (event.key === "Enter") {
        event.preventDefault()
        void submit()
        return
      }
      if (isTyping(event.target ?? undefined)) return
      const digit = Number(event.key)
      if (digit >= 1 && digit <= 5) setChoice((digit - 3) as Choice)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <Hud reveal>
      <HudTop>
        <HudHeader home round={index + 1} total={cases.length} right={<HeaderNote nowrap>Set {set}</HeaderNote>} />
        <QuestionCard question={questionView(question)} hud={CardPlace.REVEAL} credit>
          <Answer label={question.label} wiki={question.wiki} />
        </QuestionCard>
        {reviewCase.type === ReviewCaseType.SINGLE && (
          <ScoreCard
            score={Math.round(scores[0]!)}
            label={answer.type === AnswerType.AREA ? "scored on shape and nearness" : `scored with ${kernel.label}`}
            testIds={{ score: scoreReviewTestIds.score }}
          />
        )}
      </HudTop>
      <HudRight>
        <VerdictCard
          reviewCase={reviewCase}
          scores={scores}
          choice={choice}
          onChoose={setChoice}
          shouldBe={shouldBe}
          onShouldBe={setShouldBe}
          note={note}
          onNote={setNote}
          pinned={pinned}
          onPin={setPinned}
          onHover={setHovered}
          judged={judged.size}
          total={cases.length}
          set={set}
        />
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
