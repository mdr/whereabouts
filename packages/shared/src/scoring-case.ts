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
import type { LatLon } from "./geo.ts";

export interface ScoringCase {
  question: {
    kind: "photo" | "text" | "region";
    id: string;
    label: string;
    answer: LatLon;
    toleranceKm: number;
    /** A flag round: the flag shown. */
    flag?: string;
  };
  kernel: string;
  floor: number;
  /** The paint layer's finest resolution. */
  res: number;
  score: number;
  parts: { A: number; B: number } | { shape: number; nearness: number };
  /** H3 index -> intensity. */
  cells: Record<string, number>;
}

const MAGIC = "whereabouts-case 1";
const WIDTH = 76;
const LEVELS = 65535;

export async function encodeCase(c: ScoringCase): Promise<string> {
  const q = c.question;
  const parts =
    "A" in c.parts
      ? `A=${round(c.parts.A, 4)} B=${round(c.parts.B, 4)}`
      : `shape=${round(c.parts.shape, 1)} nearness=${round(c.parts.nearness, 1)}`;
  const entries = Object.entries(c.cells)
    .map(([h, v]) => [BigInt(`0x${h}`), v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const max = Math.max(...entries.map(([, v]) => v));
  const bytes: number[] = [];
  let previous = 0n;
  for (const [index, v] of entries) {
    writeVarint(bytes, index - previous);
    previous = index;
    const level = Math.max(1, Math.round((v / max) * LEVELS));
    bytes.push(level >> 8, level & 0xff);
  }
  const payload = toBase64Url(await deflate(new Uint8Array(bytes)));
  return [
    MAGIC,
    `question: ${q.kind} ${q.id} ${JSON.stringify(q.label)}${q.flag ? ` flag=${q.flag}` : ""}`,
    `answer: ${round(q.answer.lat, 5)} ${round(q.answer.lon, 5)} tolerance=${round(q.toleranceKm, 3)}km`,
    `kernel: ${c.kernel} floor=${round(c.floor, 4)}`,
    `score: ${round(c.score, 1)} ${parts}`,
    `paint: res=${c.res} cells=${entries.length} max=${max}`,
    ...(payload.match(new RegExp(`.{1,${WIDTH}}`, "g")) ?? []),
    "end",
  ].join("\n");
}

export async function decodeCase(text: string): Promise<ScoringCase> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const start = lines.indexOf(MAGIC);
  if (start < 0) throw new Error(`not a scoring case: no "${MAGIC}" line`);
  const field = (key: string) => {
    const line = lines.slice(start).find((l) => l.startsWith(`${key}: `));
    if (!line) throw new Error(`scoring case has no ${key} line`);
    return line.slice(key.length + 2);
  };
  const named = (s: string, name: string) => {
    const m = new RegExp(`(?:^|\\s)${name}=(\\S+)`).exec(s);
    if (!m) throw new Error(`scoring case has no ${name}`);
    return m[1]!;
  };

  const qm = /^(photo|text|region) (\S+) ("(?:[^"\\]|\\.)*")(?: flag=(\S+))?$/.exec(field("question"));
  if (!qm) throw new Error("scoring case has a malformed question line");
  const answer = field("answer").split(/\s+/);
  const kernel = field("kernel");
  const score = field("score");
  const paint = field("paint");
  const parts = /\bA=/.test(score)
    ? { A: Number(named(score, "A")), B: Number(named(score, "B")) }
    : { shape: Number(named(score, "shape")), nearness: Number(named(score, "nearness")) };

  const paintAt = lines.findIndex((l, i) => i > start && l.startsWith("paint: "));
  const endAt = lines.indexOf("end", paintAt);
  if (endAt < 0) throw new Error('scoring case has no "end" line: was it cut off?');
  const bytes = await inflate(fromBase64Url(lines.slice(paintAt + 1, endAt).join("")));
  const max = Number(named(paint, "max"));
  const cells: Record<string, number> = {};
  let index = 0n;
  for (let at = 0; at < bytes.length;) {
    const [gap, next] = readVarint(bytes, at);
    index += gap;
    cells[index.toString(16)] = (((bytes[next]! << 8) | bytes[next + 1]!) / LEVELS) * max;
    at = next + 2;
  }
  const expected = Number(named(paint, "cells"));
  if (Object.keys(cells).length !== expected) {
    throw new Error(`scoring case paint has ${Object.keys(cells).length} cells, expected ${expected}`);
  }

  return {
    question: {
      kind: qm[1] as ScoringCase["question"]["kind"],
      id: qm[2]!,
      label: JSON.parse(qm[3]!) as string,
      answer: { lat: Number(answer[0]), lon: Number(answer[1]) },
      toleranceKm: parseFloat(named(field("answer"), "tolerance")),
      ...(qm[4] ? { flag: qm[4] } : {}),
    },
    kernel: kernel.split(/\s+/)[0]!,
    floor: Number(named(kernel, "floor")),
    res: Number(named(paint, "res")),
    score: Number(score.split(/\s+/)[0]),
    parts,
    cells,
  };
}

const round = (x: number, places: number) => Number(x.toFixed(places));

function writeVarint(out: number[], n: bigint): void {
  do {
    const byte = Number(n & 0x7fn);
    n >>= 7n;
    out.push(n > 0n ? byte | 0x80 : byte);
  } while (n > 0n);
}

function readVarint(bytes: Uint8Array, at: number): [bigint, number] {
  let n = 0n;
  let shift = 0n;
  for (;;) {
    const byte = bytes[at++];
    if (byte === undefined) throw new Error("scoring case paint is truncated");
    n |= BigInt(byte & 0x7f) << shift;
    if (byte < 0x80) return [n, at];
    shift += 7n;
  }
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("deflate-raw"));
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("deflate-raw"));
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
