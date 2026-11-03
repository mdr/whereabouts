/**
 * The data a game's rounds and reveals need, by its mix: the facts, the
 * outlines for area rounds and the borders that flag rounds name countries
 * by. Asked for from the lobby on, once `wanted`, so round 1 need not wait
 * for them.
 */
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../net/client-error/report-client-error"
import { useEffect } from "preact/hooks"
import { AREA_TYPES } from "@whereabouts/shared/catalogue/catalogue"
import type { QuestionMix } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import type { Borders } from "@whereabouts/shared/borders"
import { useBorders } from "./borders"
import { loadFacts } from "./facts"
import { useOutlines } from "./outlines"

export const useGameData = (mix: QuestionMix, wanted = true): Borders | undefined => {
  useEffect(() => {
    if (wanted)
      loadFacts().catch((error: unknown) => {
        console.warn("could not load the facts", error)
        reportClientError(ClientErrorKind.DATA_LOAD, error)
      })
  }, [wanted])
  useOutlines(wanted && AREA_TYPES.some((type) => mix[type] > 0))
  return useBorders(wanted && mix[QuestionType.FLAG] > 0)
}
