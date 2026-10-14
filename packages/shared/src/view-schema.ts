/**
 * A schema for the game state the server sends (GameView), for the tests: the
 * client trusts the server and casts, since checking a reveal with every
 * player's paint costs a slow phone 100 ms or more per message. The server
 * tests check every state message against it, and a type test keeps it the
 * same as GameView. Strict objects, so a field the type lacks fails too.
 */
import { z } from "zod"
import { H3ResSchema } from "./h3.ts"
import { PlayerColourSchema } from "./colours.ts"
import { FlagCodeSchema, PlayerIdSchema, PlayerNameSchema, RegionIdSchema, RoomCodeSchema } from "./ids.ts"
import { KernelIdSchema } from "./scoring.ts"
import { MapDetailSchema, MixSchema, PaintSubmissionSchema } from "./protocol.ts"

const LatLonSchema = z.strictObject({ lat: z.number(), lon: z.number() })

const QuestionViewSchema = z.strictObject({
  prompt: z.string(),
  image: z.string().optional(),
  toleranceKm: z.number(),
  regionId: RegionIdSchema.optional(),
  flag: FlagCodeSchema.optional(),
  topic: z.enum(["island", "lake", "sea", "state"]).optional()
})

const PlayerViewSchema = z.strictObject({
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  colour: PlayerColourSchema.nullable(),
  watching: z.boolean(),
  connected: z.boolean(),
  isHost: z.boolean(),
  locked: z.boolean(),
  score: z.number(),
  rank: z.number().int(),
  previousRank: z.number().int().nullable()
})

const RoundResultViewSchema = z.strictObject({
  playerId: PlayerIdSchema,
  score: z.number(),
  A: z.number(),
  B: z.number(),
  region: z
    .strictObject({ shape: z.number(), nearness: z.number(), coverage: z.number(), precision: z.number() })
    .optional(),
  paint: PaintSubmissionSchema.nullable(),
  res: H3ResSchema
})

export const GameViewSchema = z.strictObject({
  code: RoomCodeSchema,
  phase: z.enum(["lobby", "guessing", "reveal", "results"]),
  config: z.strictObject({
    rounds: z.number().int(),
    roundMs: z.number().int(),
    mix: MixSchema,
    mapDetail: MapDetailSchema,
    kernelId: KernelIdSchema
  }),
  serverTime: z.number(),
  you: z.strictObject({
    id: PlayerIdSchema.nullable(),
    isHost: z.boolean(),
    spectating: z.boolean(),
    watching: z.boolean(),
    locked: z.boolean(),
    paint: PaintSubmissionSchema.nullable()
  }),
  players: z.array(PlayerViewSchema),
  round: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      deadline: z.number()
    })
    .nullable(),
  reveal: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      answer: LatLonSchema,
      label: z.string(),
      wiki: z.string().optional(),
      results: z.array(RoundResultViewSchema),
      ready: z.array(PlayerIdSchema)
    })
    .nullable(),
  results: z
    .array(z.strictObject({ playerId: PlayerIdSchema, total: z.number(), rounds: z.array(z.number().nullable()) }))
    .nullable(),
  awards: z
    .array(
      z.strictObject({ emoji: z.string(), title: z.string(), playerIds: z.array(PlayerIdSchema), line: z.string() })
    )
    .nullable()
})
