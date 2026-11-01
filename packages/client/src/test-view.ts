import { playerColour } from "@whereabouts/shared/colours"
import {
  flagCode,
  outlineId,
  placeId,
  playerId,
  playerName,
  questionId,
  roomCode,
  wikiTitle
} from "@whereabouts/shared/ids"
import { mixOf, MapDetail } from "@whereabouts/shared/protocol/config"
import {
  type AnswerView,
  type AreaAnswerView,
  type FinalStanding,
  type GameView,
  type GuessingGameView,
  type LobbyGameView,
  type ResultsGameView,
  type RevealGameView,
  type QuestionView,
  type RevealView,
  RoundGuessType,
  type RoundGuess,
  type RoundResultView,
  Phase
} from "@whereabouts/shared/protocol/views"
import {
  AnswerType,
  ClueType,
  QuestionType,
  Surface,
  type FeatureType,
  type FlagQuestion
} from "@whereabouts/shared/questions"
import {
  Role,
  YouRoleType,
  type PlayingPlayerView,
  type SpectatorView,
  type YouPlaying
} from "@whereabouts/shared/roles"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { h3Cell, h3Resolution } from "@whereabouts/shared/h3"

type ViewOverrides<V extends GameView> = Partial<Omit<V, "you" | "phase">> & { you?: Partial<V["you"]> }

const viewBase = () => ({
  code: roomCode("AB12"),
  config: {
    roundLength: 60_000,
    mix: mixOf({ [QuestionType.LANDMARK]: 5 }),
    mapDetail: MapDetail.MINIMAL,
    kernelId: KernelId.MULTI_EQUAL,
    hints: 0
  },
  serverTime: 0,
  players: [],
  spectators: []
})

const youBase = () => ({ id: playerId("p1"), name: playerName("Alice"), isHost: true })

const seated = () => ({ type: YouRoleType.PLAYING, colour: playerColour(0) }) as const

/** Alice playing the round, with whatever a test needs changed. */
export const makePlaying = (over: Partial<YouPlaying> = {}): YouPlaying => ({
  ...seated(),
  locked: false,
  hintsLeft: 0,
  ...over
})

export const JOINED_LATE = { type: YouRoleType.JOINED_LATE, colour: playerColour(0) } as const

export const SPECTATING = { type: YouRoleType.SPECTATOR } as const

/** A lobby view of one player, with whatever a test needs changed. */
export const makeLobbyView = ({ you, ...over }: ViewOverrides<LobbyGameView> = {}): LobbyGameView => ({
  ...viewBase(),
  you: { ...youBase(), role: seated(), ...you },
  ...over,
  phase: Phase.LOBBY
})

/** A view of the first of five rounds under way. */
export const makeGuessingView = ({ you, ...over }: ViewOverrides<GuessingGameView> = {}): GuessingGameView => ({
  ...viewBase(),
  you: { ...youBase(), role: makePlaying(), ...you },
  round: { index: 0, total: 5, question: makeQuestionView(), deadline: 0 },
  ...over,
  phase: Phase.GUESSING
})

/** A view of the first of five rounds revealed. */
export const makeRevealView = ({ you, ...over }: ViewOverrides<RevealGameView> = {}): RevealGameView => ({
  ...viewBase(),
  you: { ...youBase(), role: makePlaying(), ...you },
  reveal: makeReveal(),
  ...over,
  phase: Phase.REVEAL
})

/** A view of the final results of a game nobody scored in. */
export const makeResultsView = ({ you, ...over }: ViewOverrides<ResultsGameView> = {}): ResultsGameView => ({
  ...viewBase(),
  you: { ...youBase(), role: seated(), ...you },
  results: [],
  playedRounds: [],
  awards: [],
  ...over,
  phase: Phase.RESULTS
})

/** Alice, the host, connected and playing, with whatever a test needs changed. */
export const makePlayer = (over: Partial<PlayingPlayerView> = {}): PlayingPlayerView => ({
  type: Role.PLAYER,
  id: playerId("p1"),
  name: playerName("Alice"),
  colour: playerColour(0),
  connected: true,
  isHost: true,
  locked: false,
  score: 0,
  rank: 1,
  ...over
})

/** Sam, connected and watching, with whatever a test needs changed. */
export const makeSpectator = (over: Partial<SpectatorView> = {}): SpectatorView => ({
  type: Role.SPECTATOR,
  id: playerId("p9"),
  name: playerName("Sam"),
  connected: true,
  isHost: false,
  ...over
})

