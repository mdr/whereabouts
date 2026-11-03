import { colourCss, type CssColour } from "@whereabouts/shared/colours"
import type { FinalStanding, PlayedRound } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import type { Points, Px } from "@whereabouts/shared/units"
import { FEATURE_TYPE_DISPLAY_INFO, QUESTION_TYPE_DISPLAY_INFO } from "../../question-types"

/** The room the full table needs: the round column, then one column per player. */
const ROUND_COLUMN: Px = 200
const SCORE_COLUMN: Px = 58
/** Players the full table is assumed to fit before the width is known. */
const FITS_BEFORE_MEASURED = 6

/** Whether the full table of everyone's scores fits `width`. */
export const roundsFit = (width: Px | undefined, playerCount: number): boolean =>
  width === undefined ? playerCount <= FITS_BEFORE_MEASURED : width >= ROUND_COLUMN + playerCount * SCORE_COLUMN

/** Each round's top score; -1 for a round nobody scored in. */
export const bestScores = (roundCount: number, standings: FinalStanding[]): Points[] =>
  Array.from({ length: roundCount }, (_, r) =>
    Math.max(-1, ...standings.map((standing) => standing.rounds[r]?.score ?? -1))
  )

/** Those who scored the round's best, in finishing order. */
export const roundWinners = (standings: FinalStanding[], roundIndex: number, best: Points[]): FinalStanding[] =>
  standings.filter((standing) => standing.rounds[roundIndex]?.score === best[roundIndex])

/** An island, lake or sea round says which. */
export const typeName = (round: PlayedRound): string => {
  if (round.type !== QuestionType.FEATURE) return QUESTION_TYPE_DISPLAY_INFO[round.type].roundName
  return FEATURE_TYPE_DISPLAY_INFO[round.feature].roundName
}

/** An award's line in pieces, each player's name in their colour. */
export const awardParts = (
  line: string,
  standings: (FinalStanding | undefined)[]
): { text: string; colour?: CssColour }[] =>
  line
    .split(/(\{\d\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^\{(\d)\}$/.exec(part)
      if (!match) return { text: part }
      const standing = standings[Number(match[1])]
      // Awards and standings come from the same finalists, so a standing is always found.
      return { text: standing?.name ?? "Someone", colour: standing ? colourCss(standing.colour) : undefined }
    })
