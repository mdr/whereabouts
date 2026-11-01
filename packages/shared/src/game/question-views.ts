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
  type Picture,
  PictureType,
  type ShapePicture,
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

/** A question's one picture, if it has one (each type has at most one): its photo, its flag, or its reveal's photo. */
export const questionPicture = (question: Question): Picture | undefined => {
  if (question.clue.type === ClueType.PHOTO) return { type: PictureType.PHOTO, photo: question.clue.image }
  const flag = flagShown(question)
  if (flag) return { type: PictureType.FLAG, flag }
  const photo = revealPhoto(question)
  return photo ? { type: PictureType.PHOTO, photo } : undefined
}

/** The picture to fetch ahead for a question, if it has one. */
export const upcomingOf = (question: Question | undefined): { upcoming?: Picture } => {
  const picture = question && questionPicture(question)
  return picture ? { upcoming: picture } : {}
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

const shapePicture = ({ outline, centre }: AreaAnswer): ShapePicture => ({ type: PictureType.SHAPE, outline, centre })

const NO_PICTURE = { type: PictureType.NONE } as const

/** A round as the final results list it. */
export const playedRound = (question: Question): PlayedRound => {
  const { label } = question
  switch (question.type) {
    case QuestionType.COUNTRY:
      return {
        type: question.type,
        label,
        picture: shapePicture(question.answer),
        ...(question.countryFlag ? { countryFlag: question.countryFlag } : {})
      }
    case QuestionType.FEATURE:
      return { type: question.type, label, feature: question.feature, picture: shapePicture(question.answer) }
    case QuestionType.STATE:
      return {
        type: question.type,
        label,
        picture:
          question.answer.type === AnswerType.AREA
            ? shapePicture(question.answer)
            : (questionPicture(question) ?? NO_PICTURE)
      }
    case QuestionType.LANDMARK:
    case QuestionType.PLACE:
    case QuestionType.FLAG:
      return { type: question.type, label, picture: questionPicture(question) ?? NO_PICTURE }
  }
}
