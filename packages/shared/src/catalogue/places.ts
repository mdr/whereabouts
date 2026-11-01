/**
 * The places questions ask about (places.json): what is true of a place
 * however it is asked, kept once. "Where is Albania?", "Paint the whole of
 * Albania" and Albania's flag are three questions about one place. Facts
 * and reveal photos are by place too.
 */
import { z } from "zod"
import { KmSchema } from "../units.ts"
import {
  FlagCodeSchema,
  OutlineIdSchema,
  PlaceIdSchema,
  WikiTitleSchema,
  type FlagCode,
  type PlaceId,
  type WikiTitle
} from "../ids.ts"
import type { LatLon } from "../geo.ts"
import { FeatureType, LatLonSchema, Surface, type AreaAnswer } from "../questions.ts"

export interface Place {
  id: PlaceId
  label: string
  /** English Wikipedia article title. */
  wiki: WikiTitle
  /** Where it is, for every round that asks for it as a point. */
  at?: LatLon
  feature?: FeatureType
  /** Where it can be painted whole. */
  area?: Omit<AreaAnswer, "type">
  /** A country's flag, with the article on it. */
  flag?: { code: FlagCode; wiki: WikiTitle }
}

const PlaceSchema: z.ZodType<Place> = z.strictObject({
  id: PlaceIdSchema,
  label: z.string(),
  wiki: WikiTitleSchema,
  at: LatLonSchema.optional(),
  feature: z.enum(FeatureType).optional(),
  area: z
    .strictObject({ outline: OutlineIdSchema, centre: LatLonSchema, tolerance: KmSchema, surface: z.enum(Surface) })
    .optional(),
  flag: z.strictObject({ code: FlagCodeSchema, wiki: WikiTitleSchema }).optional()
})

/** places.json as read, by id. */
export const placesFrom = (json: unknown): ReadonlyMap<PlaceId, Place> =>
  new Map(
    z
      .array(PlaceSchema)
      .parse(json)
      .map((place) => [place.id, place])
  )
