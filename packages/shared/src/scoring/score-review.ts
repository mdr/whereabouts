/**
 * Made-up guesses at real questions, for the score review (a hidden dev
 * screen) where a playtester says whether scores are fair. Each guess is
 * one kind the scoring has to weigh: on the answer, near it, far off,
 * spread wide, hedged; for a place painted whole, all of it, part of it,
 * spilling over its edge, or its neighbour. Painted in brush strokes, unevenly,
 * as people paint. Most cases are one guess to
 * judge on its own; some are two at the same answer, to say which deserves
 * more. Seeded by the set number, so everyone reviewing a set sees the same.
 */
import { z } from "zod"
import { EARTH_RADIUS, greatCircleDistance, type LatLon } from "../geo.ts"
import { cellAreaKm2, cellToLatLng } from "../h3.ts"
import { seededUnit } from "../hints.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import {
  AnswerType,
  ClueType,
  QuestionType,
  answerCentre,
  shuffle,
  type Outlines,
  type Question
} from "../questions.ts"
import { poolOf } from "../catalogue/catalogue.ts"
import { insideRegion, regionCells, scoreAnswer, scoredAnswer, type ScoredAnswer } from "./regions.ts"
import { CaseQuestionType, RegionKernel, encodeCase, type ScoringCase } from "./scoring-case.ts"
import { buildDistribution, type ChoosableKernel, type Kernel } from "./scoring.ts"
import { MapDetail } from "../protocol.ts"
import type { Degrees, Km, SquareKm } from "../units.ts"

export enum GuessType {
  BULLSEYE = "BULLSEYE",
  CLOSE = "CLOSE",
  NEAR_MISS = "NEAR_MISS",
  FAR_MISS = "FAR_MISS",
  WIDE = "WIDE",
  HEDGE = "HEDGE",
  SCATTERED = "SCATTERED",
  WHOLE = "WHOLE",
  PART = "PART",
  SPILL = "SPILL",
  CENTRE = "CENTRE",
  NEIGHBOUR = "NEIGHBOUR"
}

export const POINT_GUESSES: readonly GuessType[] = [
  GuessType.BULLSEYE,
  GuessType.CLOSE,
  GuessType.NEAR_MISS,
  GuessType.FAR_MISS,
  GuessType.WIDE,
  GuessType.HEDGE,
  GuessType.SCATTERED
]
export const REGION_GUESSES: readonly GuessType[] = [
  GuessType.WHOLE,
  GuessType.PART,
  GuessType.SPILL,
  GuessType.CENTRE,
  GuessType.NEIGHBOUR,
  GuessType.FAR_MISS,
  GuessType.WIDE,
  GuessType.HEDGE
]

export enum ReviewCaseType {
  SINGLE = "SINGLE",
  PAIR = "PAIR"
}

/** The practice default: what the guesses would score with. */
const REVIEW_FLOOR = 0.05
/** Changes when the same set number would give different cases, so verdicts on the old ones stay apart. */
export const REVIEW_VERSION = 4

interface ReviewGuess {
  type: GuessType
  layer: PaintLayer
}

interface SingleReviewCase {
  type: ReviewCaseType.SINGLE
  question: Question
  answer: ScoredAnswer
  guess: ReviewGuess
}

interface PairReviewCase {
  type: ReviewCaseType.PAIR
  question: Question
  answer: ScoredAnswer
  guesses: [ReviewGuess, ReviewGuess]
}

export type ReviewCase = SingleReviewCase | PairReviewCase

/** Cases a set holds from each pool: single guesses, then pairs. */
const MIX: [QuestionType[], number, number][] = [
  [[QuestionType.LANDMARK, QuestionType.PLACE], 8, 2],
  [[QuestionType.COUNTRY], 6, 2],
  [[QuestionType.FEATURE], 5, 2],
  [[QuestionType.STATE], 5, 2]
]

export const REVIEW_SET_SIZE = MIX.reduce((n, [, singles, pairs]) => n + singles + pairs, 0)

export function reviewCases(set: number, catalogue: readonly Question[], outlines: Outlines): ReviewCase[] {
  const cases: ReviewCase[] = []
  MIX.forEach(([types, singles, pairs], p) => {
    const questions = shuffle(poolOf(catalogue, types, MapDetail.POLITICAL), set * 7919 + p).slice(0, singles + pairs)
    questions.forEach((question, i) => {
      let n = 0
      const rnd = () => seededUnit(set, p, i, n++)
      const answer = scoredAnswer(question.answer, outlines)
      const types = shuffle([...guessesFor(answer)], set * 104729 + p * 31 + i)
      if (i < singles)
        cases.push({ type: ReviewCaseType.SINGLE, question, answer, guess: paintGuess(answer, types[0]!, rnd) })
      else
        cases.push({
          type: ReviewCaseType.PAIR,
          question,
          answer,
          guesses: [paintGuess(answer, types[0]!, rnd), paintGuess(answer, types[1]!, rnd)]
        })
    })
  })
  return shuffle(cases, set * 15485863)
}

