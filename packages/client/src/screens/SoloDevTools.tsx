/** Practice's playtest tools, for the dev drawer. */
import { useEffect, useState } from "preact/hooks"
import type { ReadonlySignal } from "@preact/signals"
import {
  KERNELS,
  KernelIdSchema,
  type KernelId,
  buildDistribution,
  kernelById,
  scoreFromParts,
  similarityToAnswer,
  type Distribution,
  type ChoosableKernel
} from "@whereabouts/shared/scoring/scoring"
import {
  SHAPE_WEIGHT,
  regionFit,
  scoreAnswer,
  type AnswerParts,
  type Area,
  type ScoredAnswer
} from "@whereabouts/shared/scoring/regions"
import { RegionKernel, encodeCase } from "@whereabouts/shared/scoring/scoring-case"
import { caseQuestion } from "@whereabouts/shared/scoring/score-review"
import { AnswerType, type Question } from "@whereabouts/shared/questions"
import { greatCircleDistance, toXyz, type LatLon } from "@whereabouts/shared/geo"
import { usePaint } from "../ui/map/MapView"
import { Card } from "../ui/Card"
import { ScoreParts } from "../ui/round/ScoreParts"
import { formatDistance } from "../ui/format"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import sc from "../ui/round/Score.module.css"
import s from "./SoloDevTools.module.css"
import { cheatLiveScore, soloKernelId } from "../settings/settings"

function PartsLine({ parts }: { parts: AnswerParts }) {
  if (parts.type === AnswerType.POINT) return <ScoreParts A={parts.A} B={parts.B} />
  return (
    <div class={kit.parts}>
      <span>
        shape <b>{Math.round(parts.shape)}</b> × {SHAPE_WEIGHT}
      </span>
      <span>
        nearness <b>{Math.round(parts.nearness)}</b> × {Math.round((1 - SHAPE_WEIGHT) * 10) / 10}
      </span>
    </div>
  )
}

export function Cheats({ q, a, kernel }: { q: Question; a: ScoredAnswer; kernel: ChoosableKernel }) {
  return (
    <Card title="Cheats">
      <label class={kit.check}>
        <input
          type="checkbox"
          checked={cheatLiveScore.value}
          onChange={(e) => (cheatLiveScore.value = (e.target as HTMLInputElement).checked)}
        />{" "}
        Show live score and the real answer while painting
      </label>
      {a.type === AnswerType.AREA ? (
        <p class={kit.hint}>Countries score by shape and nearness, with their own kernel: see regions.ts.</p>
      ) : (
        <label class={kit.check}>
          Scoring kernel{" "}
          <select
            value={soloKernelId.value}
            onChange={(e) => (soloKernelId.value = KernelIdSchema.parse((e.target as HTMLSelectElement).value))}
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
      <CopyCase q={q} a={a} kernel={kernel} />
    </Card>
  )
}

/** The revealed score's parts, and what other answers or kernels would have scored. */
export function RevealScore({
  a,
  kernel,
  parts,
  dist,
  hover
}: {
  a: ScoredAnswer
  kernel: ChoosableKernel
  parts: AnswerParts
  /** Undefined for a pass. */
  dist: Distribution | undefined
  hover: ReadonlySignal<LatLon | undefined>
}) {
  const h = hover.value
  // "What if the answer were here" only means something for a point answer.
  let hoverText: string | undefined =
    a.type === AnswerType.AREA ? undefined : "Move the mouse over the map to see the score for other answers."
  if (h && a.type === AnswerType.POINT && dist) {
    const A = similarityToAnswer(dist, toXyz(h), a.tolerance, kernel)
    const s = parts.type === AnswerType.POINT ? scoreFromParts(A, parts.B) : 0
    const d = greatCircleDistance(h, a.at)
    hoverText = `If the answer were here: ${Math.round(s)} · ${formatDistance(d)} from the real answer (${(d / a.tolerance).toFixed(1)} tolerances)`
  }
  return (
    <Card title="Score">
      <PartsLine parts={parts} />
      {hoverText && <div class={s.hoverScore}>{hoverText}</div>}
      {a.type === AnswerType.POINT && dist && <KernelComparison dist={dist} a={a} active={kernel.id} />}
    </Card>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Copies the paint and its score as text, to paste into a chat about the scoring (see scoring-case.ts). */
function CopyCase({ q, a, kernel }: { q: Question; a: ScoredAnswer; kernel: ChoosableKernel }) {
  const paint = usePaint()
  const [copied, setCopied] = useState(false)
  // Where the clipboard is out of reach (a LAN address over http), the text to copy by hand.
  const [fallback, setFallback] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async () => {
    const floor = paint.floor.value
    const { score, parts } = scoreAnswer(buildDistribution(paint.layer.toCells(), floor), a, kernel)
    const text = await encodeCase({
      question: caseQuestion(q, a),
      kernel: a.type === AnswerType.AREA ? RegionKernel.REGION : kernel.id,
      floor,
      res: paint.layer.res,
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
        <textarea class={s.caseText} readOnly rows={6} value={fallback} onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  )
}

function KernelComparison({ dist, a, active }: { dist: Distribution; a: ScoredAnswer; active: KernelId }) {
  return (
    <ul class={cx(kit.results, kit.compare)}>
      {KERNELS.map((k) => (
        <li key={k.id}>
          <span>
            {k.label}
            {k.id === active ? " ◀" : ""}
          </span>
          <span>{Math.round(scoreAnswer(dist, a, k).score)}</span>
        </li>
      ))}
    </ul>
  )
}

export function LiveScore({ q, a, kernelId }: { q: Question; a: ScoredAnswer; kernelId: KernelId }) {
  const paint = usePaint()
  const dist = buildDistribution(paint.settledCells.value, paint.floor.value)
  const { score, parts } = scoreAnswer(dist, a, kernelById(kernelId))
  return (
    <Card title="Live score">
      <p class={kit.hint} style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, {a.type === AnswerType.AREA ? "outlined" : "marked"} on the map.
      </p>
      <div class={sc.score}>
        <div class={sc.big}>{Math.round(score)}</div>
        <PartsLine parts={parts} />
      </div>
      {a.type === AnswerType.AREA && paint.settledCells.value.length > 0 && (
        <RegionFitFacts dist={dist} a={a} label={q.label} />
      )}
      {a.type === AnswerType.POINT && <KernelComparison dist={dist} a={a} active={kernelId} />}
    </Card>
  )
}

/** Where the paint is against the country (the world floor left out). */
function RegionFitFacts({ dist, a, label }: { dist: Distribution; a: Area; label: string }) {
  const { coverage, precision } = regionFit(dist, a)
  return (
    <dl class={cx(kit.facts, s.regionFit)}>
      <div>
        <dt>Paint on {label}</dt>
        <dd>{pct(precision)}</dd>
      </div>
      <div>
        <dt>Paint off it</dt>
        <dd>{pct(1 - precision)}</dd>
      </div>
      <div>
        <dt>{label} covered</dt>
        <dd>{pct(coverage)}</dd>
      </div>
    </dl>
  )
}
