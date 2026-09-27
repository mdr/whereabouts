/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * places (the answer is a point) or whole countries (the answer is an area,
 * loaded on demand), as chosen on the front page.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  KERNELS,
  QUESTIONS,
  buildDistribution,
  regionFit,
  scoreRegionQuestion,
  greatCircleDistance,
  kernelById,
  scoreDistribution,
  scoreFromParts,
  shuffle,
  similarityToAnswer,
  toXyz,
  type Distribution,
  type Kernel,
  type LatLon,
  type Question,
  type RegionQuestion,
  type ScoreBreakdown,
} from "@whereabouts/shared";
import type { GameMap } from "../map";
import { MapView, usePaint } from "../ui/MapView";
import { Answer, Card, HudBottom, HudHeader, QuestionCard, ScoreParts, fmtKm } from "../ui/bits";
import { PaintDev, PaintTools } from "../ui/PaintTools";
import { Banner } from "../ui/Banner";
import { DevDrawer } from "../ui/DevDrawer";
import { cheatLiveScore, soloKernelId, soloMapDetail, soloPool, soloRegionKernelId, startOnPan } from "../settings";
import { devMode } from "../dev";
import { Icon } from "../ui/icons";

type PracticeQuestion = Question | RegionQuestion;

const isRegion = (q: PracticeQuestion): q is RegionQuestion => q.kind === "region";

function scoreQuestion(dist: Distribution, q: PracticeQuestion, k: Kernel): ScoreBreakdown {
  return isRegion(q) ? scoreRegionQuestion(dist, q, k) : scoreDistribution(dist, q.answer, q.toleranceKm, k);
}

function showAnswer(gameMap: GameMap, q: PracticeQuestion): void {
  if (isRegion(q)) gameMap.showRegionReveal(q.outline);
  else gameMap.showReveal(q.answer, q.toleranceKm);
}

interface RoundResult {
  question: PracticeQuestion;
  score: number;
  A: number;
  B: number;
}

export function Solo() {
  return (
    <MapView>
      <SoloLoader />
    </MapView>
  );
}

/** Countries come in their own chunk (their outlines), fetched when asked for. */
function SoloLoader() {
  const pool = soloPool.value;
  const [regions, setRegions] = useState<RegionQuestion[] | null>(null);
  useEffect(() => {
    if (pool !== "countries" || regions) return;
    let live = true;
    void import("@whereabouts/shared/regions.json").then((m) => {
      if (live) setRegions(m.default as RegionQuestion[]);
    });
    return () => {
      live = false;
    };
  }, [pool]);
  if (pool === "countries" && !regions) {
    return (
      <div class="hud">
        <div class="hud-center">
          <p class="card">Loading countries…</p>
        </div>
      </div>
    );
  }
  return <SoloGame pool={pool === "countries" ? regions! : QUESTIONS} />;
}

