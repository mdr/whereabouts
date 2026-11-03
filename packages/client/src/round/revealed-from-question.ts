import { revealPhoto } from "@whereabouts/shared/catalogue/photos"
import { answerCentre, type Outlines, type Question } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "./round"
import { revealedShape } from "./revealed-shape"

/** The answer from the full question, for the practice dev tools to show it before the reveal. */
export const revealedFromQuestion = (question: Question, outlines: Outlines): RevealedAnswer => ({
  label: question.label,
  wiki: question.wiki,
  answer: answerCentre(question.answer),
  shape: revealedShape(question.answer, outlines),
  photo: revealPhoto(question)
})