/** The first of five reveals, of a place, with no results yet. */
export const makeReveal = (over: Partial<RevealView> = {}): RevealView => ({
  index: 0,
  total: 5,
  question: makeQuestionView(),
  answer: { lat: 35, lon: 135.8 },
  place: placeId("kyoto"),
  label: "Kyoto",
  wiki: wikiTitle("Kyoto"),
  results: [],
  ready: [],
  ...over
})

/** Alice's result, a pass unless the test says. */
export const makeResult = (over: Partial<RoundResultView> = {}): RoundResultView => ({
  playerId: playerId("p1"),
  score: 500,
  guess: { type: RoundGuessType.PASSED },
  ...over
})

/** Alice's standing, with no rounds unless the test says. */
export const makeStanding = (over: Partial<FinalStanding> = {}): FinalStanding => ({
  playerId: playerId("p1"),
  name: playerName("Alice"),
  colour: playerColour(0),
  total: 0,
  rounds: [],
  ...over
})

/** A point-round guess with a little paint. */
export const makePainted = (): RoundGuess => ({
  type: RoundGuessType.PAINTED,
  paint: { cells: { [h3Cell("85283473fffffff")]: 1 }, floor: 0.05 },
  resolution: h3Resolution(5),
  parts: { type: AnswerType.POINT, A: 0, B: 0 }
})

type QuestionViewOf<T extends QuestionType> = Extract<QuestionView, { type: T }>

/** A place question as players see it, with whatever a test needs changed. */
export const makeQuestionView = (
  over: Partial<QuestionViewOf<QuestionType.PLACE>> = {}
): QuestionViewOf<QuestionType.PLACE> => ({
  type: QuestionType.PLACE,
  clue: { type: ClueType.NAME, prompt: "Where is Kyoto?" },
  answer: { type: AnswerType.POINT, tolerance: 50 },
  ...over
})

/** The answer of an area round, as players see it while guessing. */
export const areaAnswerView = (outline: string, tolerance = 200, surface = Surface.LAND): AreaAnswerView => ({
  type: AnswerType.AREA,
  tolerance,
  outline: outlineId(outline),
  surface
})

/** Peru as a country round, with whatever a test needs changed. */
export const makeCountryQuestionView = (
  over: Partial<QuestionViewOf<QuestionType.COUNTRY>> = {}
): QuestionViewOf<QuestionType.COUNTRY> => ({
  type: QuestionType.COUNTRY,
  clue: { type: ClueType.NAME, prompt: "Paint the whole of Peru" },
  answer: areaAnswerView("peru"),
  ...over
})

/** An island, lake or sea round. */
export const makeFeatureQuestionView = (
  feature: FeatureType,
  outline: string,
  surface = Surface.LAND
): QuestionViewOf<QuestionType.FEATURE> => ({
  type: QuestionType.FEATURE,
  feature,
  clue: { type: ClueType.NAME, prompt: `Paint the ${feature.toLowerCase()}` },
  answer: areaAnswerView(outline, 100, surface)
})

/** A flag round, marked as a point unless the answer says otherwise. */
export const makeFlagQuestionView = (
  flag: string,
  answer: AnswerView = { type: AnswerType.POINT, tolerance: 20 }
): QuestionViewOf<QuestionType.FLAG> => ({
  type: QuestionType.FLAG,
  clue: { type: ClueType.FLAG, flag: flagCode(flag) },
  answer
})

/** A US state painted whole. */
export const makeStateQuestionView = (outline: string): QuestionViewOf<QuestionType.STATE> => ({
  type: QuestionType.STATE,
  clue: { type: ClueType.NAME, prompt: "Paint the whole state" },
  answer: areaAnswerView(outline)
})

/** A country's flag round, marked as a point unless the answer says otherwise. */
export const makeFlagQuestion = (flag: string, label: string, over: Partial<FlagQuestion> = {}): FlagQuestion => ({
  type: QuestionType.FLAG,
  id: questionId(`flag-${flag}`),
  place: placeId(flag),
  label,
  wiki: wikiTitle(`Flag of ${label}`),
  clue: { type: ClueType.FLAG, flag: flagCode(flag) },
  answer: { type: AnswerType.POINT, at: { lat: 0, lon: 0 }, tolerance: 100 },
  ...over
})
