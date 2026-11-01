import type { ReadonlySignal } from "@preact/signals"
import {
  scoreFromParts,
  similarityToAnswer,
  type ChoosableKernel,
  type Distribution
} from "@whereabouts/shared/scoring/scoring"
import type { AnswerParts, ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType } from "@whereabouts/shared/questions"
import { greatCircleDistance, toXyz, type LatLon } from "@whereabouts/shared/geo"
import { Card } from "../../../ui/Card/Card"
import { formatDistance } from "../../../ui/format"
import { KernelComparison } from "../KernelComparison"
import { PartsLine } from "../PartsLine"
import styles from "./RevealScore.module.css"

/** The revealed score's parts, and what other answers or kernels would have scored. */
export const RevealScore = ({
  answer,
  kernel,
  parts,
  painted,
  hover
}: {
  answer: ScoredAnswer
  kernel: ChoosableKernel
  parts: AnswerParts
  /** Undefined for a pass. */
  painted: Distribution | undefined
  hover: ReadonlySignal<LatLon | undefined>
}) => {
  const hovered = hover.value
  // "What if the answer were here" only means something for a point answer.
  let hoverText: string | undefined =
    answer.type === AnswerType.AREA ? undefined : "Move the mouse over the map to see the score for other answers."
  if (hovered && answer.type === AnswerType.POINT && painted) {
    const A = similarityToAnswer(painted, toXyz(hovered), answer.tolerance, kernel)
    const score = parts.type === AnswerType.POINT ? scoreFromParts(A, parts.B) : 0
    const distance = greatCircleDistance(hovered, answer.at)
    hoverText = `If the answer were here: ${Math.round(score)} · ${formatDistance(distance)} from the real answer (${(distance / answer.tolerance).toFixed(1)} tolerances)`
  }
  return (
    <Card title="Score">
      <PartsLine parts={parts} />
      {hoverText && <div class={styles.hoverScore}>{hoverText}</div>}
      {answer.type === AnswerType.POINT && painted && (
        <KernelComparison painted={painted} answer={answer} active={kernel.id} />
      )}
    </Card>
  )
}
