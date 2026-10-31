/** Picking a game's rounds from the catalogue. */
import { poolOf } from "./catalogue.ts"
import type { PlaceId } from "./ids.ts"
import type { GameConfig } from "./protocol.ts"
import { QUESTION_TYPES, shuffle, type Outlines, type Question } from "./questions.ts"
import { roundsOverlap, scoredAnswer } from "./regions.ts"

/** Everything a game picks its rounds from. */
export interface QuestionBank {
  catalogue: readonly Question[]
  /** Every area answer's outline. */
  outlines: Outlines
}

/** One per question type, so each type's pool is shuffled differently. */
const SALTS = [0x9e3779b9, 0x7f4a7c15, 0x2545f491, 0x68e31da4, 0x1b873593, 0x85ebca6b]

/**
 * The rounds' questions, as many of each type as the mix asks while they
 * last, in a shuffled order: never a place already asked another way
 * ("Where is Monaco?" and Monaco's flag, say), and where the pools allow,
 * none overlapping a round already chosen. The same for the same seed.
 */
export function pickRounds(
  { catalogue, outlines }: QuestionBank,
  { mix, mapDetail }: Pick<GameConfig, "mix" | "mapDetail">,
  seed: number
): Question[] {
  const chosen: Question[] = []
  const asked = new Set<PlaceId>()
  const answer = (q: Question) => scoredAnswer(q.answer, outlines)
  QUESTION_TYPES.forEach((type, i) => {
    const count = mix[type]
    if (count === 0) return
    const candidates = shuffle(poolOf(catalogue, [type], mapDetail), seed ^ SALTS[i]!).filter(
      (q) => !asked.has(q.place)
    )
    for (let n = 0; n < count && candidates.length > 0; n++) {
      const apart = candidates.findIndex((q) => !chosen.some((c) => roundsOverlap(answer(c), answer(q))))
      const q = candidates.splice(Math.max(apart, 0), 1)[0]!
      chosen.push(q)
      asked.add(q.place)
    }
  })
  return shuffle(chosen, seed ^ 0x5bd1e995)
}
