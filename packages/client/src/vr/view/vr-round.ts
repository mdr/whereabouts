import type { Points } from "@whereabouts/shared/units"
/** The parts of the headset's round and reveal that practice and a game share. */
import { QuestionType, clueFlag, clueImage, promptOf } from "@whereabouts/shared/questions"
import { onWater, outlineOf, type QuestionView } from "@whereabouts/shared/protocol"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import { VrAnswerType, type VrAnswer, type VrReveal, type VrRound } from "./view"
import { areaNoun, type RevealedAnswer } from "../../round/round"
import { RevealedShapeType } from "../../round/revealed-shape"
import { formatPoints } from "../../ui/format"
import { vrPicture } from "../picture/vr-picture"
import { vrFlagPins } from "../../data/borders"
import { allFlags } from "../../settings/settings"

/** A round as the headset shows it, in practice or a game. */
export interface VrRoundShown {
  question: QuestionView
  /** At the reveal. */
  revealed: RevealedAnswer | undefined
  fact: Fact | undefined
}

/** AnswerMode and AreaInstruction in a line; undefined for a place. */
export function answerModeText(question: Pick<QuestionView, "type" | "answer" | "feature">): string | undefined {
  const area = outlineOf(question.answer) !== undefined
  if (question.type === QuestionType.FLAG)
    return area ? "Paint the whole country: its shape counts." : "Paint where it is: a place, not a shape."
  return area ? `Cover the whole ${areaNoun(question)}: its shape counts.` : undefined
}

/** PaintedIn as a line of text. */
function paintedInText(where: PaintedCountry, answer?: string): string {
  const right = where.country.clue.flag === answer
  return `Your paint: ${Math.round(where.share * 100)}% in ${where.country.label}${right ? ", the answer" : ""}`
}

export function vrRound(
  { question, revealed, fact }: VrRoundShown,
  own: Omit<VrRound, "prompt" | "mode" | "picture" | "water">
): VrRound {
  return {
    ...own,
    prompt: promptOf(question),
    mode: answerModeText(question),
    picture: vrPicture(
      clueImage(question.clue) ?? revealed?.photo,
      clueFlag(question.clue) ?? question.countryFlag,
      revealed && { place: revealed.label, text: fact?.text }
    ),
    water: onWater(question.answer)
  }
}

/** Your score at the reveal, or undefined when you sat the round out. */
export interface VrScore {
  score: Points
  passed: boolean
  total: Points
  /** A flag round: the country most of your paint was in. */
  painted: PaintedCountry | undefined
}

export function vrScoreLine(you: VrScore | undefined, flag: FlagCode | undefined): string {
  if (!you) return "You sat this one out"
  const where = you.painted ? `. ${paintedInText(you.painted, flag)}` : ""
  return `${you.passed ? "Passed: " : ""}${formatPoints(you.score)} this round, ${formatPoints(you.total)} in all${where}`
}

function vrAnswer({ shape, answer }: RevealedAnswer): VrAnswer | undefined {
  if (shape.type === RevealedShapeType.POINT) return { type: VrAnswerType.POINT, point: answer }
  return shape.outline && { type: VrAnswerType.OUTLINE, outline: shape.outline }
}

export function vrReveal(
  { question, fact }: VrRoundShown,
  revealed: RevealedAnswer,
  you: VrScore | undefined,
  borders: Borders | undefined,
  own: Pick<VrReveal, "actions" | "table" | "note" | "paints">
): VrReveal {
  return {
    ...own,
    label: revealed.label,
    answer: vrAnswer(revealed),
    focus: revealed.answer,
    stateRound: question.type === QuestionType.STATE,
    fact: fact?.text,
    scoreLine: vrScoreLine(you, clueFlag(question.clue)),
    flags:
      question.type === QuestionType.FLAG
        ? {
            on: allFlags.value,
            toggle: () => (allFlags.value = !allFlags.value),
            pins: borders && vrFlagPins(borders)
          }
        : undefined
  }
}
