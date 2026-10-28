/**
 * Made-up guesses at real questions, for the score review (a hidden dev
 * screen) where a playtester says whether scores are fair. Each guess is
 * one kind the scoring has to weigh: on the answer, near it, far off,
 * spread wide, hedged; for a place painted whole, all of it, part of it,
 * spilling over its edge, or its neighbour. Most cases are one guess to
 * judge on its own; some are two at the same answer, to say which deserves
 * more. Seeded by the set number, so everyone reviewing a set sees the same.
 */
import { EARTH_RADIUS_KM, greatCircleDistance, type LatLon } from "./geo.ts"
import { cellToLatLng } from "./h3.ts"
import { seededUnit } from "./hints.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { shuffle, type Question } from "./questions.ts"
import { regionCells, scoreRegionQuestion, type RegionQuestion } from "./regions.ts"
import { encodeCase, type ScoringCase } from "./scoring-case.ts"
import { buildDistribution, scoreDistribution, type Kernel } from "./scoring.ts"

export const POINT_GUESSES = ["bullseye", "close", "near-miss", "far-miss", "wide", "hedge", "scattered"] as const
export const REGION_GUESSES = ["whole", "part", "spill", "centre", "neighbour", "far-miss", "wide", "hedge"] as const
export type GuessKind = (typeof POINT_GUESSES)[number] | (typeof REGION_GUESSES)[number]

/** The practice default: what the guesses would score with. */
export const REVIEW_FLOOR = 0.05
/** Changes when the same set number would give different cases, so verdicts on the old ones stay apart. */
export const REVIEW_VERSION = 2

export type ReviewQuestion = Question | RegionQuestion

export interface ReviewGuess {
  kind: GuessKind
  layer: PaintLayer
}

export type ReviewCase =
  | { kind: "single"; question: ReviewQuestion; guess: ReviewGuess }
  | { kind: "pair"; question: ReviewQuestion; guesses: [ReviewGuess, ReviewGuess] }

export interface ReviewPools {
  places: Question[]
  countries: RegionQuestion[]
  /** Islands, lakes and seas. */
  features: ReviewQuestion[]
  states: ReviewQuestion[]
}

/** Cases a set holds from each pool: single guesses, then pairs. */
const MIX: [keyof ReviewPools, number, number][] = [
  ["places", 8, 2],
  ["countries", 6, 2],
  ["features", 5, 2],
  ["states", 5, 2]
]

export const REVIEW_SET_SIZE = MIX.reduce((n, [, singles, pairs]) => n + singles + pairs, 0)

export function reviewCases(set: number, pools: ReviewPools): ReviewCase[] {
  const cases: ReviewCase[] = []
  MIX.forEach(([pool, singles, pairs], p) => {
    const questions = shuffle(pools[pool], set * 7919 + p).slice(0, singles + pairs)
    questions.forEach((question, i) => {
      let n = 0
      const rnd = () => seededUnit(set, p, i, n++)
      const kinds = shuffle([...guessesFor(question)], set * 104729 + p * 31 + i)
      if (i < singles) cases.push({ kind: "single", question, guess: paintGuess(question, kinds[0]!, rnd) })
      else
        cases.push({
          kind: "pair",
          question,
          guesses: [paintGuess(question, kinds[0]!, rnd), paintGuess(question, kinds[1]!, rnd)]
        })
    })
  })
  return shuffle(cases, set * 15485863)
}

const guessesFor = (q: ReviewQuestion) => (q.kind === "region" ? REGION_GUESSES : POINT_GUESSES)

/** A guess's score, as practice would give it. */
export function scoreGuess(q: ReviewQuestion, layer: PaintLayer, kernel: Kernel): Pick<ScoringCase, "score" | "parts"> {
  const dist = buildDistribution(layer.toCells(), REVIEW_FLOOR)
  if (q.kind === "region") {
    const { score, shape, nearness } = scoreRegionQuestion(dist, q)
    return { score, parts: { shape, nearness } }
  }
  const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, kernel)
  return { score, parts: { A, B } }
}

/** A guess and its score as a scoring case's text, for the export. */
export function guessCase(q: ReviewQuestion, layer: PaintLayer, kernel: Kernel): Promise<string> {
  return encodeCase({
    question: { kind: q.kind, id: q.id, label: q.label, answer: q.answer, toleranceKm: q.toleranceKm },
    kernel: q.kind === "region" ? "region" : kernel.id,
    floor: REVIEW_FLOOR,
    res: layer.res,
    ...scoreGuess(q, layer, kernel),
    cells: layer.toRecord()
  })
}

