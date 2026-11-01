/**
 * Prizes and booby prizes for the results screen: a few picked at random from
 * those someone earned, spread across the players where possible.
 */
import type { PlayerId } from "../ids.ts"
import type { LatLon } from "../geo.ts"
import type { Km, Ms, SquareKm } from "../units.ts"
import { candidateAwards, type Candidate } from "./award-rules.ts"
import { shuffle } from "../questions.ts"

export enum FactsType {
  PASSED = "PASSED",
  POINT = "POINT",
  AREA = "AREA"
}

interface BaseFacts {
  /** The place's name, for award text, e.g. "Taj Mahal, Agra". */
  label: string
  score: number
  /** From the round's start to locking in; undefined when the clock ran out. */
  lockedAfter: Ms | undefined
  roundLength: Ms
}

interface PassedFacts extends BaseFacts {
  type: FactsType.PASSED
}

/** A guess at a place. */
export interface PointFacts extends BaseFacts {
  type: FactsType.POINT
  /** Painted area. */
  area: SquareKm
  /**
   * Where the paint was strongest, how far that is from the answer, and what
   * spreading it and missing cost in points (see explain.ts).
   */
  point: { spot: LatLon; miss: Km; spread: number; missCost: number; hedged: boolean; tolerance: Km }
}

/** A guess at a country. */
export interface AreaFacts extends BaseFacts {
  type: FactsType.AREA
  /** Painted area. */
  area: SquareKm
  /** The share of the paint on the country, and whether the paint was all just over the border. */
  region: { precision: number; nextDoor: boolean }
}

/** What one player did in one round, kept for the awards at the end. */
export type RoundFacts = PassedFacts | PointFacts | AreaFacts

export interface PlayerFacts {
  playerId: PlayerId
  /** By round; undefined where the player sat out. */
  rounds: (RoundFacts | undefined)[]
}

export interface Award {
  emoji: string
  title: string
  /** Usually one; two for an award shared by a pair. */
  playerIds: PlayerId[]
  /** The joke, with {0} and {1} where the players' names go. */
  line: string
}

/** Two booby prizes to every real one, while both last. */
function interleave(candidates: Candidate[]): Candidate[] {
  const boobies = candidates.filter((c) => c.booby)
  const prizes = candidates.filter((c) => !c.booby)
  const ordered: Candidate[] = []
  while (boobies.length + prizes.length > 0) {
    ordered.push(...boobies.splice(0, 2), ...prizes.splice(0, 1))
  }
  return ordered
}

const hasAny = (set: Set<PlayerId>, ids: PlayerId[]) => ids.some((id) => set.has(id))

/** Up to `max`, one each first, then seconds if there are fewer players than awards. */
function spread(ordered: Candidate[], max: number): Candidate[] {
  const picked: Candidate[] = []
  const awarded = new Set<PlayerId>()
  for (const firstPass of [true, false]) {
    for (const c of ordered) {
      if (picked.length >= max) break
      if (picked.includes(c) || (firstPass && hasAny(awarded, c.playerIds))) continue
      picked.push(c)
      for (const id of c.playerIds) awarded.add(id)
    }
  }
  return picked
}

export function pickAwards(players: PlayerFacts[], seed: number): Award[] {
  const ordered = interleave(shuffle(candidateAwards(players), seed))
  const max = Math.min(5, Math.max(3, players.length))
  return spread(ordered, max).map(({ booby: _, ...award }) => award)
}
