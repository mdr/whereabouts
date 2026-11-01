import type { QuestionMix } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_DISPLAY_INFO } from "../../question-types"

/** "4 landmarks · 1 flag": the types a game asks, in the host's order. */
export const describeMix = (mix: QuestionMix): string =>
  QUESTION_TYPES.filter((type) => mix[type] > 0)
    .map((type) => {
      const { singularForm, pluralForm } = QUESTION_TYPE_DISPLAY_INFO[type]
      return `${mix[type]} ${mix[type] === 1 ? singularForm : pluralForm}`
    })
    .join(" · ")
