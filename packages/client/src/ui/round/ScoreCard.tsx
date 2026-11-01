import type { Points } from "@whereabouts/shared/units"
import type { ComponentChildren } from "preact"
import { Card } from "../Card"
import { cx } from "../cx"
import sc from "./Score.module.css"

/** A reveal's score, under the question; on a phone, at the top of the sheet. */
export function ScoreCard({
  score,
  label,
  testIds,
  children
}: {
  score: Points | string
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