function paintGuess(q: ReviewQuestion, kind: GuessKind, rnd: () => number): ReviewGuess {
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd()
  const t = q.toleranceKm
  const layer = new PaintLayer(resolutionForTolerance(t))
  /** A blob `at` tolerances from the answer in a random direction, `radius` tolerances across. */
  const blob = (at: number, radius: number, strength = 1) =>
    layer.stamp(offset(q.answer, at * t, rnd() * 360), radius * t, strength)
  if (q.kind !== "region") {
    pointGuess(kind, blob, between, rnd)
    return { kind, layer }
  }
  // A region's tolerance is a fifth of its radius: R is about its radius.
  const R = 5
  const cells = regionCells(q, layer.res)
  const whole = (v: number) => layer.addCoat(cells, v)
  switch (kind) {
    case "whole":
      whole(1)
      break
    case "part": {
      const [lat, lon] = cellToLatLng(cells[Math.floor(rnd() * cells.length)]!)
      const reach = between(0.4, 0.8) * R * t
      layer.addCoat(
        cells.filter((h) => {
          const [hLat, hLon] = cellToLatLng(h)
          return greatCircleDistance({ lat, lon }, { lat: hLat, lon: hLon }) <= reach
        }),
        1
      )
      break
    }
    case "spill":
      whole(1)
      blob(between(0.8, 1.2) * R, between(0.4, 0.7) * R)
      break
    case "centre":
      blob(0, between(0.4, 0.8) * R)
      break
    case "neighbour":
      blob(between(1.5, 2.5) * R, between(0.5, 1) * R)
      break
    case "far-miss":
      blob(between(6, 15) * R, between(0.5, 1) * R)
      break
    case "wide":
      blob(between(0, 1) * R, between(3, 5) * R)
      break
    case "hedge": {
      const share = [0.3, 0.5, 0.7][Math.floor(rnd() * 3)]!
      whole(share)
      blob(between(4, 8) * R, 0.8 * R, 1 - share)
      break
    }
    default:
      throw new Error(`${kind} is not a guess at a region`)
  }
  return { kind, layer }
}

function pointGuess(
  kind: GuessKind,
  blob: (at: number, radius: number, strength?: number) => void,
  between: (lo: number, hi: number) => number,
  rnd: () => number
): void {
  switch (kind) {
    case "bullseye":
      return blob(between(0, 0.3), between(0.5, 1))
    case "close":
      return blob(between(0.5, 1.5), between(0.4, 0.8))
    case "near-miss":
      return blob(between(2, 4), between(0.5, 1.5))
    case "far-miss":
      return blob(between(6, 20), between(0.5, 2))
    case "wide":
      return blob(between(0, 3), between(4, 10))
    case "hedge": {
      const share = [0.3, 0.5, 0.7][Math.floor(rnd() * 3)]!
      blob(between(0, 1), 1, share)
      return blob(between(4, 10), 1, 1 - share)
    }
    case "scattered":
      for (let i = 3 + Math.floor(rnd() * 3); i > 0; i--) blob(between(0, 12), between(0.5, 1.5), between(0.5, 1))
      return
    default:
      throw new Error(`${kind} is not a guess at a point`)
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

interface VerdictBase {
  /** REVIEW_VERSION when given; absent on the first version's. */
  version?: number
  set: number
  index: number
  note?: string
  /** When, as an ISO date. */
  at: string
}

/**
 * A playtester's verdict, as the review exports it (one JSON object a line).
 * Each carries its cases as encodeCase writes them, with the score shown,
 * so it can be re-scored as the scoring changes.
 */
export type ScoreVerdict =
  | (VerdictBase & {
      guess: GuessKind
      /** Much too low (-2) to much too high (2). */
      verdict: -2 | -1 | 0 | 1 | 2
      /** What they think it should have scored. */
      shouldBe?: number
      case: string
    })
  | (VerdictBase & {
      pair: true
      guesses: [GuessKind, GuessKind]
      /** A clearly deserves more (-2) to B clearly does (2). */
      prefer: -2 | -1 | 0 | 1 | 2
      cases: [string, string]
    })
