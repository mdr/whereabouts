import { KERNELS, type Distribution, type KernelId } from "@whereabouts/shared/scoring/scoring"
import { scoreAnswer, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { cx } from "../../ui/cx"
import kit from "../../ui/kit.module.css"

export function KernelComparison({ dist, a, active }: { dist: Distribution; a: ScoredAnswer; active: KernelId }) {
  return (
    <ul class={cx(kit.results, kit.compare)}>
      {KERNELS.map((k) => (
        <li key={k.id}>
          <span>
            {k.label}
            {k.id === active ? " ◀" : ""}
          </span>
          <span>{Math.round(scoreAnswer(dist, a, k).score)}</span>
        </li>
      ))}
    </ul>
  )
}
