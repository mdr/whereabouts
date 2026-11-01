import type { LatLon } from "../geo.ts"
import type { PlayerId } from "../ids.ts"
import type { Km, Ms, Points, SquareKm } from "../units.ts"

export enum FactsType {
  PASSED = "PASSED",
  POINT = "POINT",
  AREA = "AREA"
}

interface BaseFacts {
  /** The place's name, for award text, e.g. "Taj Mahal, Agra". */
  label: string
  score: Points
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
  point: { spot: LatLon; miss: Km; spread: Points; missCost: Points; hedged: boolean; tolerance: Km }
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
