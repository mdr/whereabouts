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
import { HintAxisSchema } from "./hints.ts"
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

const QuestionPicturesSchema = z.strictObject({
  image: z.string().optional(),
  flag: FlagCodeSchema.optional(),
  revealPhoto: z.string().optional()
})

const PlayerViewSchema = z.strictObject({
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  colour: PlayerColourSchema.optional(),
  watching: z.boolean(),
  connected: z.boolean(),
  isHost: z.boolean(),
  locked: z.boolean(),
  score: z.number(),
  rank: z.number().int(),
  previousRank: z.number().int().optional()
})

const RoundResultViewSchema = z.strictObject({
  playerId: PlayerIdSchema,
  score: z.number(),
  A: z.number(),
  B: z.number(),
  region: z
    .strictObject({ shape: z.number(), nearness: z.number(), coverage: z.number(), precision: z.number() })
    .optional(),
  paint: PaintSubmissionSchema.optional(),
  res: H3ResSchema,
  hint: HintAxisSchema.optional()
})

export const GameViewSchema = z.strictObject({
  code: RoomCodeSchema,
  phase: z.enum(["lobby", "guessing", "reveal", "results"]),
  config: z.strictObject({
    rounds: z.number().int(),
    roundMs: z.number().int(),
    mix: MixSchema,
    mapDetail: MapDetailSchema,
    kernelId: KernelIdSchema,
    hints: z.number().int()
  }),
  serverTime: z.number(),
  you: z.strictObject({
    id: PlayerIdSchema.optional(),
    isHost: z.boolean(),
    spectating: z.boolean(),
    watching: z.boolean(),
    locked: z.boolean(),
    paint: PaintSubmissionSchema.optional(),
    hint: z.strictObject({ axis: HintAxisSchema, from: z.number(), to: z.number() }).optional(),
    hintsLeft: z.number().int()
  }),
  players: z.array(PlayerViewSchema),
  round: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      deadline: z.number()
    })
    .optional(),
  reveal: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      answer: LatLonSchema,
      label: z.string(),
      wiki: z.string().optional(),
      photo: z.string().optional(),
      results: z.array(RoundResultViewSchema),
      ready: z.array(PlayerIdSchema)
    })
    .optional(),
  results: z
    .array(
      z.strictObject({
        playerId: PlayerIdSchema,
        total: z.number(),
        rounds: z.array(z.strictObject({ score: z.number().optional() }))
      })
    )
    .optional(),
  playedRounds: z.array(z.strictObject({ label: z.string(), ...QuestionPicturesSchema.shape })).optional(),
  awards: z
    .array(
      z.strictObject({ emoji: z.string(), title: z.string(), playerIds: z.array(PlayerIdSchema), line: z.string() })
    )
    .optional(),
  upcoming: QuestionPicturesSchema.optional()
})
