/** The cards and buttons of a round that practice and a game share. */
import { PASS_SCORE } from "@whereabouts/shared/scoring"
import type { Fact } from "@whereabouts/shared/facts"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { QuestionView } from "@whereabouts/shared/protocol"
import type { Topic } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "../round"
import { Answer, FactLine, QuestionCard } from "./bits"
import { PaintedIn } from "./FlagReveal"
import { usePaint } from "./MapView"
import { Icon } from "./icons"

/** The question while painting, with how to answer it. */
export function RoundPrompt({
  question,
  countryFlag,
  credit
}: {
  question: QuestionView
  countryFlag: FlagCode | undefined
  credit?: boolean
}) {
  const area = question.regionId !== undefined
  return (
    <QuestionCard q={question} countryFlag={countryFlag} credit={credit} foldable>
      {question.flag ? <AnswerMode area={area} /> : area && <RegionHint topic={question.topic} />}
    </QuestionCard>
  )
}

/** Under a "Paint the whole of …" question: what to cover. */
function RegionHint({ topic }: { topic?: Topic }) {
  return <p class="hint region-hint">Cover the whole {topic ?? "country"}: its shape counts.</p>
}

/**
 * How to answer a flag round, big and plain, since the two are painted so
 * differently: cover the whole country, or mark where a small one is.
 */
function AnswerMode({ area }: { area: boolean }) {
  return area ? (
    <div class="answer-mode area">
      <Icon name="brush" size={18} />
      <div>
        <b>Paint the whole country</b>
        <span>Its shape counts: cover all of it, and nothing else.</span>
      </div>
    </div>
  ) : (
    <div class="answer-mode point">
      <Icon name="pin" size={18} />
      <div>
        <b>Paint where it is</b>
        <span>A place, not a shape: the tighter your paint, the surer you are.</span>
      </div>
    </div>
  )
}

/** Submit or Done; with nothing painted, Pass. */
export function DoneButton({
  label,
  onDone,
  paintedTitle,
  testId
}: {
  label: string
  onDone: () => void
  paintedTitle?: string
  testId: string
}) {
  const paint = usePaint()
  const empty = paint.isEmpty.value
  return (
    <button
      class="primary"
      onClick={onDone}
      title={
        empty
          ? `No idea? Passing scores ${PASS_SCORE.score}. Even painting a wide, vague area scores better on average.`
          : paintedTitle
      }
      data-testid={testId}
    >
      <Icon name="check" /> {empty ? "Pass" : label}
    </button>
  )
}

/** The reveal's question card, now with the answer, and your score. */
export function RevealCards({
  question,
  countryFlag,
  revealed,
  fact,
  you,
  playedLabel,
  where,
  testIds
}: {
  question: QuestionView
  countryFlag: FlagCode | undefined
  revealed: RevealedAnswer
  fact: Fact | undefined
  /** Undefined when you sat the round out. */
  you: { score: number; passed: boolean } | undefined
  /** Under a score that was not a pass. */
  playedLabel: string
  /** A flag round: the country most of your paint was in. */
  where: PaintedCountry | undefined
  testIds: { scoreCard?: string; score?: string }
}) {
  return (
    <>
      <QuestionCard q={question} credit countryFlag={countryFlag} photo={revealed.photo} foldable startFolded>
        <Answer label={revealed.label} wiki={revealed.wiki} />
        <FactLine fact={fact} />
      </QuestionCard>
      <div class="card score" data-testid={testIds.scoreCard}>
        <div class="big" data-testid={testIds.score}>
          {you ? Math.round(you.score) : "—"}
        </div>
        <div class="label">{you ? (you.passed ? "you passed this round" : playedLabel) : "you sat this one out"}</div>
        {where && (
          <div class="fit">
            Your paint: <PaintedIn where={where} answer={question.flag} whose="your" />
          </div>
        )}
      </div>
    </>
  )
}
