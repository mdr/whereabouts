/**
 * Flag rounds: the player sees a flag and finds its country. A country big
 * enough to paint the shape of is scored as a whole country (regions.ts);
 * a small one, or one whose borders are disputed or cross the antimeridian,
 * as a point, like a place. Which it is shows on the question, so the player
 * knows whether to cover the country or mark where it is. The countries are
 * in flags.json, built with regions.json by scripts/build-regions.mjs.
 */
import type { LatLon } from "./geo.ts";
import type { Question } from "./questions.ts";
import type { RegionQuestion } from "./regions.ts";

export interface FlagQuestion {
  id: string;
  /** ISO 3166-1 alpha-2 code, lower case: the flag to show. */
  flag: string;
  /** The country's name, shown after the reveal. */
  label: string;
  /** English Wikipedia article title. */
  wiki: string;
  /** Where a point answer is; the centre of a painted one, for framing. */
  answer: LatLon;
  toleranceKm: number;
  /** Set when the country is painted whole: its id in regions.json. */
  regionId?: string;
}

export const FLAG_AREA_PROMPT = "Paint the whole of the country with this flag";
export const FLAG_POINT_PROMPT = "Where is the country with this flag?";

/**
 * The question a flag round asks: the country's region with a flag in place
 * of its name, or a point. Null when the region is missing (it should not be;
 * the build writes both files together).
 */
export function flagRound(
  f: FlagQuestion,
  regions: ReadonlyMap<string, RegionQuestion>,
): Question | RegionQuestion | null {
  if (f.regionId) {
    const region = regions.get(f.regionId);
    return region ? { ...region, prompt: FLAG_AREA_PROMPT, label: f.label, wiki: f.wiki, flag: f.flag } : null;
  }
  return {
    id: f.id,
    kind: "text",
    prompt: FLAG_POINT_PROMPT,
    answer: f.answer,
    toleranceKm: f.toleranceKm,
    label: f.label,
    wiki: f.wiki,
    region: "world",
    flag: f.flag,
  };
}
