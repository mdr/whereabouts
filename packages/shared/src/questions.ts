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
