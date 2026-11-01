import { KERNELS, type Distribution, type KernelId } from "@whereabouts/shared/scoring/scoring"
import { scoreAnswer, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { cx } from "../../ui/cx"
import kit from "../../ui/kit.module.css"

export const KernelComparison = ({
  painted,
  answer,
  active
}: {
  painted: Distribution
  answer: ScoredAnswer
  active: KernelId
}) => (
  <ul class={cx(kit.results, kit.compare)}>
    {KERNELS.map((kernel) => (
      <li key={kernel.id}>
        <span>
          {kernel.label}
          {kernel.id === active ? " ◀" : ""}
        </span>
        <span>{Math.round(scoreAnswer(painted, answer, kernel).score)}</span>
      </li>
    ))}
  </ul>
)
