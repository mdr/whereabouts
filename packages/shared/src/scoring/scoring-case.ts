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
  res: number
  score: Points
  parts: AnswerParts
  /** H3 index -> intensity. */
  cells: Record<string, number>
}

const MAGIC = "whereabouts-case 1"
const LINE_WIDTH = 76
const INTENSITY_LEVELS = 65535

export async function encodeCase(c: ScoringCase): Promise<string> {
  const q = c.question
  const parts =
    c.parts.type === AnswerType.POINT
      ? `A=${round(c.parts.A, 4)} B=${round(c.parts.B, 4)}`
      : `shape=${round(c.parts.shape, 1)} nearness=${round(c.parts.nearness, 1)}`
  const entries = Object.entries(c.cells)
    .map(([h, v]) => [BigInt(`0x${h}`), v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const max = Math.max(...entries.map(([, v]) => v))
  const bytes: number[] = []
  let previous = 0n
  for (const [index, v] of entries) {
    writeVarint(bytes, index - previous)
    previous = index
    const level = Math.max(1, Math.round((v / max) * INTENSITY_LEVELS))
    bytes.push(level >> 8, level & 0xff)
  }
  const payload = toBase64Url(await deflate(new Uint8Array(bytes)))
  return [
    MAGIC,
    `question: ${q.type} ${q.id} ${JSON.stringify(q.label)}${q.flag ? ` flag=${q.flag}` : ""}`,
    `answer: ${round(q.answer.lat, 5)} ${round(q.answer.lon, 5)} tolerance=${round(q.tolerance, 3)}km`,
    `kernel: ${c.kernel} floor=${round(c.floor, 4)}`,
    `score: ${round(c.score, 1)} ${parts}`,
    `paint: res=${c.res} cells=${entries.length} max=${max}`,
    ...(payload.match(new RegExp(`.{1,${LINE_WIDTH}}`, "g")) ?? []),
    "end"
  ].join("\n")
}

export async function decodeCase(text: string): Promise<ScoringCase> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const start = lines.indexOf(MAGIC)
  if (start < 0) throw new Error(`not a scoring case: no "${MAGIC}" line`)
  const field = (key: string) => {
    const line = lines.slice(start).find((l) => l.startsWith(`${key}: `))
    if (!line) throw new Error(`scoring case has no ${key} line`)
    return line.slice(key.length + 2)
  }
  const named = (s: string, name: string) => {
    const m = new RegExp(`(?:^|\\s)${name}=(\\S+)`).exec(s)
    if (!m) throw new Error(`scoring case has no ${name}`)
    return m[1]!
  }

  // Cases copied before the enums wrote these words in lower case, and kernels with hyphens.
  const qm = /^(PHOTO|TEXT|REGION) (\S+) ("(?:[^"\\]|\\.)*")(?: flag=(\S+))?$/.exec(
    field("question").replace(/^\S+/, (w) => w.toUpperCase())
  )
  if (!qm) throw new Error("scoring case has a malformed question line")
  const answer = field("answer").split(/\s+/)
  const kernel = field("kernel").replace(/^\S+/, (w) => w.toUpperCase().replaceAll("-", "_"))
  const score = field("score")
  const paint = field("paint")
  const parts: AnswerParts = /\bA=/.test(score)
    ? { type: AnswerType.POINT, A: Number(named(score, "A")), B: Number(named(score, "B")) }
    : { type: AnswerType.AREA, shape: Number(named(score, "shape")), nearness: Number(named(score, "nearness")) }

  const paintAt = lines.findIndex((l, i) => i > start && l.startsWith("paint: "))
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
      type: qm[1] as CaseQuestionType,
      id: questionId(qm[2]!),
      label: JSON.parse(qm[3]!) as string,
      answer: { lat: Number(answer[0]), lon: Number(answer[1]) },
      tolerance: parseFloat(named(field("answer"), "tolerance")),
      ...(qm[4] ? { flag: flagCode(qm[4]) } : {})
    },
    kernel: kernel.split(/\s+/)[0] as ScoringCase["kernel"],
    floor: Number(named(kernel, "floor")),
    res: Number(named(paint, "res")),
    score: Number(score.split(/\s+/)[0]),
    parts,
    cells
  }
}

const round = (x: number, places: number) => Number(x.toFixed(places))

function writeVarint(out: number[], n: bigint): void {
  do {
    const byte = Number(n & 0x7fn)
    n >>= 7n
    out.push(n > 0n ? byte | 0x80 : byte)
  } while (n > 0n)
}

function readVarint(bytes: Uint8Array, at: number): [bigint, number] {
  let n = 0n
  let shift = 0n
  for (;;) {
    const byte = bytes[at++]
    if (byte === undefined) throw new Error("scoring case paint is truncated")
    n |= BigInt(byte & 0x7f) << shift
    if (byte < 0x80) return [n, at]
    shift += 7n
  }
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("deflate-raw"))
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("deflate-raw"))
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
