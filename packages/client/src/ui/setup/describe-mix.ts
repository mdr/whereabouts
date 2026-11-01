import type { QuestionMix } from "@whereabouts/shared/protocol"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_LOOKS } from "../../question-types"

/** "4 landmarks · 1 flag": the types a game asks, in the host's order. */
export function describeMix(mix: QuestionMix): string {
  return QUESTION_TYPES.filter((t) => mix[t] > 0)
    .map((t) => `${mix[t]} ${QUESTION_TYPE_LOOKS[t].unit[mix[t] === 1 ? 0 : 1]}`)
    .join(" · ")
}
