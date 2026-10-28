import type { Question } from "./questions.ts"
import type { RegionQuestion } from "./regions.ts"
import photosJson from "../photos.json" with { type: "json" }

/**
 * A photo of each answer for the reveal of a round that shows none while
 * guessing (photos.json): a Wikimedia Commons file, by the answer's
 * Wikipedia article. Chosen to show a famous landmark where there is one.
 */
export const REVEAL_PHOTOS: Readonly<Record<string, string>> = photosJson

/**
 * The photo for a round's reveal: none on a photo round, which has its own,
 * or a country or flag round, which shows the flag.
 */
export function revealPhoto(q: Question | RegionQuestion): string | undefined {
  if (q.kind === "photo" || q.flag || q.wiki === undefined) return undefined
  if (q.kind === "region" && q.topic === undefined) return undefined
  return REVEAL_PHOTOS[q.wiki]
}
