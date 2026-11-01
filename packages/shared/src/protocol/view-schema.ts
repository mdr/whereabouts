/**
 * A schema for the game state the server sends (GameView), for the tests: the
 * client trusts the server and casts, since checking a reveal with every
 * player's paint costs a slow phone 100 ms or more per message. The server
 * tests check every state message against it, and a type test keeps it the
 * same as GameView. Strict objects, so a field the type lacks fails too.
 */
import { z } from "zod"
import { PlayerColourSchema } from "../colours.ts"
import {
  CommonsFileSchema,
  FlagCodeSchema,
  OutlineIdSchema,
  PlaceIdSchema,
  PlayerIdSchema,
  PlayerNameSchema,
  RoomCodeSchema,
  WikiTitleSchema
} from "../ids.ts"
import { HintAxisSchema } from "../hints.ts"
import { Role, YouRoleType } from "../roles.ts"
import { KernelIdSchema } from "../scoring/scoring.ts"
import { H3CellSchema, H3ResolutionSchema } from "../h3.ts"
import { MapDetailSchema, MixSchema } from "./config.ts"
import { Phase, RoundGuessType } from "./views.ts"
import { AnswerType, ClueType, FeatureType, QuestionType, Surface } from "../questions.ts"
import { DegreesSchema, InstantSchema, KmSchema, MsSchema, PointsSchema } from "../units.ts"

const PaintSchema = z.strictObject({ cells: z.record(H3CellSchema, z.number()), floor: z.number() })

const LatLonSchema = z.strictObject({ lat: DegreesSchema, lon: DegreesSchema })

const PhotoClueViewSchema = z.strictObject({ type: z.literal(ClueType.PHOTO), image: CommonsFileSchema })
const NameClueViewSchema = z.strictObject({ type: z.literal(ClueType.NAME), prompt: z.string() })
const FlagClueViewSchema = z.strictObject({ type: z.literal(ClueType.FLAG), flag: FlagCodeSchema })
const PointAnswerViewSchema = z.strictObject({ type: z.literal(AnswerType.POINT), tolerance: KmSchema })
const AreaAnswerViewSchema = z.strictObject({
  type: z.literal(AnswerType.AREA),
  tolerance: KmSchema,
  outline: OutlineIdSchema,
  surface: z.enum(Surface)
})
const AnswerViewSchema = z.discriminatedUnion("type", [PointAnswerViewSchema, AreaAnswerViewSchema])

const QuestionViewSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal(QuestionType.LANDMARK), clue: PhotoClueViewSchema, answer: PointAnswerViewSchema }),
  z.strictObject({ type: z.literal(QuestionType.PLACE), clue: NameClueViewSchema, answer: PointAnswerViewSchema }),
  z.strictObject({
    type: z.literal(QuestionType.COUNTRY),
    clue: NameClueViewSchema,
    answer: AreaAnswerViewSchema,
    countryFlag: FlagCodeSchema.optional()
  }),
  z.strictObject({ type: z.literal(QuestionType.FLAG), clue: FlagClueViewSchema, answer: AnswerViewSchema }),
  z.strictObject({
    type: z.literal(QuestionType.FEATURE),
    feature: z.enum(FeatureType),
    clue: NameClueViewSchema,
    answer: AreaAnswerViewSchema
  }),
  z.strictObject({ type: z.literal(QuestionType.STATE), clue: NameClueViewSchema, answer: AnswerViewSchema })
])

const QuestionPicturesSchema = z.strictObject({
  image: CommonsFileSchema.optional(),
  flag: FlagCodeSchema.optional(),
  revealPhoto: CommonsFileSchema.optional()
})

const SeatViewShape = {
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  connected: z.boolean(),
  isHost: z.boolean()
}

const SpectatorViewSchema = z.strictObject({ ...SeatViewShape, type: z.literal(Role.SPECTATOR) })

const PlayingPlayerViewSchema = z.strictObject({
  ...SeatViewShape,
  type: z.literal(Role.PLAYER),
  colour: PlayerColourSchema,
  locked: z.boolean(),
  score: PointsSchema,
  rank: z.number().int(),
  previousRank: z.number().int().optional()
})

