/** The parts of the headset's round and reveal that practice and a game share. */
import { isWater } from "@whereabouts/shared/questions"
import type { QuestionView } from "@whereabouts/shared/protocol"
import type { Fact } from "@whereabouts/shared/facts"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { VrReveal, VrRound } from "./vr/view"
import type { RevealedAnswer } from "./round"
import { vrPicture } from "./vr-picture"
import { vrFlagPins } from "./borders"
import { allFlags } from "./settings"

/** A round as the headset shows it, in practice or a game. */
export interface VrRoundShown {
  question: QuestionView
  /** A country round's own flag, beside its name. */
  countryFlag: FlagCode | undefined
  /** At the reveal. */
  revealed: RevealedAnswer | undefined
  fact: Fact | undefined
}

export const pts = (n: number) => `${Math.round(n).toLocaleString()} pts`

/** AnswerMode and RegionHint in a line; undefined for a place. */
export function answerModeText(q: Pick<QuestionView, "flag" | "regionId" | "topic">): string | undefined {
  const area = q.regionId !== undefined
  if (q.flag) return area ? "Paint the whole country: its shape counts." : "Paint where it is: a place, not a shape."
  return area ? `Cover the whole ${q.topic ?? "country"}: its shape counts.` : undefined
}

/** PaintedIn as a line of text. */
function paintedInText(where: PaintedCountry, answer?: string): string {
  const right = where.country.flag === answer
  return `Your paint: ${Math.round(where.share * 100)}% in ${where.country.label}${right ? ", the answer" : ""}`
}

export function vrRound(
  { question, countryFlag, revealed, fact }: VrRoundShown,
  own: Omit<VrRound, "prompt" | "mode" | "picture" | "water">
): VrRound {
  return {
    ...own,
    prompt: question.prompt,
    mode: answerModeText(question),
    picture: vrPicture(
      question.image ?? revealed?.photo,
      question.flag ?? countryFlag,
      revealed && { place: revealed.label, text: fact?.text }
    ),
    water: isWater(question.topic)
  }
}

/** Your score at the reveal, or undefined when you sat the round out. */
export interface VrScore {
  score: number
  passed: boolean
  total: number
  /** A flag round: the country most of your paint was in. */
  painted: PaintedCountry | undefined
}

export function vrScoreLine(you: VrScore | undefined, flag: FlagCode | undefined): string {
  if (!you) return "You sat this one out"
  const where = you.painted ? `. ${paintedInText(you.painted, flag)}` : ""
  return `${you.passed ? "Passed: " : ""}${pts(you.score)} this round, ${pts(you.total)} in all${where}`
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
    answer: revealed.outline ? { outline: revealed.outline } : { point: revealed.answer },
    focus: revealed.answer,
    stateRound: question.topic === "state",
    fact: fact?.text,
    scoreLine: vrScoreLine(you, question.flag),
    flags: question.flag && {
      on: allFlags.value,
      toggle: () => (allFlags.value = !allFlags.value),
      pins: borders && vrFlagPins(borders)
    }
  }
}
