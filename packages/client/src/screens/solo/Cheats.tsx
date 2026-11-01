import { KERNELS, KernelIdSchema, type ChoosableKernel } from "@whereabouts/shared/scoring/scoring"
import type { ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType, type Question } from "@whereabouts/shared/questions"
import { Card } from "../../ui/Card/Card"
import kit from "../../ui/kit.module.css"
import { cheatLiveScore, soloKernelId } from "../../settings/settings"
import { CopyCase } from "./CopyCase/CopyCase"

export function Cheats({
  question,
  answer,
  kernel
}: {
  question: Question
  answer: ScoredAnswer
  kernel: ChoosableKernel
}) {
  return (
    <Card title="Cheats">
      <label class={kit.check}>
        <input
          type="checkbox"
          checked={cheatLiveScore.value}
          onChange={(e) => (cheatLiveScore.value = e.currentTarget.checked)}
        />{" "}
        Show live score and the real answer while painting
      </label>
      {answer.type === AnswerType.AREA ? (
        <p class={kit.hint}>Countries score by shape and nearness, with their own kernel: see regions.ts.</p>
      ) : (
        <label class={kit.check}>
          Scoring kernel{" "}
          <select
            value={soloKernelId.value}
            onChange={(e) => (soloKernelId.value = KernelIdSchema.parse(e.currentTarget.value))}
            style={{ flex: 1 }}
          >
            {KERNELS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <CopyCase question={question} answer={answer} kernel={kernel} />
    </Card>
  )
}