const RoundResultViewSchema = z.strictObject({
  playerId: PlayerIdSchema,
  score: PointsSchema,
  guess: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal(RoundGuessType.PASSED) }),
    z.strictObject({
      type: z.literal(RoundGuessType.PAINTED),
      paint: PaintSchema,
      resolution: H3ResolutionSchema,
      parts: z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal(AnswerType.POINT), A: z.number(), B: z.number() }),
        z.strictObject({ type: z.literal(AnswerType.AREA), shape: PointsSchema, nearness: PointsSchema })
      ])
    })
  ]),
  hint: HintAxisSchema.optional()
})

const SpectatingSchema = z.strictObject({ type: z.literal(YouRoleType.SPECTATOR) })
const YouShape = {
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  isHost: z.boolean(),
  nextHost: PlayerIdSchema.optional()
}
const SeatedYouShape = {
  ...YouShape,
  role: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal(YouRoleType.PLAYING), colour: PlayerColourSchema }),
    SpectatingSchema
  ])
}
const RoundYouShape = {
  ...YouShape,
  role: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal(YouRoleType.PLAYING),
      colour: PlayerColourSchema,
      locked: z.boolean(),
      hintsLeft: z.number().int()
    }),
    z.strictObject({ type: z.literal(YouRoleType.JOINED_LATE), colour: PlayerColourSchema }),
    SpectatingSchema
  ]),
  hint: z.strictObject({ axis: HintAxisSchema, from: DegreesSchema, to: DegreesSchema }).optional()
}

const ViewShape = {
  code: RoomCodeSchema,
  config: z.strictObject({
    roundLength: MsSchema,
    mix: MixSchema,
    mapDetail: MapDetailSchema,
    kernelId: KernelIdSchema,
    hints: z.number().int()
  }),
  serverTime: InstantSchema,
  players: z.array(PlayingPlayerViewSchema),
  spectators: z.array(SpectatorViewSchema)
}

const RoundViewSchema = z.strictObject({
  index: z.number().int(),
  total: z.number().int(),
  question: QuestionViewSchema,
  deadline: InstantSchema
})
const RevealViewSchema = z.strictObject({
  index: z.number().int(),
  total: z.number().int(),
  question: QuestionViewSchema,
  answer: LatLonSchema,
  place: PlaceIdSchema,
  label: z.string(),
  wiki: WikiTitleSchema,
  photo: CommonsFileSchema.optional(),
  results: z.array(RoundResultViewSchema),
  ready: z.array(PlayerIdSchema)
})
const FinalStandingSchema = z.strictObject({
  playerId: PlayerIdSchema,
  total: PointsSchema,
  rounds: z.array(z.strictObject({ score: PointsSchema.optional() }))
})
const PlayedRoundSchema = z.strictObject({
  label: z.string(),
  type: z.enum(QuestionType),
  feature: z.enum(FeatureType).optional(),
  area: z.strictObject({ outline: OutlineIdSchema, centre: LatLonSchema }).optional(),
  ...QuestionPicturesSchema.shape
})
const AwardSchema = z.strictObject({
  emoji: z.string(),
  title: z.string(),
  playerIds: z.array(PlayerIdSchema),
  line: z.string()
})

const LobbyGameViewSchema = z.strictObject({
  ...ViewShape,
  phase: z.literal(Phase.LOBBY),
  you: z.strictObject(SeatedYouShape),
  upcoming: QuestionPicturesSchema.optional()
})
const GuessingGameViewSchema = z.strictObject({
  ...ViewShape,
  phase: z.literal(Phase.GUESSING),
  you: z.strictObject({ ...RoundYouShape, paint: PaintSchema.optional() }),
  round: RoundViewSchema,
  upcoming: QuestionPicturesSchema.optional()
})
const RevealGameViewSchema = z.strictObject({
  ...ViewShape,
  phase: z.literal(Phase.REVEAL),
  you: z.strictObject(RoundYouShape),
  reveal: RevealViewSchema,
  upcoming: QuestionPicturesSchema.optional()
})
const ResultsGameViewSchema = z.strictObject({
  ...ViewShape,
  phase: z.literal(Phase.RESULTS),
  you: z.strictObject(SeatedYouShape),
  results: z.array(FinalStandingSchema),
  playedRounds: z.array(PlayedRoundSchema),
  awards: z.array(AwardSchema)
})

export const GameViewSchema = z.discriminatedUnion("phase", [
  LobbyGameViewSchema,
  GuessingGameViewSchema,
  RevealGameViewSchema,
  ResultsGameViewSchema
])