function SoloGame({ pool }: { pool: PracticeQuestion[] }) {
  const paint = usePaint();
  const [questions, setQuestions] = useState(() => shuffle(pool, Date.now()));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"paint" | "reveal" | "done">("paint");
  const [results, setResults] = useState<RoundResult[]>([]);
  const [revealed, setRevealed] = useState<{ dist: Distribution; result: RoundResult } | null>(null);
  const hover = useSignal<LatLon | null>(null);
  const q = questions[index]!;
  // Countries score with their own kernel; the dev drawer can change either.
  const kernelSetting = isRegion(q) ? soloRegionKernelId : soloKernelId;
  const kernel = kernelById(kernelSetting.value);
  const total = results.reduce((s, r) => s + r.score, 0);
  const cheating = devMode.value && cheatLiveScore.value;

  // New round: fresh layer for this tolerance, painting on.
  useEffect(() => {
    if (phase !== "paint") return;
    paint.reset(q.toleranceKm);
    paint.enabled.value = true;
    paint.gameMap.clearReveal();
    paint.gameMap.resetView();
    paint.tool.value = startOnPan.value ? "pan" : "paint";
  }, [index, phase === "paint"]);

  // Cheat: show the answer while painting.
  useEffect(() => {
    if (phase !== "paint") return;
    if (cheating) showAnswer(paint.gameMap, q);
    else paint.gameMap.clearReveal();
  }, [cheating, phase, index]);

  useEffect(() => paint.onHover((p) => (hover.value = p)), [paint]);

  // The chosen map detail while painting; everything on the reveal.
  const detail = soloMapDetail.value;
  useEffect(() => {
    paint.gameMap.setDetail(phase === "reveal" ? "reveal" : detail);
  }, [phase, detail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (phase === "paint" && !paint.layer.isEmpty) submit();
      else if (phase === "reveal") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function submit() {
    const dist = buildDistribution(paint.layer.toCells(), paint.floor.value);
    const { score, A, B } = scoreQuestion(dist, q, kernel);
    const result = { question: q, score, A, B };
    setResults((r) => [...r, result]);
    setRevealed({ dist, result });
    setPhase("reveal");
    paint.enabled.value = false;
    showAnswer(paint.gameMap, q);
    if (isRegion(q)) {
      // Frame the country and the paint together, wherever the paint went.
      const outline = q.outline.map((coordinates): GeoJSON.Feature => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates },
      }));
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...paint.layer.toGeoJSON().features, ...outline],
      };
      paint.gameMap.fitAnswerAndPaint(q.answer, fc, q.toleranceKm);
    } else {
      paint.gameMap.focusOn(q.answer, q.toleranceKm);
    }
  }

  function next() {
    if (index + 1 >= questions.length) {
      setPhase("done");
      paint.gameMap.clearReveal();
      return;
    }
    setIndex(index + 1);
    setPhase("paint");
  }

  function restart() {
    setQuestions(shuffle(pool, Date.now()));
    setResults([]);
    setIndex(0);
    setPhase("paint");
  }

  // Re-score the revealed paint if the kernel changes on the reveal screen.
  const shownResult = useMemo(() => {
    if (!revealed) return null;
    const { score, A, B } = scoreQuestion(revealed.dist, q, kernel);
    return { score, A, B, fit: isRegion(q) ? regionFit(revealed.dist, q) : null };
  }, [revealed, kernel.id]);

  const header = (
    <HudHeader
      home
      round={Math.min(index + 1, questions.length)}
      total={questions.length}
      right={<span class="total">{Math.round(total).toLocaleString()} pts</span>}
    />
  );

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
      <label class="check">
        {isRegion(q) ? "Kernel for countries" : "Scoring kernel"}{" "}
        <select
          value={kernelSetting.value}
          onChange={(e) => (kernelSetting.value = (e.target as HTMLSelectElement).value)}
          style={{ flex: 1 }}
        >
          {KERNELS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );

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
            <p class="hint">
              <a href="#/">Leave</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "reveal" && revealed && shownResult) {
    const h = hover.value;
    // "What if the answer were here" only means something for a point answer.
    let hoverText: string | null = isRegion(q)
      ? null
      : "Move the mouse over the map to see the score for other answers.";
    if (h && !isRegion(q)) {
      const A = similarityToAnswer(revealed.dist, toXyz(h), q.toleranceKm, kernel);
      const s = scoreFromParts(A, shownResult.B);
      const d = greatCircleDistance(h, q.answer);
      hoverText = `If the answer were here: ${Math.round(s)} · ${fmtKm(d)} from the real answer (${(d / q.toleranceKm).toFixed(1)} tolerances)`;
    }
    const last = index + 1 >= questions.length;
    return (
      <>
        <div class="hud">
          <div class="hud-top">
            {header}
            <QuestionCard q={q}>
              <Answer label={q.label} wiki={q.wiki} />
            </QuestionCard>
            <div class="card score">
              <div class="big">{Math.round(shownResult.score)}</div>
              <div class="label">this round</div>
              {shownResult.fit && (
                <div class="fit">
                  You covered {pct(shownResult.fit.coverage)} of {q.label}; {pct(shownResult.fit.precision)} of your
                  paint was on it
                </div>
              )}
            </div>
          </div>
          <HudBottom>
            <button class="primary" onClick={next}>
              <Icon name={last ? "flag" : "next"} /> {last ? "Finish" : "Next question"} <kbd>Enter</kbd>
            </button>
          </HudBottom>
        </div>
        <DevDrawer>
          <Card title="Score">
            <ScoreParts A={shownResult.A} B={shownResult.B} />
            {hoverText && <div class="hover-score">{hoverText}</div>}
            <KernelComparison dist={revealed.dist} q={q} active={kernel.id} />
          </Card>
          {cheats}
          <PaintDev />
        </DevDrawer>
      </>
    );
  }

  return (
    <>
      <div class="hud">
        <div class="hud-top">
          {header}
          <QuestionCard q={q} credit>
            {isRegion(q) && <p class="hint region-hint">Cover the whole country: its shape counts.</p>}
          </QuestionCard>
        </div>
        <PaintTools practice>
          <button class="primary" onClick={submit} disabled={paint.version.value < 0 || paint.layer.isEmpty}>
            <Icon name="check" /> Submit
          </button>
        </PaintTools>
      </div>
      <DevDrawer>
        {cheats}
        {cheating && <LiveScore q={q} kernelId={kernel.id} />}
        <PaintDev />
      </DevDrawer>
    </>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function KernelComparison({ dist, q, active }: { dist: Distribution; q: PracticeQuestion; active: string }) {
  return (
    <ul class="results compare">
      {KERNELS.map((k) => (
        <li key={k.id}>
          <span>
            {k.label}
            {k.id === active ? " ◀" : ""}
          </span>
          <span>{Math.round(scoreQuestion(dist, q, k).score)}</span>
        </li>
      ))}
    </ul>
  );
}

function LiveScore({ q, kernelId }: { q: PracticeQuestion; kernelId: string }) {
  const paint = usePaint();
  void paint.settledVersion.value;
  const dist = buildDistribution(paint.layer.toCells(), paint.floor.value);
  const { score, A, B } = scoreQuestion(dist, q, kernelById(kernelId));
  return (
    <Card title="Live score">
      <p class="hint" style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, {isRegion(q) ? "outlined" : "marked"} on the map.
      </p>
      <div class="score">
        <div class="big">{Math.round(score)}</div>
        <ScoreParts A={A} B={B} />
      </div>
      <KernelComparison dist={dist} q={q} active={kernelId} />
    </Card>
  );
}
