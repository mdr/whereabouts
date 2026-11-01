/** Whether a revealed answer is a point or an area, and an area's outline once it has loaded. */
import { AnswerType, type Outline } from "@whereabouts/shared/questions"

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
}

export type RevealedShape = PointShape | AreaShape

export function revealedShape(answer: { type: AnswerType }, outline: Outline | undefined): RevealedShape {
  return answer.type === AnswerType.AREA ? { type: RevealedShapeType.AREA, outline } : { type: RevealedShapeType.POINT }
}
