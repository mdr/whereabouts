/** What players are sent of a question: never where its answer is until the reveal. */
import { revealPhoto } from "../catalogue/photos.ts"
import { HintAxis, hintBand, seededUnit, type HintBand } from "../hints.ts"
import {
  flagShown,
  type AnswerView,
  type AreaAnswerView,
  type GuessingGameView,
  type PlayedRound,
  type PointAnswerView,
  type QuestionPictures,
  type QuestionView,
  type RoundResultView,
  type RoundReveal
} from "../protocol/views.ts"
import type { Instant } from "../units.ts"
import {
  AnswerType,
  ClueType,
  QuestionType,
  answerCentre,
  type Answer,
  type AreaAnswer,
  type PointAnswer,
  type Question
} from "../questions.ts"

const pointAnswerView = ({ type, tolerance }: PointAnswer): PointAnswerView => ({ type, tolerance })

const areaAnswerView = ({ type, tolerance, outline, surface }: AreaAnswer): AreaAnswerView => ({
  type,
  tolerance,
  outline,
  surface
})

const answerView = (answer: Answer): AnswerView =>
  answer.type === AnswerType.AREA ? areaAnswerView(answer) : pointAnswerView(answer)

/** A question while it is asked. */
export const questionView = (question: Question): QuestionView => {
  // One case per type: combined cases lose the correlation of clue and answer.
  switch (question.type) {
    case QuestionType.LANDMARK:
      return { type: question.type, clue: question.clue, answer: pointAnswerView(question.answer) }
    case QuestionType.PLACE:
      return { type: question.type, clue: question.clue, answer: pointAnswerView(question.answer) }
    case QuestionType.COUNTRY:
      return {
        type: question.type,
        clue: question.clue,
        answer: areaAnswerView(question.answer),
        ...(question.countryFlag ? { countryFlag: question.countryFlag } : {})
      }
    case QuestionType.FLAG:
      return { type: question.type, clue: question.clue, answer: answerView(question.answer) }
    case QuestionType.FEATURE:
      return {
        type: question.type,
        feature: question.feature,
        clue: question.clue,
        answer: areaAnswerView(question.answer)
      }
    case QuestionType.STATE:
      return { type: question.type, clue: question.clue, answer: answerView(question.answer) }
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
export const roundHintBand = (question: Question, seed: number, roundIndex: number, axis: HintAxis): HintBand => {
  const unit = seededUnit(seed, roundIndex, axis === HintAxis.LATITUDE ? 1 : 2)
  return hintBand(answerCentre(question.answer), question.answer.tolerance, axis, unit)
}

/** A question's photo and flag, including the flag shown beside a country's name, and the photo for its reveal. */
export const questionPictures = (question: Question): QuestionPictures => {
  const flag = flagShown(question)
  const photo = revealPhoto(question)
  return {
    ...(question.clue.type === ClueType.PHOTO ? { image: question.clue.image } : {}),
    ...(flag ? { flag } : {}),
    ...(photo ? { revealPhoto: photo } : {})
  }
}

/** The pictures to fetch ahead for a question, if it has any. */
export const upcomingOf = (question: Question | undefined): { upcoming?: QuestionPictures } => {
  const pictures = question ? questionPictures(question) : {}
  return Object.keys(pictures).length > 0 ? { upcoming: pictures } : {}
}

/** A round's answer and everyone's results, for its reveal. */
export const revealOf = (
  question: Question,
  { index, total }: { index: number; total: number },
  results: RoundResultView[]
): RoundReveal => {
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
export const playedRound = (question: Question): PlayedRound => {
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
