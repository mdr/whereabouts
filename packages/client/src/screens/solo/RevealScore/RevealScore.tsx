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
import s from "./RevealScore.module.css"

/** The revealed score's parts, and what other answers or kernels would have scored. */
export function RevealScore({
  a,
  kernel,
  parts,
  painted,
  hover
}: {
  a: ScoredAnswer
  kernel: ChoosableKernel
  parts: AnswerParts
  /** Undefined for a pass. */
  painted: Distribution | undefined
  hover: ReadonlySignal<LatLon | undefined>
}) {
  const h = hover.value
  // "What if the answer were here" only means something for a point answer.
  let hoverText: string | undefined =
    a.type === AnswerType.AREA ? undefined : "Move the mouse over the map to see the score for other answers."
  if (h && a.type === AnswerType.POINT && painted) {
    const A = similarityToAnswer(painted, toXyz(h), a.tolerance, kernel)
    const s = parts.type === AnswerType.POINT ? scoreFromParts(A, parts.B) : 0
    const d = greatCircleDistance(h, a.at)
    hoverText = `If the answer were here: ${Math.round(s)} · ${formatDistance(d)} from the real answer (${(d / a.tolerance).toFixed(1)} tolerances)`
  }
  return (
    <Card title="Score">
      <PartsLine parts={parts} />
      {hoverText && <div class={s.hoverScore}>{hoverText}</div>}
      {a.type === AnswerType.POINT && painted && <KernelComparison painted={painted} a={a} active={kernel.id} />}
    </Card>
  )
}
