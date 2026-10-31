import { QuestionType, type Question } from "./questions.ts"
import photosJson from "../photos.json" with { type: "json" }

/**
 * A photo of each answer for the reveal of a round that shows none while
 * guessing (photos.json): a Wikimedia Commons file, by the answer's
 * Wikipedia article. Chosen to show a famous landmark where there is one.
 */
export const REVEAL_PHOTOS: Readonly<Record<string, string>> = photosJson

/** Rounds whose reveal shows a photo: not a landmark, which has its own, nor a country or flag, which shows the flag. */
const WITH_REVEAL_PHOTO: readonly QuestionType[] = [QuestionType.PLACE, QuestionType.FEATURE, QuestionType.STATE]

/** The photo for a round's reveal. */
export function revealPhoto(q: Question): string | undefined {
  return WITH_REVEAL_PHOTO.includes(q.type) ? REVEAL_PHOTOS[q.wiki] : undefined
}
