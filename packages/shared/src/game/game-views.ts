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
export function questionView(question: Question): QuestionView {
  const { answer } = question
  return {
    type: question.type,
    clue: question.clue,
    answer:
      answer.type === AnswerType.AREA
        ? { type: answer.type, tolerance: answer.tolerance, outline: answer.outline, surface: answer.surface }
        : { type: answer.type, tolerance: answer.tolerance },
    ...(question.type === QuestionType.FEATURE ? { feature: question.feature } : {}),
    ...(question.type === QuestionType.COUNTRY && question.countryFlag ? { countryFlag: question.countryFlag } : {})
  }
}

/** A round being guessed. */
export const roundView = (
  question: Question,
  index: number,
  total: number,
  deadline: Instant
): GuessingGameView["round"] => ({
  index,
  total,
  question: questionView(question),
  deadline
})

/** A round's band of each axis: the same for everyone who asks. */
export function roundHintBand(question: Question, seed: number, roundIndex: number, axis: HintAxis): HintBand {
  const unit = seededUnit(seed, roundIndex, axis === HintAxis.LATITUDE ? 1 : 2)
  return hintBand(answerCentre(question.answer), question.answer.tolerance, axis, unit)
}

/** A question's photo and flag, including the flag shown beside a country's name, and the photo for its reveal. */
export function questionPictures(question: Question): QuestionPictures {
  const flag = flagShown(question)
  const photo = revealPhoto(question)
  return {
    ...(question.clue.type === ClueType.PHOTO ? { image: question.clue.image } : {}),
    ...(flag ? { flag } : {}),
    ...(photo ? { revealPhoto: photo } : {})
  }
}

/** The pictures to fetch ahead for a question, if it has any. */
export function upcomingOf(question: Question | undefined): { upcoming?: QuestionPictures } {
  const pictures = question ? questionPictures(question) : {}
  return Object.keys(pictures).length > 0 ? { upcoming: pictures } : {}
}

/** A round's answer and everyone's results, for its reveal. */
export function revealOf(
  question: Question,
  { index, total }: { index: number; total: number },
  results: RoundResultView[]
): RoundReveal {
  const photo = revealPhoto(question)
  return {
    index,
    total,
    question: questionView(question),
    answer: answerCentre(question.answer),
    place: question.place,
    label: question.label,
    wiki: question.wiki,
    ...(photo ? { photo } : {}),
    results
  }
}

/** A round as the final results list it. */
export function playedRound(question: Question): PlayedRound {
  return {
    label: question.label,
    type: question.type,
    ...(question.type === QuestionType.FEATURE ? { feature: question.feature } : {}),
    ...(question.answer.type === AnswerType.AREA && question.clue.type === ClueType.NAME
      ? { area: { outline: question.answer.outline, centre: question.answer.centre } }
      : {}),
    ...questionPictures(question)
  }
}
