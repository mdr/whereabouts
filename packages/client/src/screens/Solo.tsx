/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * places (the answer is a point), whole countries (the answer is an area,
 * loaded on demand), flags (a country's flag: painted whole when it is big
 * enough, else a point), islands, lakes and seas, or US states, as chosen on
 * the front page.
 */
import { useEffect, useMemo, useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import {
  KERNELS,
  KernelIdSchema,
  type KernelId,
  buildDistribution,
  kernelById,
  scoreFromParts,
  similarityToAnswer,
  type Distribution,
  type Kernel
} from "@whereabouts/shared/scoring"
import { hintBand, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { questionPictures, questionView } from "@whereabouts/shared/game"
import { revealPhoto } from "@whereabouts/shared/photos"
import {
  SHAPE_WEIGHT,
  regionFit,
  scoreAnswer,
  type AnswerParts,
  type RegionQuestion
} from "@whereabouts/shared/regions"
import { QUESTIONS, isWater, shuffle, type Question } from "@whereabouts/shared/questions"
import { encodeCase } from "@whereabouts/shared/scoring-case"
import { flagRound } from "@whereabouts/shared/flags"
import { greatCircleDistance, toXyz, type LatLon } from "@whereabouts/shared/geo"
import { showsLakes } from "@whereabouts/shared/protocol"
import { MapView, usePaint } from "../ui/MapView"
import { forTabbedControl } from "../keys"
import { LoadingOutlines } from "../ui/LoadingOutlines"
import { Card, HudBottom, HudHeader, ScoreParts, fmtKm } from "../ui/bits"
import { DoneButton, RevealCards, RoundPrompt } from "../ui/Round"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { VrButton, useVrHold, useVrView } from "../ui/VrButton"
import type { VrView } from "../vr"
import type { VrTable } from "../vr/scores"
import { pts, vrReveal, vrRound, type VrRoundShown } from "../vr-round"
import { Banner } from "../ui/Banner"
import { DevDrawer } from "../ui/DevDrawer"
import { allFlags, cheatLiveScore, soloKernelId, soloMapDetail, soloPool } from "../settings"
import { devMode } from "../dev"
import { Icon } from "../ui/icons"
import { featureQuestions, flagQuestions, regions } from "../regions"
import { useBorders } from "../borders"
import { useFact } from "../facts"
import { preloadPictures } from "../preload"
import { HintCard } from "../ui/Hint"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry } from "../ui/FlagReveal"
import { navigate } from "../router"
import { announcePass, frameReveal, showAnswer, useRoundMap, type RevealedAnswer } from "../round"
import { soloTestIds } from "./SoloTestIds"

type PracticeQuestion = Question | RegionQuestion

const isRegion = (q: PracticeQuestion): q is RegionQuestion => q.kind === "region"

function revealedAnswer(q: PracticeQuestion): RevealedAnswer {
  return {
    label: q.label,
    wiki: q.wiki,
    answer: q.answer,
    outline: isRegion(q) ? q.outline : undefined,
    photo: revealPhoto(q)
  }
}

function PartsLine({ parts }: { parts: AnswerParts }) {
  if ("A" in parts) return <ScoreParts A={parts.A} B={parts.B} />
  return (
    <div class="parts">
      <span>
        shape <b>{Math.round(parts.shape)}</b> × {SHAPE_WEIGHT}
      </span>
      <span>
        nearness <b>{Math.round(parts.nearness)}</b> × {Math.round((1 - SHAPE_WEIGHT) * 10) / 10}
      </span>
    </div>
  )
}

interface RoundResult {
  question: PracticeQuestion
  score: number
}

/** The rounds so far, latest first, for the headset's score table. */
function roundsTable(results: RoundResult[]): VrTable {
  return {
    title: "Your rounds",
    rows: results
      .map((r, i) => ({ name: `${i + 1}. ${r.question.label}`, total: Math.round(r.score).toLocaleString() }))
      .reverse()
  }
}

export function Solo() {
  useVrHold()
  return (
    <MapView>
      <SoloLoader />
    </MapView>
  )
}

/** All but places come in their own chunk (the outlines), fetched when asked for. */
function SoloLoader() {
  const pool = soloPool.value
  const byId = regions.value
  if (pool !== "places" && !byId) return <LoadingOutlines />
  const lakes = showsLakes(soloMapDetail.value)
  return (
    <SoloGame
      pool={
        pool === "countries"
          ? [...byId!.values()].filter((q) => q.topic === undefined)
          : pool === "flags"
            ? flagQuestions.value!.flatMap((f) => flagRound(f, byId!) ?? [])
            : pool === "features"
              ? featureQuestions.value!.filter((q) => q.topic !== "state" && (lakes || q.topic !== "lake"))
              : pool === "states"
                ? featureQuestions.value!.filter((q) => q.topic === "state")
                : QUESTIONS
      }
    />
  )
}

function SoloGame({ pool }: { pool: PracticeQuestion[] }) {
  const paint = usePaint()
  const [questions, setQuestions] = useState(() => shuffle(pool, Date.now()))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<"paint" | "reveal" | "done">("paint")
  const [results, setResults] = useState<RoundResult[]>([])
  // No distribution for a pass.
  const [revealed, setRevealed] = useState<{ dist?: Distribution; result: RoundResult } | undefined>(undefined)
  const hover = useSignal<LatLon | undefined>(undefined)
  // Practice hints are unlimited, still one per question.
  const [hint, setHint] = useState<HintBand | undefined>(undefined)
  const q = questions[index]!
  const kernel = kernelById(soloKernelId.value)
  const total = results.reduce((s, r) => s + r.score, 0)
  const cheating = devMode.value && cheatLiveScore.value
  const question = questionView(q)
  const answer = revealedAnswer(q)
  const countryFlag = isRegion(q) ? q.countryFlag : undefined
  const detail = soloMapDetail.value

  useRoundMap(paint, {
    round: index,
    painting: phase === "paint",
    question,
    detail,
    reveal: phase === "reveal",
    hint,
    start: () => (paint.enabled.value = true)
  })

  // Cheat: show the answer while painting.
  useEffect(() => {
    if (phase !== "paint") return
    if (cheating) showAnswer(paint.gameMap, question, answer)
    else paint.gameMap.clearReveal()
  }, [cheating, phase, index])

  useEffect(() => paint.onHover((p) => (hover.value = p)), [paint])

  useEffect(() => setHint(undefined), [index, questions])

  useEffect(() => {
    const next = questions[index + 1]
    if (next) preloadPictures(questionPictures(next))
  }, [questions, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || forTabbedControl(e)) return
      // A photo or the shortcuts list open over the round has the keyboard.
      if (document.querySelector('[role="dialog"]')) return
      const act = phase === "paint" && !paint.layer.isEmpty ? submit : phase === "reveal" ? next : undefined
      if (!act) return
      // A clicked button keeps focus, and Enter would press it as well.
      e.preventDefault()
      act()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // With nothing painted, a pass: it scores PASS_SCORE, as in a game.
  function submit() {
    const passed = announcePass(paint)
    const dist = passed ? undefined : buildDistribution(paint.layer.toCells(), paint.floor.value)
    const { score } = scoreAnswer(dist, q, kernel)
    const result = { question: q, score }
    setResults((r) => [...r, result])
    setRevealed({ dist, result })
    setPhase("reveal")
    paint.enabled.value = false
    showAnswer(paint.gameMap, question, answer)
  }

  // Framed after the reveal's cards are in place: on a phone the map frames the answer around them.
  useEffect(() => {
    if (phase !== "reveal") return
    if (isRegion(q)) frameReveal(paint.gameMap, question, answer, paint.layer.toGeoJSON())
    else paint.gameMap.focusOn(q.answer, q.toleranceKm)
  }, [phase, index])

  function next() {
    if (index + 1 >= questions.length) {
      setPhase("done")
      paint.gameMap.clearReveal()
      return
    }
    setIndex(index + 1)
    setPhase("paint")
  }

  function restart() {
    setQuestions(shuffle(pool, Date.now()))
    setResults([])
    setIndex(0)
    setPhase("paint")
  }

  const useHint = (axis: HintAxis) => setHint(hintBand(q.answer, q.toleranceKm, axis, Math.random()))
  // A flag round's reveal names the country under the pointer, and where the
  // paint mostly was. Loaded while the flag is still being painted.
  const borders = useBorders(q.flag !== undefined)
  // Each practice run shuffles anew, so its first question picks this run's facts.
  const fact = useFact(q.wiki, questions[0]!.id, index)
  // Re-score the revealed paint if the kernel changes on the reveal screen.
  const shownResult = useMemo(() => {
    if (!revealed) return undefined
    return scoreAnswer(revealed.dist, q, kernel)
  }, [revealed, kernel.id])
  const where = useMemo(
    () => (revealed && borders ? mainCountry(borders, paint.layer.toCells()) : undefined),
    [revealed, borders]
  )
  const home = { label: "Home", press: () => navigate("/") }
  const shown: VrRoundShown = {
    question,
    countryFlag,
    revealed: phase === "reveal" ? answer : undefined,
    fact
  }
  const round = vrRound(shown, {
    paint,
    heading: `QUESTION ${index + 1} OF ${questions.length}, ${pts(total)}`,
    detail,
    hint,
    hintsLeft: "unlimited",
    useHint,
    doneLabel: "Submit",
    done: submit,
    playing: true
  })
  const vrView: VrView =
    phase === "done"
      ? {
          kind: "done",
          summary: {
            title: "Final score",
            scoreLine: `${pts(total)} out of ${(questions.length * 1000).toLocaleString()}`,
            table: roundsTable(results),
            actions: [{ label: "Play again", press: restart }]
          },
          more: [home]
        }
      : phase === "reveal" && revealed
        ? {
            kind: "reveal",
            round,
            more: [{ ...home, confirm: "Press again to leave" }],
            reveal: vrReveal(
              shown,
              answer,
              { score: revealed.result.score, passed: !revealed.dist, total, painted: where },
              borders,
              {
                table: roundsTable(results),
                actions: [{ label: index + 1 >= questions.length ? "Finish" : "Next question", press: next }]
              }
            )
          }
        : { kind: "paint", round, more: [{ ...home, confirm: "Press again to leave" }] }
  useVrView(vrView, `${phase} ${index} ${questions[0]?.id} ${hint?.axis}`)

  const header = (
    <HudHeader
      home
      round={Math.min(index + 1, questions.length)}
      total={questions.length}
      right={<span class="total">{Math.round(total).toLocaleString()} pts</span>}
    />
  )

  const cheats = (
    <Card title="Cheats">
      <label class="check">
        <input
          type="checkbox"
          checked={cheatLiveScore.value}
          onChange={(e) => (cheatLiveScore.value = (e.target as HTMLInputElement).checked)}
        />{" "}
        Show live score and the real answer while painting
      </label>
      {isRegion(q) ? (
        <p class="hint">Countries score by shape and nearness, with their own kernel: see regions.ts.</p>
      ) : (
        <label class="check">
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
      <CopyCase q={q} kernel={kernel} />
    </Card>
  )

  if (phase === "done") {
    return (
      <div class="hud">
        <div class="hud-center">
          <div class="home-card">
            <Banner />
            <div class="score">
              <div class="label">Final score</div>
              <div class="big">{Math.round(total).toLocaleString()}</div>
              <div class="label">out of {(questions.length * 1000).toLocaleString()}</div>
            </div>
            <ul class="results">
              {results.map((r, i) => (
                <li key={i}>
                  <span>{r.question.label}</span>
                  <span>{Math.round(r.score)}</span>
                </li>
              ))}
            </ul>
            <button class="primary big" onClick={restart}>
              <Icon name="refresh" /> Play again
            </button>
            <VrButton view={vrView} />
            <p class="hint">
              <a href="#/">Leave</a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === "reveal" && revealed && shownResult) {
    const dist = revealed.dist
    const h = hover.value
    // "What if the answer were here" only means something for a point answer.
    let hoverText: string | undefined = isRegion(q)
      ? undefined
      : "Move the mouse over the map to see the score for other answers."
    if (h && !isRegion(q) && dist) {
      const A = similarityToAnswer(dist, toXyz(h), q.toleranceKm, kernel)
      const s = "B" in shownResult.parts ? scoreFromParts(A, shownResult.parts.B) : 0
      const d = greatCircleDistance(h, q.answer)
      hoverText = `If the answer were here: ${Math.round(s)} · ${fmtKm(d)} from the real answer (${(d / q.toleranceKm).toFixed(1)} tolerances)`
    }
    const last = index + 1 >= questions.length
    return (
      <>
        {borders && <FlagHover gameMap={paint.gameMap} borders={borders} />}
        {borders && allFlags.value && <AllFlags gameMap={paint.gameMap} borders={borders} />}
        <div class="hud reveal">
          <div class="hud-top">
            {header}
            <RevealCards
              question={question}
              countryFlag={countryFlag}
              revealed={answer}
              fact={fact}
              you={{ score: shownResult.score, passed: !dist }}
              playedLabel="this round"
              where={where}
              testIds={{ score: soloTestIds.roundScore }}
            />
          </div>
          <HudBottom>
            {q.flag && <AllFlagsSwitch />}
            <VrButton view={vrView} />
            <button class="primary" onClick={next} data-testid={soloTestIds.nextButton}>
              <Icon name={last ? "flag" : "next"} /> {last ? "Finish" : "Next question"} <kbd>Enter</kbd>
            </button>
          </HudBottom>
        </div>
        <DevDrawer>
          <Card title="Score">
            <PartsLine parts={shownResult.parts} />
            {hoverText && <div class="hover-score">{hoverText}</div>}
            {!isRegion(q) && dist && <KernelComparison dist={dist} q={q} active={kernel.id} />}
          </Card>
          {cheats}
          <PaintDev />
        </DevDrawer>
      </>
    )
  }

  return (
    <>
      <div class="hud">
        <div class="hud-top">
          {header}
          <RoundPrompt question={question} countryFlag={countryFlag} credit />
          <HintCard band={hint} onUse={useHint} />
        </div>
        <PaintTools practice water={isWater(q.topic)} hint={hint}>
          <VrButton view={vrView} />
          <DoneButton label="Submit" onDone={submit} testId={soloTestIds.submitButton} />
        </PaintTools>
      </div>
      <DevDrawer>
        {cheats}
        {cheating && <LiveScore q={q} kernelId={kernel.id} />}
        <PaintDev />
      </DevDrawer>
    </>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Copies the paint and its score as text, to paste into a chat about the scoring (see scoring-case.ts). */
function CopyCase({ q, kernel }: { q: PracticeQuestion; kernel: Kernel }) {
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
    const { score, parts } = scoreAnswer(buildDistribution(paint.layer.toCells(), floor), q, kernel)
    const text = await encodeCase({
      question: {
        kind: isRegion(q) ? "region" : q.kind,
        id: q.id,
        label: q.label,
        answer: q.answer,
        toleranceKm: q.toleranceKm,
        ...(q.flag ? { flag: q.flag } : {})
      },
      kernel: isRegion(q) ? "region" : kernel.id,
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
        <textarea class="case-text" readOnly rows={6} value={fallback} onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  )
}

function KernelComparison({ dist, q, active }: { dist: Distribution; q: PracticeQuestion; active: string }) {
  return (
    <ul class="results compare">
      {KERNELS.map((k) => (
        <li key={k.id}>
          <span>
            {k.label}
            {k.id === active ? " ◀" : ""}
          </span>
          <span>{Math.round(scoreAnswer(dist, q, k).score)}</span>
        </li>
      ))}
    </ul>
  )
}

function LiveScore({ q, kernelId }: { q: PracticeQuestion; kernelId: KernelId }) {
  const paint = usePaint()
  const dist = buildDistribution(paint.settledCells.value, paint.floor.value)
  const { score, parts } = scoreAnswer(dist, q, kernelById(kernelId))
  return (
    <Card title="Live score">
      <p class="hint" style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, {isRegion(q) ? "outlined" : "marked"} on the map.
      </p>
      <div class="score">
        <div class="big">{Math.round(score)}</div>
        <PartsLine parts={parts} />
      </div>
      {isRegion(q) && paint.settledCells.value.length > 0 && <RegionFitFacts dist={dist} q={q} />}
      {!isRegion(q) && <KernelComparison dist={dist} q={q} active={kernelId} />}
    </Card>
  )
}

/** Where the paint is against the country (the world floor left out). */
function RegionFitFacts({ dist, q }: { dist: Distribution; q: RegionQuestion }) {
  const { coverage, precision } = regionFit(dist, q)
  return (
    <dl class="facts region-fit">
      <div>
        <dt>Paint on {q.label}</dt>
        <dd>{pct(precision)}</dd>
      </div>
      <div>
        <dt>Paint off it</dt>
        <dd>{pct(1 - precision)}</dd>
      </div>
      <div>
        <dt>{q.label} covered</dt>
        <dd>{pct(coverage)}</dd>
      </div>
    </dl>
  )
}
