/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * places (the answer is a point), whole countries (the answer is an area,
 * loaded on demand), flags (a country's flag: painted whole when it is big
 * enough, else a point), islands, lakes and seas, or US states, as chosen on
 * the front page.
 */
import { useEffect, useMemo, useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { buildDistribution, kernelById, type Distribution } from "@whereabouts/shared/scoring"
import { hintBand, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { questionPictures, questionView } from "@whereabouts/shared/game"
import { revealPhoto } from "@whereabouts/shared/photos"
import { scoreAnswer } from "@whereabouts/shared/regions"
import { QUESTIONS, isWater, shuffle } from "@whereabouts/shared/questions"
import { flagRound } from "@whereabouts/shared/flags"
import type { LatLon } from "@whereabouts/shared/geo"
import { showsLakes } from "@whereabouts/shared/protocol"
import { MapView, usePaint } from "../ui/MapView"
import { forTabbedControl } from "../keys"
import { LoadingOutlines } from "../ui/LoadingOutlines"
import { HeaderNote, Hud, HudBottom, HudCenter, HudHeader, HudTop } from "../ui/Hud"
import kit from "../ui/kit.module.css"
import sc from "../ui/Score.module.css"
import { DoneButton, RevealCards, RoundPrompt } from "../ui/Round"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { VrButton, useVrHold, useVrView } from "../ui/VrButton"
import type { VrView } from "../vr/view"
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
import { isRegion, type PracticeQuestion } from "../practice-question"
import { soloTestIds } from "./SoloTestIds"
import { Cheats, LiveScore, RevealScore } from "./SoloDevTools"

function revealedAnswer(q: PracticeQuestion): RevealedAnswer {
  return {
    label: q.label,
    wiki: q.wiki,
    answer: q.answer,
    outline: isRegion(q) ? q.outline : undefined,
    photo: revealPhoto(q)
  }
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
    if (phase === "reveal") frameReveal(paint.gameMap, question, answer, paint.layer.toGeoJSON())
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
      : phase === "reveal" && revealed && shownResult
        ? {
            kind: "reveal",
            round,
            more: [{ ...home, confirm: "Press again to leave" }],
            reveal: vrReveal(
              shown,
              answer,
              { score: shownResult.score, passed: !revealed.dist, total, painted: where },
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
      right={<HeaderNote nowrap>{Math.round(total).toLocaleString()} pts</HeaderNote>}
    />
  )

  if (phase === "done") {
    return (
      <Hud>
        <HudCenter>
          <div class={kit.pageCard}>
            <Banner />
            <div class={sc.score}>
              <div class={sc.label}>Final score</div>
              <div class={sc.big}>{Math.round(total).toLocaleString()}</div>
              <div class={sc.label}>out of {(questions.length * 1000).toLocaleString()}</div>
            </div>
            <ul class={kit.results}>
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
            <p class={kit.hint}>
              <a href="#/">Leave</a>
            </p>
          </div>
        </HudCenter>
      </Hud>
    )
  }

  if (phase === "reveal" && revealed && shownResult) {
    const dist = revealed.dist
    const last = index + 1 >= questions.length
    return (
      <>
        {borders && <FlagHover gameMap={paint.gameMap} borders={borders} />}
        {borders && allFlags.value && <AllFlags gameMap={paint.gameMap} borders={borders} />}
        <Hud reveal>
          <HudTop>
            {header}
            <RevealCards
              question={question}
              countryFlag={countryFlag}
              revealed={answer}
              fact={fact}
              you={{ score: shownResult.score, passed: !dist }}
              playedLabel="your score this round"
              where={where}
              testIds={{ score: soloTestIds.roundScore }}
            />
          </HudTop>
          <HudBottom>
            {q.flag && <AllFlagsSwitch />}
            <VrButton view={vrView} />
            <button class="primary" onClick={next} data-testid={soloTestIds.nextButton}>
              <Icon name={last ? "flag" : "next"} /> {last ? "Finish" : "Next question"} <kbd>Enter</kbd>
            </button>
          </HudBottom>
        </Hud>
        <DevDrawer>
          <RevealScore q={q} kernel={kernel} parts={shownResult.parts} dist={dist} hover={hover} />
          <Cheats q={q} kernel={kernel} />
          <PaintDev />
        </DevDrawer>
      </>
    )
  }

  return (
    <>
      <Hud>
        <HudTop>
          {header}
          <RoundPrompt question={question} countryFlag={countryFlag} />
          <HintCard band={hint} onUse={useHint} />
        </HudTop>
        <PaintTools practice water={isWater(q.topic)} hint={hint}>
          <VrButton view={vrView} />
          <DoneButton label="Submit" onDone={submit} testId={soloTestIds.submitButton} />
        </PaintTools>
      </Hud>
      <DevDrawer>
        <Cheats q={q} kernel={kernel} />
        {cheating && <LiveScore q={q} kernelId={kernel.id} />}
        <PaintDev />
      </DevDrawer>
    </>
  )
}
