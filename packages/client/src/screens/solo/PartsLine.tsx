import { SHAPE_WEIGHT, type AnswerParts } from "@whereabouts/shared/scoring/regions"
import { AnswerType } from "@whereabouts/shared/questions"
import { ScoreParts } from "../../ui/round/ScoreParts"
import kit from "../../ui/kit.module.css"

export const PartsLine = ({ parts }: { parts: AnswerParts }) => {
  if (parts.type === AnswerType.POINT) return <ScoreParts A={parts.A} B={parts.B} />
  return (
    <div class={kit.parts}>
      <span>
        shape <b>{Math.round(parts.shape)}</b> × {SHAPE_WEIGHT}
      </span>
      <span>
        nearness <b>{Math.round(parts.nearness)}</b> × {Math.round((1 - SHAPE_WEIGHT) * 10) / 10}
      </span>
    </div>
  )
}
