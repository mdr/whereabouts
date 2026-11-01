import type { Points } from "@whereabouts/shared/units"
import type { ComponentChildren } from "preact"
import { Card } from "../Card/Card"
import { cx } from "../cx"
import scoreStyles from "./Score.module.css"

/** A reveal's score, under the question; on a phone, at the top of the sheet. */
export const ScoreCard = ({
  score,
  label,
  testIds,
  children
}: {
  score: Points | string
  label: ComponentChildren
  testIds: { scoreCard?: string; score?: string }
  children?: ComponentChildren
}) => {
  return (
    <Card class={cx(scoreStyles.score, scoreStyles.reveal)} data-testid={testIds.scoreCard}>
      <div class={scoreStyles.big} data-testid={testIds.score}>
        {score}
      </div>
      <div class={scoreStyles.label}>{label}</div>
      {children}
    </Card>
  )
}
