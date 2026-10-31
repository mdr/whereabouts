/**
 * A schema for the game state the server sends (GameView), for the tests: the
 * client trusts the server and casts, since checking a reveal with every
 * player's paint costs a slow phone 100 ms or more per message. The server
 * tests check every state message against it, and a type test keeps it the
 * same as GameView. Strict objects, so a field the type lacks fails too.
 */
import { z } from "zod"
import { PlayerColourSchema } from "./colours.ts"
import {
  CommonsFileSchema,
  FlagCodeSchema,
  OutlineIdSchema,
  PlayerIdSchema,
  PlayerNameSchema,
  RoomCodeSchema,
  WikiTitleSchema
} from "./ids.ts"
import { HintAxisSchema } from "./hints.ts"
import { KernelIdSchema } from "./scoring.ts"
import { H3CellSchema, H3ResSchema } from "./h3.ts"
import { MapDetailSchema, MixSchema, Phase } from "./protocol.ts"
import { AnswerType, ClueType, FeatureType, QuestionType, Surface } from "./questions.ts"
import { DegreesSchema, KmSchema, MsSchema } from "./units.ts"

const PaintSchema = z.strictObject({ cells: z.record(H3CellSchema, z.number()), floor: z.number() })

const LatLonSchema = z.strictObject({ lat: DegreesSchema, lon: DegreesSchema })

const QuestionViewSchema = z.strictObject({
  type: z.enum(QuestionType),
  prompt: z.string(),
  clue: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal(ClueType.PHOTO), image: CommonsFileSchema }),
    z.strictObject({ type: z.literal(ClueType.NAME), prompt: z.string() }),
    z.strictObject({ type: z.literal(ClueType.FLAG), flag: FlagCodeSchema })
  ]),
  answer: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal(AnswerType.POINT), tolerance: KmSchema }),
    z.strictObject({
      type: z.literal(AnswerType.AREA),
      tolerance: KmSchema,
      outline: OutlineIdSchema,
      surface: z.enum(Surface)
    })
  ]),
  feature: z.enum(FeatureType).optional(),
  countryFlag: FlagCodeSchema.optional()
})

const QuestionPicturesSchema = z.strictObject({
  image: CommonsFileSchema.optional(),
  flag: FlagCodeSchema.optional(),
  revealPhoto: CommonsFileSchema.optional()
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
  paint: PaintSchema.optional(),
  res: H3ResSchema,
  hint: HintAxisSchema.optional()
})

export const GameViewSchema = z.strictObject({
  code: RoomCodeSchema,
  phase: z.enum(Phase),
  config: z.strictObject({
    rounds: z.number().int(),
    roundLength: MsSchema,
    mix: MixSchema,
    mapDetail: MapDetailSchema,
    kernelId: KernelIdSchema,
    hints: z.number().int()
  }),
  serverTime: MsSchema,
  you: z.strictObject({
    id: PlayerIdSchema.optional(),
    isHost: z.boolean(),
    spectating: z.boolean(),
    watching: z.boolean(),
    locked: z.boolean(),
    paint: PaintSchema.optional(),
    hint: z.strictObject({ axis: HintAxisSchema, from: DegreesSchema, to: DegreesSchema }).optional(),
    hintsLeft: z.number().int()
  }),
  players: z.array(PlayerViewSchema),
  round: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      deadline: MsSchema
    })
    .optional(),
  reveal: z
    .strictObject({
      index: z.number().int(),
      total: z.number().int(),
      question: QuestionViewSchema,
      answer: LatLonSchema,
      label: z.string(),
      wiki: WikiTitleSchema.optional(),
      photo: CommonsFileSchema.optional(),
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
  playedRounds: z
    .array(
      z.strictObject({
        label: z.string(),
        type: z.enum(QuestionType),
        feature: z.enum(FeatureType).optional(),
        area: z.strictObject({ outline: OutlineIdSchema, centre: LatLonSchema }).optional(),
        ...QuestionPicturesSchema.shape
      })
    )
    .optional(),
  awards: z
    .array(
      z.strictObject({ emoji: z.string(), title: z.string(), playerIds: z.array(PlayerIdSchema), line: z.string() })
    )
    .optional(),
  upcoming: QuestionPicturesSchema.optional()
})
