import { greatCircleDistance, type LatLon } from "./geo.ts";

/** Two questions in one game should be at least this far apart when the pool allows. */
const MIN_SPREAD_KM = 50;

export interface Question {
  id: string;
  kind: "photo" | "text";
  prompt: string;
  /** Wikimedia Commons file name (without the File: prefix). */
  image?: string;
  answer: LatLon;
  toleranceKm: number;
  /** Shown after the reveal. */
  label: string;
  /** English Wikipedia article title, linked from the reveal. */
  wiki?: string;
  region: "world" | "uk";
}

export function commonsImageUrl(file: string, width = 900): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

/** The Wikipedia article for a place, or a search for its label when there is none. */
export function wikipediaUrl(title: string | undefined, label: string): string {
  return title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(label)}`;
}

import questionsJson from "../questions.json" with { type: "json" };

/** The bundled question pool. */
export const QUESTIONS: Question[] = questionsJson as Question[];

/**
 * Choose a game's questions: `photoShare` of them photos (rounded), the rest
 * text, topping up from the other kind when one runs short. Drawn without
 * replacement, in a shuffled order so the kinds do not simply alternate.
 * Deterministic for a seed.
 */
export function pickQuestions(pool: Question[], count: number, seed: number, photoShare = 0.5): Question[] {
  const lists: Record<Question["kind"], Question[]> = { photo: [], text: [] };
  for (const q of shuffle(pool, seed)) lists[q.kind].push(q);
  const total = Math.min(count, pool.length);
  const text = Math.min(total - Math.min(Math.round(total * photoShare), lists.photo.length), lists.text.length);
  const want: Record<Question["kind"], number> = { photo: total - text, text };
  const picked: Question[] = [];
  const got: Record<Question["kind"], number> = { photo: 0, text: 0 };
  // Take turns in proportion to the targets. Within a kind, prefer a question
  // well away from those already picked (several London landmarks in one game
  // would be dull); fall back to the next one when the pool cannot oblige.
  const farFromPicked = (q: Question) => picked.every((p) => greatCircleDistance(p.answer, q.answer) > MIN_SPREAD_KM);
  while (picked.length < total) {
    const kind = (["photo", "text"] as const)
      .filter((k) => got[k] < want[k])
      .sort((a, b) => got[a] / want[a] - got[b] / want[b])[0]!;
    const list = lists[kind];
    const at = list.findIndex(farFromPicked);
    picked.push(at >= 0 ? list.splice(at, 1)[0]! : list.shift()!);
    got[kind]++;
  }
  return shuffle(picked, seed ^ 0x9e3779b9);
}

/** Deterministic shuffle so a playtest session can be replayed. */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
