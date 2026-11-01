import type { QuestionMix } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_LOOKS } from "../../question-types"

/** "4 landmarks · 1 flag": the types a game asks, in the host's order. */
export function describeMix(mix: QuestionMix): string {
  return QUESTION_TYPES.filter((type) => mix[type] > 0)
    .map((type) => `${mix[type]} ${QUESTION_TYPE_LOOKS[type].unit[mix[type] === 1 ? 0 : 1]}`)
    .join(" · ")
}
