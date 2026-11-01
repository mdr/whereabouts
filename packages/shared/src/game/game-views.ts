/** What players are sent of a question: never where its answer is until the reveal. */
import { revealPhoto } from "../catalogue/photos.ts"
import { HintAxis, hintBand, seededUnit, type HintBand } from "../hints.ts"
import type {
  GuessingGameView,
  PlayedRound,
  QuestionPictures,
  QuestionView,
  RoundResultView,
  RoundReveal
} from "../protocol.ts"
import type { Instant } from "../units.ts"
import { AnswerType, ClueType, QuestionType, answerCentre, flagShown, type Question } from "../questions.ts"

/**
 * A question while it is asked. An area round sends its outline's id, which
 * the prompt or the flag gives away anyway.
 */
export function questionView(q: Question): QuestionView {
  const { answer } = q
  return {
    type: q.type,
    clue: q.clue,
    answer:
      answer.type === AnswerType.AREA
        ? { type: answer.type, tolerance: answer.tolerance, outline: answer.outline, surface: answer.surface }
        : { type: answer.type, tolerance: answer.tolerance },
    ...(q.type === QuestionType.FEATURE ? { feature: q.feature } : {}),
    ...(q.type === QuestionType.COUNTRY && q.countryFlag ? { countryFlag: q.countryFlag } : {})
  }
}

/** A round being guessed. */
export const roundView = (q: Question, index: number, total: number, deadline: Instant): GuessingGameView["round"] => ({
  index,
  total,
  question: questionView(q),
  deadline
})

/** A round's band of each axis: the same for everyone who asks. */
export function roundHintBand(q: Question, seed: number, roundIndex: number, axis: HintAxis): HintBand {
  const u = seededUnit(seed, roundIndex, axis === HintAxis.LATITUDE ? 1 : 2)
  return hintBand(answerCentre(q.answer), q.answer.tolerance, axis, u)
}

/** A question's photo and flag, including the flag shown beside a country's name, and the photo for its reveal. */
export function questionPictures(q: Question): QuestionPictures {
  const flag = flagShown(q)
  const photo = revealPhoto(q)
  return {
    ...(q.clue.type === ClueType.PHOTO ? { image: q.clue.image } : {}),
    ...(flag ? { flag } : {}),
    ...(photo ? { revealPhoto: photo } : {})
  }
}

/** The pictures to fetch ahead for a question, if it has any. */
export function upcomingOf(q: Question | undefined): { upcoming?: QuestionPictures } {
  const pictures = q ? questionPictures(q) : {}
  return Object.keys(pictures).length > 0 ? { upcoming: pictures } : {}
}

/** A round's answer and everyone's results, for its reveal. */
export function revealOf(
  q: Question,
  { index, total }: { index: number; total: number },
  results: RoundResultView[]
): RoundReveal {
  const photo = revealPhoto(q)
  return {
    index,
    total,
    question: questionView(q),
    answer: answerCentre(q.answer),
    place: q.place,
    label: q.label,
    wiki: q.wiki,
    ...(photo ? { photo } : {}),
    results
  }
}

/** A round as the final results list it. */
export function playedRound(q: Question): PlayedRound {
  return {
    label: q.label,
    type: q.type,
    ...(q.type === QuestionType.FEATURE ? { feature: q.feature } : {}),
    ...(q.answer.type === AnswerType.AREA && q.clue.type === ClueType.NAME
      ? { area: { outline: q.answer.outline, centre: q.answer.centre } }
      : {}),
    ...questionPictures(q)
  }
}
