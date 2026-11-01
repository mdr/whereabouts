import { buildDistribution, kernelById, type Distribution, type KernelId } from "@whereabouts/shared/scoring/scoring"
import { regionFit, scoreAnswer, type Area, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType, type Question } from "@whereabouts/shared/questions"
import { usePaint } from "../../../ui/map/MapView/MapView"
import { Card } from "../../../ui/Card/Card"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import scoreStyles from "../../../ui/round/Score.module.css"
import { KernelComparison } from "../KernelComparison"
import { PartsLine } from "../PartsLine"
import styles from "./LiveScore.module.css"

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

export function LiveScore({
  question,
  answer,
  kernelId
}: {
  question: Question
  answer: ScoredAnswer
  kernelId: KernelId
}) {
  const paint = usePaint()
  const painted = buildDistribution(paint.settledCells.value, paint.floor.value)
  const { score, parts } = scoreAnswer(painted, answer, kernelById(kernelId))
  return (
    <Card title="Live score">
      <p class={kit.hint} style={{ margin: "0 0 6px" }}>
        Answer: {question.label}, {answer.type === AnswerType.AREA ? "outlined" : "marked"} on the map.
      </p>
      <div class={scoreStyles.score}>
        <div class={scoreStyles.big}>{Math.round(score)}</div>
        <PartsLine parts={parts} />
      </div>
      {answer.type === AnswerType.AREA && paint.settledCells.value.length > 0 && (
        <RegionFitFacts painted={painted} answer={answer} label={question.label} />
      )}
      {answer.type === AnswerType.POINT && <KernelComparison painted={painted} answer={answer} active={kernelId} />}
    </Card>
  )
}

/** Where the paint is against the country (the world floor left out). */
function RegionFitFacts({ painted, answer, label }: { painted: Distribution; answer: Area; label: string }) {
  const { coverage, precision } = regionFit(painted, answer)
  return (
    <dl class={cx(kit.facts, styles.regionFit)}>
      <div>
        <dt>Paint on {label}</dt>
        <dd>{percent(precision)}</dd>
      </div>
      <div>
        <dt>Paint off it</dt>
        <dd>{percent(1 - precision)}</dd>
      </div>
      <div>
        <dt>{label} covered</dt>
        <dd>{percent(coverage)}</dd>
      </div>
    </dl>
  )
}
