import type { Points } from "@whereabouts/shared/units"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { QuestionView } from "@whereabouts/shared/protocol/views"
import { clueFlag } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "../../round/round"
import { CardPlace, QuestionCard } from "./question/QuestionCard/QuestionCard"
import { Answer } from "./question/Answer/Answer"
import { FactLine } from "./question/FactLine/FactLine"
import { PaintedIn } from "./flag-reveal/PaintedIn/PaintedIn"
import { ScoreCard } from "./ScoreCard"
import scoreStyles from "./Score.module.css"

/** The reveal's question card, now with the answer, and your score. */
export const RevealCards = ({
  question,
  revealed,
  fact,
  you,
  playedLabel,
  where,
  testIds
}: {
  question: QuestionView
  revealed: RevealedAnswer
  fact: Fact | undefined
  /** Undefined when you sat the round out. */
  you: { score: Points; passed: boolean } | undefined
  /** Under a score that was not a pass. */
  playedLabel: string
  /** A flag round: the country most of your paint was in. */
  where: PaintedCountry | undefined
  testIds: { scoreCard?: string; score?: string }
}) => {
  return (
    <>
      <QuestionCard question={question} hud={CardPlace.REVEAL} credit photo={revealed.photo} foldable startFolded>
        <Answer label={revealed.label} wiki={revealed.wiki} />
        <FactLine fact={fact} />
      </QuestionCard>
      <ScoreCard
        score={you ? Math.round(you.score) : "—"}
        label={you ? (you.passed ? "you passed this round" : playedLabel) : "you sat this one out"}
        testIds={testIds}
      >
        {where && (
          <div class={scoreStyles.fit}>
            Your paint: <PaintedIn where={where} answer={clueFlag(question.clue)} whose="your" />
          </div>
        )}
      </ScoreCard>
    </>
  )
}
