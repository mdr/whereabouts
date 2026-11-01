import { outlineOf, type QuestionView } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { areaNoun } from "../../../round/round"
import { CardPlace, QuestionCard } from "../question/QuestionCard/QuestionCard"
import { Icon } from "../../icons"
import { cx } from "../../cx"
import kit from "../../kit.module.css"
import styles from "./RoundPrompt.module.css"

/** The question while painting, with how to answer it. */
export const RoundPrompt = ({ question }: { question: QuestionView }) => {
  const area = outlineOf(question.answer) !== undefined
  return (
    <QuestionCard question={question} hud={CardPlace.PAINTING} foldable>
      {question.type === QuestionType.FLAG ? (
        <AnswerMode area={area} />
      ) : (
        area && <AreaInstruction noun={areaNoun(question)} />
      )}
    </QuestionCard>
  )
}

/** Under a "Paint the whole of …" question: what to cover. */
const AreaInstruction = ({ noun }: { noun: string }) => (
  <p class={cx(kit.hint, styles.regionHint)}>Cover the whole {noun}: its shape counts.</p>
)

/**
 * How to answer a flag round, big and plain, since the two are painted so
 * differently: cover the whole country, or mark where a small one is.
 */
const AnswerMode = ({ area }: { area: boolean }) =>
  area ? (
    <div class={cx(styles.answerMode, styles.area)}>
      <Icon name="brush" size={18} />
      <div>
        <b>Paint the whole country</b>
        <span>Its shape counts: cover all of it, and nothing else.</span>
      </div>
    </div>
  ) : (
    <div class={cx(styles.answerMode, styles.point)}>
      <Icon name="pin" size={18} />
      <div>
        <b>Paint where it is</b>
        <span>A place, not a shape: the tighter your paint, the surer you are.</span>
      </div>
    </div>
  )
