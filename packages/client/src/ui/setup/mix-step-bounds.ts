import { MAX_ROUNDS, mixTotal, type QuestionMix } from "@whereabouts/shared/protocol/config"
import type { QuestionType } from "@whereabouts/shared/questions"

/** How far one type's count can step: a game has at least one round and at most MAX_ROUNDS. */
export const mixStepBounds = (mix: QuestionMix, type: QuestionType): { min: number; max: number } => {
  const others = mixTotal(mix) - mix[type]
  return { min: others === 0 ? 1 : 0, max: MAX_ROUNDS - others }
}
