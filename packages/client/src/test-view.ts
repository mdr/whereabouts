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
import {
  mixOf,
  type GameView,
  type GuessingGameView,
  type LobbyGameView,
  type ResultsGameView,
  type RevealGameView,
  type YouView,
  type PlayerView,
  type QuestionView,
  type RevealView,
  type RoundResultView,
  Phase,
  MapDetail
} from "@whereabouts/shared/protocol"
import { AnswerType, ClueType, QuestionType, Surface, type FlagQuestion } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { h3Res } from "@whereabouts/shared/h3"

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
    players: []
  }
}

const makeYou = (): YouView => ({
  id: playerId("p1"),
  isHost: true,
  sittingOut: false,
  watching: false,
  locked: false,
  hintsLeft: 0
})

/** A lobby view of one player, with whatever a test needs changed. */
export function makeLobbyView({ you, ...over }: ViewOverrides<LobbyGameView> = {}): LobbyGameView {
  return { ...viewBase(), you: { ...makeYou(), ...you }, ...over, phase: Phase.LOBBY }
}

/** A view of the first of five rounds under way. */
export function makeGuessingView({ you, ...over }: ViewOverrides<GuessingGameView> = {}): GuessingGameView {
  return {
    ...viewBase(),
    you: { ...makeYou(), ...you },
    round: { index: 0, total: 5, question: makeQuestionView(), deadline: 0 },
    ...over,
    phase: Phase.GUESSING
  }
}

/** A view of the first of five rounds revealed. */
export function makeRevealView({ you, ...over }: ViewOverrides<RevealGameView> = {}): RevealGameView {
  return { ...viewBase(), you: { ...makeYou(), ...you }, reveal: makeReveal(), ...over, phase: Phase.REVEAL }
}

/** A view of the final results of a game nobody scored in. */
export function makeResultsView({ you, ...over }: ViewOverrides<ResultsGameView> = {}): ResultsGameView {
  return {
    ...viewBase(),
    you: { ...makeYou(), ...you },
    results: [],
    playedRounds: [],
    awards: [],
    ...over,
    phase: Phase.RESULTS
  }
}

/** Alice, the host, connected and playing, with whatever a test needs changed. */
export function makePlayer(over: Partial<PlayerView> = {}): PlayerView {
  return {
    id: playerId("p1"),
    name: playerName("Alice"),
    colour: playerColour(0),
    watching: false,
    connected: true,
    isHost: true,
    locked: false,
    score: 0,
    rank: 1,
    ...over
  }
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
    results: [],
    ready: [],
    ...over
  }
}

/** Alice's point-round result, scored but unpainted unless the test says. */
export function makeResult(over: Partial<RoundResultView> = {}): RoundResultView {
  return { playerId: playerId("p1"), score: 500, parts: { type: AnswerType.POINT, A: 0, B: 0 }, res: h3Res(5), ...over }
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
