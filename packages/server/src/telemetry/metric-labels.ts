import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { QuestionType } from "@whereabouts/shared/questions"

/** How a game ended. */
export enum GameOutcome {
  FINISHED = "FINISHED",
  ENDED_EARLY = "ENDED_EARLY"
}

/** Whether a player let into a game had a seat in it already. */
export enum JoinKind {
  NEW = "NEW",
  REJOINED = "REJOINED"
}

/** Which limit made the client errors route leave a report out of the log. */
export enum ClientErrorLimit {
  PER_ADDRESS = "PER_ADDRESS",
  GLOBAL = "GLOBAL"
}

export const GAME_OUTCOME_LABEL: Record<GameOutcome, string> = {
  [GameOutcome.FINISHED]: "finished",
  [GameOutcome.ENDED_EARLY]: "ended_early"
}

export const JOIN_KIND_LABEL: Record<JoinKind, string> = {
  [JoinKind.NEW]: "new",
  [JoinKind.REJOINED]: "rejoined"
}

export const CLIENT_ERROR_LIMIT_LABEL: Record<ClientErrorLimit, string> = {
  [ClientErrorLimit.PER_ADDRESS]: "per_address",
  [ClientErrorLimit.GLOBAL]: "global"
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  [QuestionType.LANDMARK]: "landmark",
  [QuestionType.PLACE]: "place",
  [QuestionType.COUNTRY]: "country",
  [QuestionType.FLAG]: "flag",
  [QuestionType.FEATURE]: "feature",
  [QuestionType.STATE]: "state"
}

export const CLIENT_ERROR_KIND_LABEL: Record<ClientErrorKind, string> = {
  [ClientErrorKind.MAP_LOAD]: "map_load",
  [ClientErrorKind.OUTLINES_LOAD]: "outlines_load",
  [ClientErrorKind.DATA_LOAD]: "data_load",
  [ClientErrorKind.SOUND_LOAD]: "sound_load",
  [ClientErrorKind.VR_LOAD]: "vr_load",
  [ClientErrorKind.VR_CODE]: "vr_code",
  [ClientErrorKind.WEBGL]: "webgl",
  [ClientErrorKind.UNCAUGHT]: "uncaught",
  [ClientErrorKind.UNHANDLED_REJECTION]: "unhandled_rejection"
}
