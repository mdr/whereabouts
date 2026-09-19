import type { LatLon } from "./geo.ts";

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
  region: "world" | "uk";
}

export function commonsImageUrl(file: string, width = 900): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

import questionsJson from "../questions.json" with { type: "json" };

/** The bundled question pool. */
export const QUESTIONS: Question[] = questionsJson as Question[];

/**
 * Choose a game's questions: as even a split between photo and text as the
 * pool allows, drawn without replacement, in a shuffled order so the kinds
 * do not simply alternate. Deterministic for a seed.
 */
export function pickQuestions(pool: Question[], count: number, seed: number): Question[] {
  const byKind = new Map<Question["kind"], Question[]>();
  for (const q of shuffle(pool, seed)) {
    const list = byKind.get(q.kind) ?? [];
    list.push(q);
    byKind.set(q.kind, list);
  }
  const kinds = [...byKind.values()];
  const picked: Question[] = [];
  // Round-robin over kinds, skipping any that has run dry, until we have
  // enough or the pool is exhausted.
  let i = 0;
  while (picked.length < Math.min(count, pool.length)) {
    const list = kinds[i % kinds.length]!;
    const q = list.shift();
    if (q) picked.push(q);
    i++;
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
