/**
 * Prizes and booby prizes for the results screen: a few picked at random from
 * those someone earned, spread across the players where possible.
 */
import type { PlayerId } from "../ids.ts"
import { shuffle } from "../questions.ts"
import { candidateAwards } from "./award-rules.ts"
import type { PlayerFacts, Award } from "./player-facts.ts"
import type { Candidate } from "./rules/rule-kit.ts"

/** Two booby prizes to every real one, while both last. */
const interleave = (candidates: Candidate[]): Candidate[] => {
  const boobies = candidates.filter((candidate) => candidate.booby)
  const prizes = candidates.filter((candidate) => !candidate.booby)
  const ordered: Candidate[] = []
  while (boobies.length + prizes.length > 0) {
    ordered.push(...boobies.splice(0, 2), ...prizes.splice(0, 1))
  }
  return ordered
}

const hasAny = (set: Set<PlayerId>, ids: PlayerId[]) => ids.some((id) => set.has(id))

/** Up to `max`, one each first, then seconds if there are fewer players than awards. */
const spread = (ordered: Candidate[], max: number): Candidate[] => {
  const picked: Candidate[] = []
  const awarded = new Set<PlayerId>()
  for (const firstPass of [true, false]) {
    for (const candidate of ordered) {
      if (picked.length >= max) break
      if (picked.includes(candidate) || (firstPass && hasAny(awarded, candidate.playerIds))) continue
      picked.push(candidate)
      for (const id of candidate.playerIds) awarded.add(id)
    }
  }
  return picked
}

export const pickAwards = (players: PlayerFacts[], seed: number): Award[] => {
  const ordered = interleave(shuffle(candidateAwards(players), seed))
  const max = Math.min(5, Math.max(3, players.length))
  return spread(ordered, max).map(({ booby: _, ...award }) => award)
}
