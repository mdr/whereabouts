import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { AnswerType, type Outlines } from "@whereabouts/shared/questions"
import { CATALOGUE } from "@whereabouts/shared/catalogue/catalogue"
import { questionView } from "@whereabouts/shared/game/game-views"
import {
  REVIEW_VERSION,
  ReviewCaseType,
  guessCase,
  reviewCases,
  scoreGuess,
  type ScoreVerdict
} from "@whereabouts/shared/scoring/score-review"
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
  const c = cases[index]!
  const q = c.question
  const a = c.answer
  const guesses = c.type === ReviewCaseType.SINGLE ? [c.guess] : c.guesses
  const kernel = kernelById(soloKernelId.value)
  const scores = useMemo(() => guesses.map((g) => scoreGuess(a, g.layer, kernel).score), [c, kernel.id])

  const frame = (fc: GeoJSON.FeatureCollection) => {
    if (a.type === AnswerType.AREA) paint.gameMap.fitRegionAndPaint(a.centre, a.polygons, fc, a.tolerance)
    else paint.gameMap.fitAnswerAndPaint(a.at, fc, a.tolerance)
  }
  const showPair = (only: 0 | 1 | undefined) =>
    paint.showLayers(
      guesses.flatMap((g, i) =>
        only === undefined || only === i ? [{ layer: g.layer, colour: PAIR_COLOURS[i]! }] : []
      )
    )

  useEffect(() => {
    paint.reset(a.tolerance)
    paint.enabled.value = false
    paint.gameMap.setDetail(RevealDetail.REVEAL)
    if (a.type === AnswerType.AREA) paint.gameMap.showRegionReveal(a.polygons)
    else paint.gameMap.showReveal(a.at)
    if (c.type === ReviewCaseType.SINGLE) {
      paint.restore(c.guess.layer.toRecord())
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
    if (c.type === ReviewCaseType.PAIR) showPair(hovered ?? pinned)
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
    if (c.type === ReviewCaseType.SINGLE) {
      const target = Number(shouldBe)
      entry = {
        ...base,
        guess: c.guess.type,
        verdict: choice,
        ...(shouldBe.trim() !== "" && Number.isFinite(target) ? { shouldBe: target } : {}),
        case: await guessCase(q, a, c.guess.layer, kernel)
      }
    } else {
      const [first, second] = c.guesses
      entry = {
        ...base,
        pair: true,
        guesses: [first.type, second.type],
        prefer: choice,
        cases: [await guessCase(q, a, first.layer, kernel), await guessCase(q, a, second.layer, kernel)]
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

  return (
    <Hud reveal>
      <HudTop>
        <HudHeader home round={index + 1} total={cases.length} right={<HeaderNote nowrap>Set {set}</HeaderNote>} />
        <QuestionCard q={questionView(q)} hud={CardPlace.REVEAL} credit>
          <Answer label={q.label} wiki={q.wiki} />
        </QuestionCard>
        {c.type === ReviewCaseType.SINGLE && (
          <ScoreCard
            score={Math.round(scores[0]!)}
            label={a.type === AnswerType.AREA ? "scored on shape and nearness" : `scored with ${kernel.label}`}
            testIds={{ score: scoreReviewTestIds.score }}
          />
        )}
      </HudTop>
      <HudRight>
        <VerdictCard
          c={c}
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
