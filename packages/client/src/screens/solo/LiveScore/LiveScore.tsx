import { buildDistribution, kernelById, type Distribution, type KernelId } from "@whereabouts/shared/scoring/scoring"
import { regionFit, scoreAnswer, type Area, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType, type Question } from "@whereabouts/shared/questions"
import { usePaint } from "../../../ui/map/MapView/MapView"
import { Card } from "../../../ui/Card/Card"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import sc from "../../../ui/round/Score.module.css"
import { KernelComparison } from "../KernelComparison"
import { PartsLine } from "../PartsLine"
import s from "./LiveScore.module.css"

const pct = (x: number) => `${Math.round(x * 100)}%`

export function LiveScore({ q, a, kernelId }: { q: Question; a: ScoredAnswer; kernelId: KernelId }) {
  const paint = usePaint()
  const painted = buildDistribution(paint.settledCells.value, paint.floor.value)
  const { score, parts } = scoreAnswer(painted, a, kernelById(kernelId))
  return (
    <Card title="Live score">
      <p class={kit.hint} style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, {a.type === AnswerType.AREA ? "outlined" : "marked"} on the map.
      </p>
      <div class={sc.score}>
        <div class={sc.big}>{Math.round(score)}</div>
        <PartsLine parts={parts} />
      </div>
      {a.type === AnswerType.AREA && paint.settledCells.value.length > 0 && (
        <RegionFitFacts painted={painted} a={a} label={q.label} />
      )}
      {a.type === AnswerType.POINT && <KernelComparison painted={painted} a={a} active={kernelId} />}
    </Card>
  )
}

/** Where the paint is against the country (the world floor left out). */
function RegionFitFacts({ painted, a, label }: { painted: Distribution; a: Area; label: string }) {
  const { coverage, precision } = regionFit(painted, a)
  return (
    <dl class={cx(kit.facts, s.regionFit)}>
      <div>
        <dt>Paint on {label}</dt>
        <dd>{pct(precision)}</dd>
      </div>
      <div>
        <dt>Paint off it</dt>
        <dd>{pct(1 - precision)}</dd>
      </div>
      <div>
        <dt>{label} covered</dt>
        <dd>{pct(coverage)}</dd>
      </div>
    </dl>
  )
}