const guessesFor = (a: ScoredAnswer) => (a.type === AnswerType.AREA ? REGION_GUESSES : POINT_GUESSES)

/** A guess's score, as practice would give it. */
export function scoreGuess(a: ScoredAnswer, layer: PaintLayer, kernel: Kernel): Pick<ScoringCase, "score" | "parts"> {
  return scoreAnswer(buildDistribution(layer.toCells(), REVIEW_FLOOR), a, kernel)
}

/** A guess and its score as a scoring case's text, for the export. */
export function guessCase(q: Question, a: ScoredAnswer, layer: PaintLayer, kernel: ChoosableKernel): Promise<string> {
  return encodeCase({
    question: caseQuestion(q, a),
    kernel: a.type === AnswerType.AREA ? RegionKernel.REGION : kernel.id,
    floor: REVIEW_FLOOR,
    res: layer.res,
    ...scoreGuess(a, layer, kernel),
    cells: layer.toRecord()
  })
}

/** A question as a scoring case names it. */
export function caseQuestion(q: Question, a: ScoredAnswer): ScoringCase["question"] {
  return {
    type:
      a.type === AnswerType.AREA
        ? CaseQuestionType.REGION
        : q.clue.type === ClueType.PHOTO
          ? CaseQuestionType.PHOTO
          : CaseQuestionType.TEXT,
    id: q.id,
    label: q.label,
    answer: a.type === AnswerType.AREA ? a.centre : a.at,
    tolerance: a.tolerance,
    ...(q.clue.type === ClueType.FLAG ? { flag: q.clue.flag } : {})
  }
}

function paintGuess(q: ScoredAnswer, type: GuessType, rnd: () => number): ReviewGuess {
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd()
  const t = q.tolerance
  const layer = new PaintLayer(resolutionForTolerance(t))
  /** A rough patch `radius` tolerances across, `at` tolerances from the answer in a random direction. */
  const blob = (at: number, radius: number, strength = 1) => {
    const centre = offset(answerCentre(q), at * t, rnd() * 360)
    const r = radius * t
    scribble(layer, rnd, {
      sample: () => offset(centre, r * Math.sqrt(rnd()), rnd() * 360),
      inside: (p) => greatCircleDistance(centre, p) <= r,
      area: Math.PI * r * r,
      brush: Math.max(0.3 * t, r * between(0.45, 0.7)),
      strength
    })
  }
  if (q.type !== AnswerType.AREA) {
    pointGuess(type, blob, between, rnd)
    return { type, layer }
  }
  // A region's tolerance is a fifth of its radius: R is about its radius.
  const R = 5
  const cells = regionCells(q, layer.res)
  const centres = cells.map((h) => {
    const [lat, lon] = cellToLatLng(h)
    return { lat, lon }
  })
  const oneCell: SquareKm = cells.length > 0 ? cellAreaKm2(cells[0]!) : 0
  /** Brush strokes over the region, or the part of it `keep` allows, `across` in radius. */
  const shape = (strength: number, keep: (p: LatLon) => boolean = () => true, across: Km = R * t) => {
    const kept = centres.filter(keep)
    const from = kept.length > 0 ? kept : [q.centre]
    scribble(layer, rnd, {
      sample: () => from[Math.floor(rnd() * from.length)]!,
      inside: (p) => keep(p) && insideRegion(q, p),
      area: Math.max(kept.length * oneCell, Math.PI * t * t),
      brush: between(0.2, 0.32) * across,
      strength
    })
  }
  switch (type) {
    case GuessType.WHOLE:
      shape(1)
      break
    case GuessType.PART: {
      const from = centres[Math.floor(rnd() * centres.length)] ?? q.centre
      const reach = between(0.4, 0.8) * R * t
      shape(1, (p) => greatCircleDistance(from, p) <= reach, reach)
      break
    }
    case GuessType.SPILL:
      shape(1)
      blob(between(0.8, 1.2) * R, between(0.4, 0.7) * R)
      break
    case GuessType.CENTRE:
      blob(0, between(0.4, 0.8) * R)
      break
    case GuessType.NEIGHBOUR:
      blob(between(1.5, 2.5) * R, between(0.5, 1) * R)
      break
    case GuessType.FAR_MISS:
      blob(between(6, 15) * R, between(0.5, 1) * R)
      break
    case GuessType.WIDE:
      blob(between(0, 1) * R, between(3, 5) * R)
      break
    case GuessType.HEDGE: {
      const share = [0.3, 0.5, 0.7][Math.floor(rnd() * 3)]!
      shape(share)
      blob(between(4, 8) * R, 0.8 * R, 1 - share)
      break
    }
    default:
      throw new Error(`${type} is not a guess at a region`)
  }
  return { type, layer }
}

