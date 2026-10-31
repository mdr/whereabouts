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
  type PlayerView,
  type QuestionView,
  type RevealView,
  type RoundResultView,
  Phase,
  MapDetail
} from "@whereabouts/shared/protocol"
import { AnswerType, ClueType, QuestionType, Surface, type FlagQuestion } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring"
import { h3Res } from "@whereabouts/shared/h3"

type ViewOverrides = Partial<Omit<GameView, "you">> & { you?: Partial<GameView["you"]> }

/** A lobby view of one player, with whatever a test needs changed. */
export function makeView({ you, ...over }: ViewOverrides = {}): GameView {
  return {
    code: roomCode("AB12"),
    phase: Phase.LOBBY,
    config: {
      roundLength: 60_000,
      mix: mixOf({ [QuestionType.LANDMARK]: 5 }),
      mapDetail: MapDetail.MINIMAL,
      kernelId: KernelId.MULTI_EQUAL,
      hints: 0
    },
    serverTime: 0,
    you: { id: playerId("p1"), isHost: true, sittingOut: false, watching: false, locked: false, hintsLeft: 0, ...you },
    players: [],
    ...over
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
