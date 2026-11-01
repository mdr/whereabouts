/**
 * A practice round's paint and score as plain text, to paste into a chat
 * about the scoring. A few readable header lines say what was asked and
 * scored; the paint follows as deflated, base64url-encoded binary, wrapped
 * at 76 columns. Reading ignores blank lines and any whitespace inside the
 * paint, so rewrapping in transit does no harm.
 *
 * Paint: cells sorted by H3 index, each as the LEB128 gap from the previous
 * index, then its intensity as a 16-bit fraction of the largest. Scoring only
 * uses intensities relative to each other, so that loses nothing that matters.
 */
import type { LatLon } from "../geo.ts"
import { flagCode, questionId, type FlagCode, type QuestionId } from "../ids.ts"
import { AnswerType } from "../questions.ts"
import type { Km, Points } from "../units.ts"
import type { AnswerParts } from "./regions.ts"
import type { KernelId } from "./scoring.ts"

export enum CaseQuestionType {
  PHOTO = "PHOTO",
  TEXT = "TEXT",
  REGION = "REGION"
}

/** What an area answer is scored with in place of a kernel. */
export enum RegionKernel {
  REGION = "REGION"
}

export interface ScoringCase {
  question: {
    type: CaseQuestionType
    id: QuestionId
    label: string
    answer: LatLon
    tolerance: Km
    /** A flag round: the flag shown. */
    flag?: FlagCode
  }
  kernel: KernelId | RegionKernel
  floor: number
  /** The paint layer's finest resolution. */
  resolution: number
  score: Points
  parts: AnswerParts
  /** H3 index -> intensity. */
  cells: Record<string, number>
}

const MAGIC = "whereabouts-case 1"
const LINE_WIDTH = 76
const INTENSITY_LEVELS = 65535

export const encodeCase = async (scoringCase: ScoringCase): Promise<string> => {
  const question = scoringCase.question
  const parts =
    scoringCase.parts.type === AnswerType.POINT
      ? `A=${round(scoringCase.parts.A, 4)} B=${round(scoringCase.parts.B, 4)}`
      : `shape=${round(scoringCase.parts.shape, 1)} nearness=${round(scoringCase.parts.nearness, 1)}`
  const entries = Object.entries(scoringCase.cells)
    .map(([hex, value]) => [BigInt(`0x${hex}`), value] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const max = Math.max(...entries.map(([, value]) => value))
  const bytes: number[] = []
  let previous = 0n
  for (const [index, value] of entries) {
    writeVarint(bytes, index - previous)
    previous = index
    const level = Math.max(1, Math.round((value / max) * INTENSITY_LEVELS))
    bytes.push(level >> 8, level & 0xff)
  }
  const payload = toBase64Url(await deflate(new Uint8Array(bytes)))
  return [
    MAGIC,
    `question: ${question.type} ${question.id} ${JSON.stringify(question.label)}${question.flag ? ` flag=${question.flag}` : ""}`,
    `answer: ${round(question.answer.lat, 5)} ${round(question.answer.lon, 5)} tolerance=${round(question.tolerance, 3)}km`,
    `kernel: ${scoringCase.kernel} floor=${round(scoringCase.floor, 4)}`,
    `score: ${round(scoringCase.score, 1)} ${parts}`,
    `paint: resolution=${scoringCase.resolution} cells=${entries.length} max=${max}`,
    ...(payload.match(new RegExp(`.{1,${LINE_WIDTH}}`, "g")) ?? []),
    "end"
  ].join("\n")
}

export const decodeCase = async (text: string): Promise<ScoringCase> => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const start = lines.indexOf(MAGIC)
  if (start < 0) throw new Error(`not a scoring case: no "${MAGIC}" line`)
  const field = (key: string) => {
    const line = lines.slice(start).find((candidate) => candidate.startsWith(`${key}: `))
    if (!line) throw new Error(`scoring case has no ${key} line`)
    return line.slice(key.length + 2)
  }
  const named = (text: string, name: string) => {
    const match = new RegExp(`(?:^|\\s)${name}=(\\S+)`).exec(text)
    if (!match) throw new Error(`scoring case has no ${name}`)
    return match[1]!
  }

  // Cases copied before the enums wrote these words in lower case, and kernels with hyphens.
  const questionMatch = /^(PHOTO|TEXT|REGION) (\S+) ("(?:[^"\\]|\\.)*")(?: flag=(\S+))?$/.exec(
    field("question").replace(/^\S+/, (word) => word.toUpperCase())
  )
  if (!questionMatch) throw new Error("scoring case has a malformed question line")
  const answer = field("answer").split(/\s+/)
  const kernel = field("kernel").replace(/^\S+/, (word) => word.toUpperCase().replaceAll("-", "_"))
  const score = field("score")
  const paint = field("paint")
  const parts: AnswerParts = /\bA=/.test(score)
    ? { type: AnswerType.POINT, A: Number(named(score, "A")), B: Number(named(score, "B")) }
    : { type: AnswerType.AREA, shape: Number(named(score, "shape")), nearness: Number(named(score, "nearness")) }

  const paintAt = lines.findIndex((line, i) => i > start && line.startsWith("paint: "))
  const endAt = lines.indexOf("end", paintAt)
  if (endAt < 0) throw new Error('scoring case has no "end" line: was it cut off?')
  const bytes = await inflate(fromBase64Url(lines.slice(paintAt + 1, endAt).join("")))
  const max = Number(named(paint, "max"))
  const cells: Record<string, number> = {}
  let index = 0n
  for (let at = 0; at < bytes.length;) {
    const [gap, next] = readVarint(bytes, at)
    index += gap
    cells[index.toString(16)] = (((bytes[next]! << 8) | bytes[next + 1]!) / INTENSITY_LEVELS) * max
    at = next + 2
  }
  const expected = Number(named(paint, "cells"))
  if (Object.keys(cells).length !== expected) {
    throw new Error(`scoring case paint has ${Object.keys(cells).length} cells, expected ${expected}`)
  }

  return {
    question: {
      type: questionMatch[1] as CaseQuestionType,
      id: questionId(questionMatch[2]!),
      label: JSON.parse(questionMatch[3]!) as string,
      answer: { lat: Number(answer[0]), lon: Number(answer[1]) },
      tolerance: parseFloat(named(field("answer"), "tolerance")),
      ...(questionMatch[4] ? { flag: flagCode(questionMatch[4]) } : {})
    },
    kernel: kernel.split(/\s+/)[0] as ScoringCase["kernel"],
    floor: Number(named(kernel, "floor")),
    resolution: Number(named(paint, "resolution")),
    score: Number(score.split(/\s+/)[0]),
    parts,
    cells
  }
}

const round = (value: number, places: number) => Number(value.toFixed(places))

const writeVarint = (out: number[], value: bigint): void => {
  do {
    const byte = Number(value & 0x7fn)
    value >>= 7n
    out.push(value > 0n ? byte | 0x80 : byte)
  } while (value > 0n)
}

const readVarint = (bytes: Uint8Array, at: number): [bigint, number] => {
  let value = 0n
  let shift = 0n
  for (;;) {
    const byte = bytes[at++]
    if (byte === undefined) throw new Error("scoring case paint is truncated")
    value |= BigInt(byte & 0x7f) << shift
    if (byte < 0x80) return [value, at]
    shift += 7n
  }
}

const deflate = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> =>
  pipe(bytes, new CompressionStream("deflate-raw"))

const inflate = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> =>
  pipe(bytes, new DecompressionStream("deflate-raw"))

const pipe = async (
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> => {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const base64 = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0))
}
