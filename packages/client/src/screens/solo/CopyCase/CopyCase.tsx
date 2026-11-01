import { useEffect, useState } from "preact/hooks"
import { buildDistribution, type ChoosableKernel } from "@whereabouts/shared/scoring/scoring"
import { scoreAnswer, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { RegionKernel, encodeCase } from "@whereabouts/shared/scoring/scoring-case"
import { caseQuestion } from "@whereabouts/shared/scoring/score-review"
import { AnswerType, type Question } from "@whereabouts/shared/questions"
import { usePaint } from "../../../ui/map/MapView/MapView"
import styles from "./CopyCase.module.css"

/** Copies the paint and its score as text, to paste into a chat about the scoring (see scoring-case.ts). */
export const CopyCase = ({
  question,
  answer,
  kernel
}: {
  question: Question
  answer: ScoredAnswer
  kernel: ChoosableKernel
}) => {
  const paint = usePaint()
  const [copied, setCopied] = useState(false)
  // Where the clipboard is out of reach (a LAN address over http), the text to copy by hand.
  const [fallback, setFallback] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = async () => {
    const floor = paint.floor.value
    const { score, parts } = scoreAnswer(buildDistribution(paint.layer.toCells(), floor), answer, kernel)
    const text = await encodeCase({
      question: caseQuestion(question, answer),
      kernel: answer.type === AnswerType.AREA ? RegionKernel.REGION : kernel.id,
      floor,
      resolution: paint.layer.resolution,
      score,
      parts,
      cells: paint.layer.toRecord()
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setFallback(undefined)
    } catch {
      setFallback(text)
    }
  }
  return (
    <>
      <button class="small" onClick={() => void copy()} disabled={paint.isEmpty.value}>
        {copied ? "Copied" : "Copy test case"}
      </button>
      {fallback && (
        <textarea
          class={styles.caseText}
          readOnly
          rows={6}
          value={fallback}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </>
  )
}
