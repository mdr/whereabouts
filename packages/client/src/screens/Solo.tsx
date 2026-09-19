/** Single-player practice mode with the playtest tools (cheat, kernel switch, score-if-here). */
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
import { Card, QuestionCard, fmtKm } from "../ui/bits";
import { Distribution as DistributionList, PaintTools } from "../ui/PaintTools";
import { Check, DifficultyOptions } from "../ui/Options";
import { cheatLiveScore, soloKernelId } from "../settings";

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

  // New round: fresh layer for this tolerance, painting on.
  useEffect(() => {
    if (phase !== "paint") return;
    paint.reset(q.toleranceKm);
    paint.enabled.value = true;
    paint.gameMap.clearReveal();
    paint.tool.value = "paint";
  }, [index, phase === "paint"]);

  // Cheat: show the answer while painting.
  useEffect(() => {
    if (phase !== "paint") return;
    if (cheatLiveScore.value) paint.gameMap.showReveal(q.answer, q.toleranceKm);
    else paint.gameMap.clearReveal();
  }, [cheatLiveScore.value, phase, index]);

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
    <h1>
      <a href="#/" class="back">
        Whereabouts
      </a>{" "}
      <small>
        Round {Math.min(index + 1, questions.length)} / {questions.length} · total {Math.round(total).toLocaleString()}
      </small>
    </h1>
  );

  if (phase === "done") {
    return (
      <>
        {header}
        <div class="card score">
          <div class="label">Final score</div>
          <div class="big">{Math.round(total).toLocaleString()}</div>
          <div class="label">out of {(questions.length * 1000).toLocaleString()}</div>
        </div>
        <Card title="Rounds">
          <ul class="results">
            {results.map((r, i) => (
              <li key={i}>
                <span>{r.question.label}</span>
                <span>{Math.round(r.score)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <button class="primary" onClick={restart}>
          Play again
        </button>
      </>
    );
  }

  const playtest = (
    <>
      <h2 style={{ marginTop: 10 }}>Playtest</h2>
      <Check s={cheatLiveScore}>Show live score and the real answer while painting</Check>
      <label>
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
    </>
  );

  if (phase === "reveal" && revealed && shownResult) {
    const h = hover.value;
    let hoverText = "Move the mouse over the map to see the score for other answers.";
    if (h) {
      const A = similarityToAnswer(revealed.dist, toXyz(h), q.toleranceKm, kernel);
      const s = scoreFromParts(A, shownResult.B);
      const d = greatCircleDistance(h, q.answer);
      hoverText = `If the answer were here: ${Math.round(s)} · ${fmtKm(d)} from the real answer (${(d / q.toleranceKm).toFixed(1)} tolerances)`;
    }
    return (
      <>
        {header}
        <QuestionCard q={q} res={paint.layer.res} />
        <div class="card score">
          <div class="label">{q.label}</div>
          <div class="big">{Math.round(shownResult.score)}</div>
          <Parts A={shownResult.A} B={shownResult.B} />
          <div class="hover-score">{hoverText}</div>
          <KernelComparison dist={revealed.dist} q={q} active={kernel.id} />
        </div>
        <Card title="Your distribution">
          <DistributionList />
        </Card>
        <div class="actions">
          <button class="primary" onClick={next}>
            {index + 1 >= questions.length ? "Finish" : "Next question"} <kbd>Enter</kbd>
          </button>
        </div>
        <DifficultyOptions extra={playtest} />
      </>
    );
  }

  return (
    <>
      {header}
      <QuestionCard q={q} res={paint.layer.res} />
      <Card title="Paint your hunch">
        <PaintTools />
        <div class="actions">
          <button class="danger" onClick={() => paint.clear()}>
            Clear
          </button>
          <button class="primary" onClick={submit} disabled={paint.version.value < 0 || paint.layer.isEmpty}>
            Submit <kbd>Enter</kbd>
          </button>
        </div>
      </Card>
      {cheatLiveScore.value && <LiveScore q={q} kernelId={kernel.id} />}
      <Card title="Your distribution">
        <DistributionList />
        <p class="hint">
          All paint is normalised to 100% together with the world floor, which spreads that share evenly over the whole
          planet.
        </p>
      </Card>
      <DifficultyOptions extra={playtest} />
    </>
  );
}

function Parts({ A, B }: { A: number; B: number }) {
  return (
    <div class="parts">
      <span>
        A <b>{A.toFixed(3)}</b>
      </span>
      <span>
        B <b>{B.toFixed(3)}</b>
      </span>
      <span>
        2A−B <b>{(2 * A - B).toFixed(3)}</b>
      </span>
    </div>
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
  void paint.version.value;
  const dist = buildDistribution(paint.layer.toCells(), paint.floor.value);
  const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, kernelById(kernelId));
  return (
    <Card title="Live score (cheat)">
      <p class="hint" style={{ margin: "0 0 6px" }}>
        Answer: {q.label}, marked on the map.
      </p>
      <div class="score">
        <div class="big">{Math.round(score)}</div>
        <Parts A={A} B={B} />
      </div>
      <KernelComparison dist={dist} q={q} active={kernelId} />
    </Card>
  );
}
