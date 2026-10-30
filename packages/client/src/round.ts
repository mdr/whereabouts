/**
 * What a round does with the map the same way in practice and in a game:
 * starting it, its detail, the Fill tool, the hint's band, and showing and
 * framing the answer at the reveal.
 */
import { useEffect } from "preact/hooks"
import type { HintBand } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import type { MapDetail, QuestionView } from "@whereabouts/shared/protocol"
import type { GameMap } from "./map"
import type { PaintController } from "./paint-controller"
import { useFillTool } from "./fill"
import { startOnPan } from "./settings"
import { sound } from "./sound"

/** The answer as the reveal shows it. */
export interface RevealedAnswer {
  label: string
  wiki?: string
  answer: LatLon
  /** A country's (or island's, lake's…) outline; undefined for a place, or until the outlines load. */
  outline?: number[][][][]
  /** The answer's photo, on a round that showed none while guessing. */
  photo?: string
}

export function useRoundMap(
  paint: PaintController,
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
): void {
  useEffect(() => {
    if (!painting || !question) return
    paint.reset(question.toleranceKm)
    start?.()
    paint.gameMap.clearReveal()
    paint.gameMap.resetView()
    paint.tool.value = startOnPan.value ? "pan" : "paint"
  }, [round, painting])

  // The Fill tool, for a country on the Political map; on through the
  // reveal, so a run of country rounds keeps the tool chosen.
  useFillTool(
    paint,
    detail === "political" &&
      question?.topic === undefined &&
      (question?.regionId !== undefined || question?.flag !== undefined)
  )

  // The reveal shows everything, since borders, place names, rivers and
  // relief help make sense of the answer.
  const stateRound = question?.topic === "state"
  useEffect(() => {
    paint.gameMap.setDetail(reveal ? "reveal" : detail)
    paint.gameMap.setStateReveal(reveal && stateRound)
  }, [reveal, detail, stateRound])

  useEffect(() => {
    paint.gameMap.setHint(hint)
    return () => paint.gameMap.setHint(undefined)
  }, [hint?.axis, hint?.from, hint?.to])
}

/** Whether Done now is a pass (nothing painted), clucking if so. */
export function announcePass(paint: PaintController): boolean {
  const pass = paint.layer.isEmpty
  if (pass) sound.play("chicken")
  return pass
}

export function showAnswer(
  gameMap: Pick<GameMap, "showReveal" | "showRegionReveal" | "clearReveal">,
  question: QuestionView,
  a: RevealedAnswer
): void {
  if (a.outline) gameMap.showRegionReveal(a.outline)
  else if (question.regionId === undefined) gameMap.showReveal(a.answer, question.toleranceKm)
  // A country's outline still loading.
  else gameMap.clearReveal()
}

/** Frame the answer and the paint shown together, wherever the paint went. */
export function frameReveal(
  gameMap: Pick<GameMap, "fitAnswerAndPaint" | "fitRegionAndPaint">,
  question: QuestionView,
  a: RevealedAnswer,
  paint: GeoJSON.FeatureCollection
): void {
  if (a.outline) gameMap.fitRegionAndPaint(a.answer, a.outline, paint, question.toleranceKm)
  else gameMap.fitAnswerAndPaint(a.answer, paint, question.toleranceKm)
}
