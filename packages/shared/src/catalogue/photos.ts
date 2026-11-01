import { z } from "zod"
import { CommonsFileSchema, PlaceIdSchema, type CommonsFile, type PlaceId } from "../ids.ts"
import { QuestionType, type Question } from "../questions.ts"
import photosJson from "../../photos.json" with { type: "json" }

/**
 * A photo of each answer for the reveal of a round that shows none while
 * guessing (photos.json): a Wikimedia Commons file, by place. Chosen to show
 * a famous landmark where there is one.
 */
export const REVEAL_PHOTOS: Readonly<Partial<Record<PlaceId, CommonsFile>>> = z
  .partialRecord(PlaceIdSchema, CommonsFileSchema)
  .parse(photosJson)

/** Rounds whose reveal shows a photo: not a landmark, which has its own, nor a country or flag, which shows the flag. */
const WITH_REVEAL_PHOTO: readonly QuestionType[] = [QuestionType.PLACE, QuestionType.FEATURE, QuestionType.STATE]

/** The photo for a round's reveal. */
export function revealPhoto(q: Question): CommonsFile | undefined {
  return WITH_REVEAL_PHOTO.includes(q.type) ? REVEAL_PHOTOS[q.place] : undefined
}
