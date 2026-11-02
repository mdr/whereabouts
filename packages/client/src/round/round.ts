/**
 * What a round does with the map the same way in practice and in a game:
 * starting it, its detail, the Fill tool, the hint's band, and showing and
 * framing the answer at the reveal.
 */
import { useEffect } from "preact/hooks"
import type { HintBand } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import type { CommonsFile, WikiTitle } from "@whereabouts/shared/ids"
import type { MapDetail } from "@whereabouts/shared/protocol/config"
import type { QuestionView } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { FEATURE_TYPE_DISPLAY_INFO } from "../question-types"
import type { DetailLayers } from "../map/detail-layers"
import type { GameMap } from "../map/map"
import type { MapCamera } from "../map/map-camera"
import { RevealDetail, showsBorders } from "../map/shown-detail"
import type { PaintController } from "../paint/paint-controller"
import { useFillTool } from "../paint/fill"
import { startOnPan } from "../settings/settings"
import { Tool } from "../paint/tool"
import { RevealedShapeType, type RevealedShape } from "./revealed-shape"
import { sound } from "../sound/sound"

/** The answer as the reveal shows it. */
export interface RevealedAnswer {
  label: string
  wiki: WikiTitle
  answer: LatLon
  shape: RevealedShape
  /** The answer's photo, on a round that showed none while guessing. */
  photo?: CommonsFile
}

/** What a round needs of the paint and its map. */
export type RoundPaint = Pick<PaintController, "reset" | "tool" | "useFiller" | "offerFill"> & {
  gameMap: Pick<GameMap, "clearReveal" | "setHint"> & {
    detail: Pick<DetailLayers, "setDetail" | "setStateReveal">
    camera: Pick<MapCamera, "resetView">
  }
}

export const useRoundMap = (
  paint: RoundPaint,
  {
    round,
    painting,
    question,
    detail,
    reveal,
    hint,
    start
  }: {
    /** Changes with each new round. */
    round: unknown
    /** The round is being painted: when it turns true, the map starts afresh. */
    painting: boolean
    question: QuestionView | undefined
    /** The map detail chosen for painting. */
    detail: MapDetail
    reveal: boolean
    hint: HintBand | undefined
    /** The screen's own start of a round, just after the paint is reset. */
    start?: () => void
  }
): void => {
  useEffect(() => {
    if (!painting || !question) return
    paint.reset(question.answer.tolerance)
    start?.()
    paint.gameMap.clearReveal()
    paint.gameMap.camera.resetView()
    paint.tool.value = startOnPan.value ? Tool.PAN : Tool.PAINT
  }, [round, painting])

  // The Fill tool, for a country on a map that shows borders; on through
  // the reveal, so a run of country rounds keeps the tool chosen.
  useFillTool(
    paint,
    showsBorders(detail) && (question?.type === QuestionType.COUNTRY || question?.type === QuestionType.FLAG)
  )

  // The reveal shows everything, since borders, place names, rivers and
  // relief help make sense of the answer.
  const stateRound = question?.type === QuestionType.STATE
  useEffect(() => {
    paint.gameMap.detail.setDetail(reveal ? RevealDetail.REVEAL : detail)
    paint.gameMap.detail.setStateReveal(reveal && stateRound)
  }, [reveal, detail, stateRound])

  useEffect(() => {
    paint.gameMap.setHint(hint)
    return () => paint.gameMap.setHint(undefined)
  }, [hint?.axis, hint?.from, hint?.to])
}

/** What an area round asks to cover: "country", "island", "state"… */
export const areaNoun = (question: QuestionView): string => {
  if (question.type === QuestionType.FEATURE) return FEATURE_TYPE_DISPLAY_INFO[question.feature].noun
  return question.type === QuestionType.STATE ? "state" : "country"
}

/** Whether Done now is a pass (nothing painted), clucking if so. */
export const announcePass = (paint: Pick<PaintController, "layer">): boolean => {
  const pass = paint.layer.isEmpty
  if (pass) sound.play("chicken")
  return pass
}

export const showAnswer = (
  gameMap: Pick<GameMap, "showReveal" | "showRegionReveal" | "clearReveal">,
  { answer, shape }: RevealedAnswer
): void => {
  if (shape.type === RevealedShapeType.POINT) gameMap.showReveal(answer)
  else if (shape.outline) gameMap.showRegionReveal(shape.outline)
  else gameMap.clearReveal()
}

/** Frame the answer and the paint shown together, wherever the paint went. */
export const frameReveal = (
  camera: Pick<MapCamera, "fitAnswerAndPaint" | "fitRegionAndPaint">,
  question: QuestionView,
  revealed: RevealedAnswer,
  paint: GeoJSON.FeatureCollection
): void => {
  if (revealed.shape.type === RevealedShapeType.AREA && revealed.shape.outline)
    camera.fitRegionAndPaint(revealed.answer, revealed.shape.outline, paint, question.answer.tolerance)
  else camera.fitAnswerAndPaint(revealed.answer, paint, question.answer.tolerance)
}
