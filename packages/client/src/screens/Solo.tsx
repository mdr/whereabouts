/** Single-player practice mode. Playtest tools live in the dev drawer. */
import { useEffect, useMemo, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  KERNELS,
  QUESTIONS,
  buildDistribution,
  greatCircleDistance,
  kernelById,
  scoreDistribution,
  scoreFromParts,
  shuffle,
  similarityToAnswer,
  toXyz,
  type Distribution,
  type LatLon,
  type Question,
} from "@whereabouts/shared";
import { MapView, usePaint } from "../ui/MapView";
import { Card, HudHeader, QuestionCard, ScoreParts, fmtKm } from "../ui/bits";
import { PaintDev, PaintTools } from "../ui/PaintTools";
import { DevDrawer } from "../ui/DevDrawer";
import { cheatLiveScore, soloKernelId } from "../settings";
import { devMode } from "../dev";

interface RoundResult {
  question: Question;
  score: number;
  A: number;
  B: number;
}

export function Solo() {
  return (
    <MapView>
      <SoloGame />
    </MapView>
  );
}

function SoloGame() {
  const paint = usePaint();
  const [questions, setQuestions] = useState(() => shuffle(QUESTIONS, Date.now()));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"paint" | "reveal" | "done">("paint");
  const [results, setResults] = useState<RoundResult[]>([]);
  const [revealed, setRevealed] = useState<{ dist: Distribution; result: RoundResult } | null>(null);
  const hover = useSignal<LatLon | null>(null);
  const kernel = kernelById(soloKernelId.value);
  const q = questions[index]!;
  const total = results.reduce((s, r) => s + r.score, 0);
  const cheating = devMode.value && cheatLiveScore.value;

  // New round: fresh layer for this tolerance, painting on.
  useEffect(() => {
    if (phase !== "paint") return;
    paint.reset(q.toleranceKm);
    paint.enabled.value = true;
    paint.gameMap.clearReveal();
    paint.gameMap.resetView();
    paint.tool.value = "paint";
  }, [index, phase === "paint"]);

  // Cheat: show the answer while painting.
  useEffect(() => {
    if (phase !== "paint") return;
    if (cheating) paint.gameMap.showReveal(q.answer, q.toleranceKm);
    else paint.gameMap.clearReveal();
  }, [cheating, phase, index]);

  useEffect(() => paint.onHover((p) => (hover.value = p)), [paint]);

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
    const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, kernel);
    const result = { question: q, score, A, B };
    setResults((r) => [...r, result]);
    setRevealed({ dist, result });
    setPhase("reveal");
    paint.enabled.value = false;
    paint.gameMap.showReveal(q.answer, q.toleranceKm);
    paint.gameMap.focusOn(q.answer, q.toleranceKm);
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
    setQuestions(shuffle(QUESTIONS, Date.now()));
    setResults([]);
    setIndex(0);
    setPhase("paint");
  }

  // Re-score the revealed paint if the kernel changes on the reveal screen.
  const shownResult = useMemo(() => {
    if (!revealed) return null;
    const { score, A, B } = scoreDistribution(revealed.dist, q.answer, q.toleranceKm, kernel);
    return { score, A, B };
  }, [revealed, soloKernelId.value]);

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
        Scoring kernel{" "}
        <select
          value={soloKernelId.value}
          onChange={(e) => (soloKernelId.value = (e.target as HTMLSelectElement).value)}
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
            <h1>Whereabouts</h1>
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
              Play again
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
    let hoverText = "Move the mouse over the map to see the score for other answers.";
    if (h) {
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
            <QuestionCard q={q} />
            <div class="card score">
              <div class="label">{q.label}</div>
              <div class="big">{Math.round(shownResult.score)}</div>
              <div class="label">this round</div>
            </div>
          </div>
          <div class="hud-bottom toolbar">
            <button class="primary" onClick={next}>
              {last ? "Finish" : "Next question"} <kbd>Enter</kbd>
            </button>
          </div>
        </div>
        <DevDrawer>
          <Card title="Score">
            <ScoreParts A={shownResult.A} B={shownResult.B} />
            <div class="hover-score">{hoverText}</div>
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
          <QuestionCard q={q} />
        </div>
        <PaintTools>
          <button class="danger" onClick={() => paint.clear()}>
            Clear
          </button>
          <button class="primary" onClick={submit} disabled={paint.version.value < 0 || paint.layer.isEmpty}>
            Submit
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

function KernelComparison({ dist, q, active }: { dist: Distribution; q: Question; active: string }) {
  return (
    <ul class="results compare">
      {KERNELS.map((k) => (
        <li key={k.id}>
          <span>
            {k.label}
            {k.id === active ? " ◀" : ""}
          </span>
          <span>{Math.round(scoreDistribution(dist, q.answer, q.toleranceKm, k).score)}</span>
        </li>
      ))}
    </ul>
  );
}

function LiveScore({ q, kernelId }: { q: Question; kernelId: string }) {
  const paint = usePaint();
  void paint.settledVersion.value;
  const dist = buildDistribution(paint.layer.toCells(), paint.floor.value);
  const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, kernelById(kernelId));
  return (
    <Card title="Live score">
      <p class="hint" style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, marked on the map.
      </p>
      <div class="score">
        <div class="big">{Math.round(score)}</div>
        <ScoreParts A={A} B={B} />
      </div>
      <KernelComparison dist={dist} q={q} active={kernelId} />
    </Card>
  );
}
