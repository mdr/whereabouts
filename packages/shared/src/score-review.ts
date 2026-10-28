/**
 * Made-up guesses at real questions, for the score review (a hidden dev
 * screen) where a playtester says whether each score is fair. Each is one
 * kind of guess the scoring has to weigh: on the answer, near it, far off,
 * spread wide, or hedged between places. Seeded by the set number, so
 * everyone reviewing a set sees the same guesses.
 */
import { EARTH_RADIUS_KM, type LatLon } from "./geo.ts"
import { seededUnit } from "./hints.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { QUESTIONS, shuffle, type Question } from "./questions.ts"

export const GUESS_KINDS = ["bullseye", "close", "near-miss", "far-miss", "wide", "hedge", "scattered"] as const
export type GuessKind = (typeof GUESS_KINDS)[number]

export const REVIEW_SET_SIZE = 28
/** The practice default: what the guesses would score with. */
export const REVIEW_FLOOR = 0.05

export interface ReviewCase {
  question: Question
  guess: GuessKind
  layer: PaintLayer
}

/** Blobs as [distance from the answer, radius] in tolerances, and strength. */
interface Blob {
  at: number
  radius: number
  strength: number
}

export function reviewCases(set: number): ReviewCase[] {
  const questions = shuffle(QUESTIONS, set * 7919 + 1).slice(0, REVIEW_SET_SIZE)
  const kinds = shuffle(
    questions.map((_, i) => GUESS_KINDS[i % GUESS_KINDS.length]!),
    set * 104729 + 3
  )
  return questions.map((question, i) => {
    let n = 0
    const rnd = () => seededUnit(set, i, n++)
    const between = (lo: number, hi: number) => lo + (hi - lo) * rnd()
    const guess = kinds[i]!
    const layer = new PaintLayer(resolutionForTolerance(question.toleranceKm))
    for (const b of blobs(guess, between, rnd)) {
      const at = offset(question.answer, b.at * question.toleranceKm, rnd() * 360)
      layer.stamp(at, b.radius * question.toleranceKm, b.strength)
    }
    return { question, guess, layer }
  })
}

function blobs(kind: GuessKind, between: (lo: number, hi: number) => number, rnd: () => number): Blob[] {
  switch (kind) {
    case "bullseye":
      return [{ at: between(0, 0.3), radius: between(0.5, 1), strength: 1 }]
    case "close":
      return [{ at: between(0.5, 1.5), radius: between(0.4, 0.8), strength: 1 }]
    case "near-miss":
      return [{ at: between(2, 4), radius: between(0.5, 1.5), strength: 1 }]
    case "far-miss":
      return [{ at: between(6, 20), radius: between(0.5, 2), strength: 1 }]
    case "wide":
      return [{ at: between(0, 3), radius: between(4, 10), strength: 1 }]
    case "hedge": {
      const share = [0.3, 0.5, 0.7][Math.floor(rnd() * 3)]!
      return [
        { at: between(0, 1), radius: 1, strength: share },
        { at: between(4, 10), radius: 1, strength: 1 - share }
      ]
    }
    case "scattered":
      return Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({
        at: between(0, 12),
        radius: between(0.5, 1.5),
        strength: between(0.5, 1)
      }))
  }
}

/** The point `km` from `from` on a bearing, in degrees clockwise from north. */
function offset(from: LatLon, km: number, bearingDeg: number): LatLon {
  const d = km / EARTH_RADIUS_KM
  const b = (bearingDeg * Math.PI) / 180
  const lat1 = (from.lat * Math.PI) / 180
  const lon1 = (from.lon * Math.PI) / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lon2 =
    lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: (lat2 * 180) / Math.PI, lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180 }
}

/** A playtester's verdict on one score, as the review exports it (one JSON object a line). */
export interface ScoreVerdict {
  set: number
  index: number
  guess: GuessKind
  /** Much too low (-2) to much too high (2). */
  verdict: -2 | -1 | 0 | 1 | 2
  /** What they think it should have scored. */
  shouldBe?: number
  note?: string
  /** When, as an ISO date. */
  at: string
  /** The question, paint, kernel and the score shown, as encodeCase writes them. */
  case: string
}