/** Enough dabs for the biggest patch without making a set slow to paint. */
const MAX_DABS = 600

interface Patch {
  /** A point to start a stroke from. */
  sample: () => LatLon
  /** Whether a point is in what the hand is aiming to cover. */
  inside: (p: LatLon) => boolean
  area: SquareKm
  /** The brush's radius. */
  brush: Km
  strength: number
}

/**
 * Cover a patch as a hand would: wandering strokes of dabs that vary in
 * size and weight, about two coats in all, so some places get more and a
 * few none. A stroke that runs over the edge leaves a dab there before turning
 * back, so the paint overshoots the outline in places and misses others.
 */
function scribble(layer: PaintLayer, rnd: () => number, patch: Patch): void {
  const step = 0.7 * patch.brush
  let dabs = Math.min(MAX_DABS, Math.ceil((patch.area / (1.5 * step * patch.brush)) * (1.8 + 0.8 * rnd())))
  while (dabs > 0) {
    let at = patch.sample()
    let heading = rnd() * 360
    for (let k = 6 + Math.floor(rnd() * 14); k > 0 && dabs > 0; k--, dabs--) {
      layer.stamp(at, patch.brush * (0.85 + 0.3 * rnd()), patch.strength * (0.75 + 0.35 * rnd()))
      heading += (rnd() - 0.5) * 60
      at = offset(at, step, heading)
      if (!patch.inside(at)) heading += 140 + rnd() * 80
    }
  }
}

function pointGuess(
  type: GuessType,
  blob: (at: number, radius: number, strength?: number) => void,
  between: (lo: number, hi: number) => number,
  rnd: () => number
): void {
  switch (type) {
    case GuessType.BULLSEYE:
      return blob(between(0, 0.3), between(0.5, 1))
    case GuessType.CLOSE:
      return blob(between(0.5, 1.5), between(0.4, 0.8))
    case GuessType.NEAR_MISS:
      return blob(between(2, 4), between(0.5, 1.5))
    case GuessType.FAR_MISS:
      return blob(between(6, 20), between(0.5, 2))
    case GuessType.WIDE:
      return blob(between(0, 3), between(4, 10))
    case GuessType.HEDGE: {
      const share = [0.3, 0.5, 0.7][Math.floor(rnd() * 3)]!
      blob(between(0, 1), 1, share)
      return blob(between(4, 10), 1, 1 - share)
    }
    case GuessType.SCATTERED:
      for (let i = 3 + Math.floor(rnd() * 3); i > 0; i--) blob(between(0, 12), between(0.5, 1.5), between(0.5, 1))
      return
    default:
      throw new Error(`${type} is not a guess at a point`)
  }
}

/** The point `distance` from `from` on a bearing clockwise from north. */
function offset(from: LatLon, distance: Km, bearing: Degrees): LatLon {
  const d = distance / EARTH_RADIUS
  const b = (bearing * Math.PI) / 180
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
      guess: GuessType
      /** Much too low (-2) to much too high (2). */
      verdict: -2 | -1 | 0 | 1 | 2
      /** What they think it should have scored. */
      shouldBe?: number
      case: string
    })
  | (VerdictBase & {
      pair: true
      guesses: [GuessType, GuessType]
      /** A clearly deserves more (-2) to B clearly does (2). */
      prefer: -2 | -1 | 0 | 1 | 2
      cases: [string, string]
    })

const Scale = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
// Verdicts given before the guesses were an enum name them in lower case.
const Guess = z.preprocess((v) => (typeof v === "string" ? v.toUpperCase().replaceAll("-", "_") : v), z.enum(GuessType))
const verdictBase = {
  version: z.number().optional(),
  set: z.number(),
  index: z.number(),
  note: z.string().optional(),
  at: z.string()
}

export const ScoreVerdictSchema: z.ZodType<ScoreVerdict> = z.union([
  z.object({ ...verdictBase, guess: Guess, verdict: Scale, shouldBe: z.number().optional(), case: z.string() }),
  z.object({
    ...verdictBase,
    pair: z.literal(true),
    guesses: z.tuple([Guess, Guess]),
    prefer: Scale,
    cases: z.tuple([z.string(), z.string()])
  })
])
