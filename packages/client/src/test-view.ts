import { flagCode, outlineId, playerId, questionId, roomCode } from "@whereabouts/shared/ids"
import { mixOf, type GameView, type QuestionView } from "@whereabouts/shared/protocol"
import { AnswerType, ClueType, QuestionType, Surface, type FlagQuestion } from "@whereabouts/shared/questions"

type ViewOverrides = Partial<Omit<GameView, "you">> & { you?: Partial<GameView["you"]> }

/** A lobby view of one player, with whatever a test needs changed. */
export function makeView({ you, ...over }: ViewOverrides = {}): GameView {
  return {
    code: roomCode("AB12"),
    phase: "lobby",
    config: {
      rounds: 5,
      roundMs: 60_000,
      mix: mixOf({ [QuestionType.LANDMARK]: 5 }),
      mapDetail: "minimal",
      kernelId: "multi-equal",
      hints: 0
    },
    serverTime: 0,
    you: { id: playerId("p1"), isHost: true, spectating: false, watching: false, locked: false, hintsLeft: 0, ...you },
    players: [],
    ...over
  }
}

/** A place question as players see it, with whatever a test needs changed. */
export function makeQuestionView(over: Partial<QuestionView> = {}): QuestionView {
  return {
    type: QuestionType.PLACE,
    prompt: "Where is Kyoto?",
    clue: { type: ClueType.NAME, prompt: "Where is Kyoto?" },
    answer: { type: AnswerType.POINT, toleranceKm: 50 },
    ...over
  }
}

/** The answer of an area round, as players see it while guessing. */
export function areaAnswerView(outline: string, toleranceKm = 200, surface = Surface.LAND): QuestionView["answer"] {
  return { type: AnswerType.AREA, toleranceKm, outline: outlineId(outline), surface }
}

/** A country's flag round, marked as a point unless the answer says otherwise. */
export function makeFlagQuestion(flag: string, label: string, over: Partial<FlagQuestion> = {}): FlagQuestion {
  return {
    type: QuestionType.FLAG,
    id: questionId(`flag-${flag}`),
    label,
    wiki: `Flag of ${label}`,
    clue: { type: ClueType.FLAG, flag: flagCode(flag) },
    answer: { type: AnswerType.POINT, at: { lat: 0, lon: 0 }, toleranceKm: 100 },
    ...over
  }
}
