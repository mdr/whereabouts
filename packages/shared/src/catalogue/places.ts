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
import { FeatureType, LatLonSchema, Surface, type AreaAnswer, type PartOf } from "../questions.ts"

/** Which of a country's capitals a city is. */
export enum CapitalKind {
  NATIONAL = "NATIONAL",
  /** Where the government sits, apart from the official capital: The Hague, La Paz. */
  SEAT_OF_GOVERNMENT = "SEAT_OF_GOVERNMENT",
  LEGISLATIVE = "LEGISLATIVE",
  JUDICIAL = "JUDICIAL",
  /** Still widely taken for the capital: Abidjan, Dar es Salaam. */
  FORMER = "FORMER"
}

/** A city that is a country's capital. */
interface Capital {
  /** The country's place, where the catalogue has one. */
  of?: PlaceId
  kind: CapitalKind
}

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
  /** A part of a country: whose, and how. */
  partOf?: PartOf
  /** A national capital. */
  capital?: Capital
}

const PlaceSchema: z.ZodType<Place> = z.strictObject({
  id: PlaceIdSchema,
  label: z.string(),
  wiki: WikiTitleSchema,
  at: LatLonSchema.optional(),
  feature: z.enum(FeatureType).optional(),
  area: z
    .strictObject({
      outline: OutlineIdSchema,
      centre: LatLonSchema,
      tolerance: KmSchema,
      surface: z.enum(Surface),
      disputed: OutlineIdSchema.optional()
    })
    .optional(),
  flag: z.strictObject({ code: FlagCodeSchema, wiki: WikiTitleSchema }).optional(),
  partOf: z.strictObject({ status: z.string(), flag: FlagCodeSchema }).optional(),
  capital: z.strictObject({ of: PlaceIdSchema.optional(), kind: z.enum(CapitalKind) }).optional()
})

/** places.json as read, by id. */
export const placesFrom = (json: unknown): ReadonlyMap<PlaceId, Place> =>
  new Map(
    z
      .array(PlaceSchema)
      .parse(json)
      .map((place) => [place.id, place])
  )
