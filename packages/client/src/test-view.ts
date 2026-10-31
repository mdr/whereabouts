import { flagCode, outlineId, placeId, playerId, questionId, roomCode, wikiTitle } from "@whereabouts/shared/ids"
import { mixOf, type GameView, type QuestionView, Phase, MapDetail } from "@whereabouts/shared/protocol"
import { AnswerType, ClueType, QuestionType, Surface, type FlagQuestion } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring"

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
