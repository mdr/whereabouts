/** The cards and buttons of a round that practice and a game share. */
import { PASS_SCORE } from "@whereabouts/shared/scoring"
import type { Fact } from "@whereabouts/shared/facts"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { QuestionView } from "@whereabouts/shared/protocol"
import type { Topic } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "../round"
import type { ComponentChildren } from "preact"
import { Answer, Card, FactLine, QuestionCard } from "./bits"
import { PaintedIn } from "./FlagReveal"
import { usePaint } from "./MapView"
import { Icon } from "./icons"
import { cx } from "./cx"
import kit from "./kit.module.css"
import r from "./Round.module.css"
import sc from "./Score.module.css"

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
    <QuestionCard q={question} hud="painting" countryFlag={countryFlag} credit={credit} foldable>
      {question.flag ? <AnswerMode area={area} /> : area && <RegionHint topic={question.topic} />}
    </QuestionCard>
  )
}

/** Under a "Paint the whole of …" question: what to cover. */
function RegionHint({ topic }: { topic?: Topic }) {
  return <p class={cx(kit.hint, r.regionHint)}>Cover the whole {topic ?? "country"}: its shape counts.</p>
}

/**
 * How to answer a flag round, big and plain, since the two are painted so
 * differently: cover the whole country, or mark where a small one is.
 */
function AnswerMode({ area }: { area: boolean }) {
  return area ? (
    <div class={cx(r.answerMode, r.area)}>
      <Icon name="brush" size={18} />
      <div>
        <b>Paint the whole country</b>
        <span>Its shape counts: cover all of it, and nothing else.</span>
      </div>
    </div>
  ) : (
    <div class={cx(r.answerMode, r.point)}>
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
      <QuestionCard
        q={question}
        hud="reveal"
        credit
        countryFlag={countryFlag}
        photo={revealed.photo}
        foldable
        startFolded
      >
        <Answer label={revealed.label} wiki={revealed.wiki} />
        <FactLine fact={fact} />
      </QuestionCard>
      <ScoreCard
        score={you ? Math.round(you.score) : "—"}
        label={you ? (you.passed ? "you passed this round" : playedLabel) : "you sat this one out"}
        testIds={testIds}
      >
        {where && (
          <div class={sc.fit}>
            Your paint: <PaintedIn where={where} answer={question.flag} whose="your" />
          </div>
        )}
      </ScoreCard>
    </>
  )
}

/** A reveal's score, under the question; on a phone, at the top of the sheet. */
export function ScoreCard({
  score,
  label,
  testIds,
  children
}: {
  score: number | string
  label: ComponentChildren
  testIds: { scoreCard?: string; score?: string }
  children?: ComponentChildren
}) {
  return (
    <Card class={cx(sc.score, sc.reveal)} data-testid={testIds.scoreCard}>
      <div class={sc.big} data-testid={testIds.score}>
        {score}
      </div>
      <div class={sc.label}>{label}</div>
      {children}
    </Card>
  )
}
