/** Whether a revealed answer is a point or an area, and an area's outline once it has loaded. */
import type { OutlineId } from "@whereabouts/shared/ids"
import { AnswerType, type Outline, type Outlines } from "@whereabouts/shared/questions"

export enum RevealedShapeType {
  POINT = "POINT",
  AREA = "AREA"
}

interface PointShape {
  type: RevealedShapeType.POINT
}

interface AreaShape {
  type: RevealedShapeType.AREA
  /** A country's (or island's, lake's…) outline; undefined until the outlines load. */
  outline: Outline | undefined
  /** Land in dispute beside it, which is not scored; undefined if none, or until the outlines load. */
  disputed: Outline | undefined
}

export type RevealedShape = PointShape | AreaShape

type ShapedAnswer = { type: AnswerType.POINT } | { type: AnswerType.AREA; outline: OutlineId; disputed?: OutlineId }

/** `outlines`: undefined until they load. */
export const revealedShape = (answer: ShapedAnswer, outlines: Outlines | undefined): RevealedShape =>
  answer.type === AnswerType.AREA
    ? {
        type: RevealedShapeType.AREA,
        outline: outlines?.get(answer.outline),
        disputed: answer.disputed && outlines?.get(answer.disputed)
      }
    : { type: RevealedShapeType.POINT }
