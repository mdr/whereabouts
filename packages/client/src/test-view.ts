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
import { AnswerType, ClueType, QuestionType, Surface, type FlagQuestion } from "@whereabouts/shared/questions"
import {
  Role,
  YouRoleType,
  type PlayingPlayerView,
  type SpectatorView,
  type YouPlaying
} from "@whereabouts/shared/roles"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { h3Cell, h3Res } from "@whereabouts/shared/h3"

type ViewOverrides<V extends GameView> = Partial<Omit<V, "you" | "phase">> & { you?: Partial<V["you"]> }

function viewBase() {
  return {
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
  }
}

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
export function makeLobbyView({ you, ...over }: ViewOverrides<LobbyGameView> = {}): LobbyGameView {
  return { ...viewBase(), you: { ...youBase(), role: seated(), ...you }, ...over, phase: Phase.LOBBY }
}

/** A view of the first of five rounds under way. */
export function makeGuessingView({ you, ...over }: ViewOverrides<GuessingGameView> = {}): GuessingGameView {
  return {
    ...viewBase(),
    you: { ...youBase(), role: makePlaying(), ...you },
    round: { index: 0, total: 5, question: makeQuestionView(), deadline: 0 },
    ...over,
    phase: Phase.GUESSING
  }
}

/** A view of the first of five rounds revealed. */
export function makeRevealView({ you, ...over }: ViewOverrides<RevealGameView> = {}): RevealGameView {
  return {
    ...viewBase(),
    you: { ...youBase(), role: makePlaying(), ...you },
    reveal: makeReveal(),
    ...over,
    phase: Phase.REVEAL
  }
}

/** A view of the final results of a game nobody scored in. */
export function makeResultsView({ you, ...over }: ViewOverrides<ResultsGameView> = {}): ResultsGameView {
  return {
    ...viewBase(),
    you: { ...youBase(), role: seated(), ...you },
    results: [],
    playedRounds: [],
    awards: [],
    ...over,
    phase: Phase.RESULTS
  }
}

/** Alice, the host, connected and playing, with whatever a test needs changed. */
export function makePlayer(over: Partial<PlayingPlayerView> = {}): PlayingPlayerView {
  return {
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
  }
}

/** Sam, connected and watching, with whatever a test needs changed. */
export function makeSpectator(over: Partial<SpectatorView> = {}): SpectatorView {
  return { type: Role.SPECTATOR, id: playerId("p9"), name: playerName("Sam"), connected: true, isHost: false, ...over }
}

/** The first of five reveals, of a place, with no results yet. */
export function makeReveal(over: Partial<RevealView> = {}): RevealView {
  return {
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
  }
}

/** Alice's result, a pass unless the test says. */
export function makeResult(over: Partial<RoundResultView> = {}): RoundResultView {
  return { playerId: playerId("p1"), score: 500, guess: { type: RoundGuessType.PASSED }, ...over }
}

/** A point-round guess with a little paint. */
export function makePainted(): RoundGuess {
  return {
    type: RoundGuessType.PAINTED,
    paint: { cells: { [h3Cell("85283473fffffff")]: 1 }, floor: 0.05 },
    res: h3Res(5),
    parts: { type: AnswerType.POINT, A: 0, B: 0 }
  }
}

/** A place question as players see it, with whatever a test needs changed. */
export function makeQuestionView(over: Partial<QuestionView> = {}): QuestionView {
  return {
    type: QuestionType.PLACE,
    clue: { type: ClueType.NAME, prompt: "Where is Kyoto?" },
    answer: { type: AnswerType.POINT, tolerance: 50 },
    ...over
  }
}

/** The answer of an area round, as players see it while guessing. */
export function areaAnswerView(outline: string, tolerance = 200, surface = Surface.LAND): QuestionView["answer"] {
  return { type: AnswerType.AREA, tolerance, outline: outlineId(outline), surface }
}

/** A country's flag round, marked as a point unless the answer says otherwise. */
export function makeFlagQuestion(flag: string, label: string, over: Partial<FlagQuestion> = {}): FlagQuestion {
  return {
    type: QuestionType.FLAG,
    id: questionId(`flag-${flag}`),
    place: placeId(flag),
    label,
    wiki: wikiTitle(`Flag of ${label}`),
    clue: { type: ClueType.FLAG, flag: flagCode(flag) },
    answer: { type: AnswerType.POINT, at: { lat: 0, lon: 0 }, tolerance: 100 },
    ...over
  }
}
