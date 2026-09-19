import "./style.css";
import { Point, type LngLat, type MapMouseEvent } from "maplibre-gl";
import { GameMap } from "./map";
import { PaintLayer, resolutionForTolerance, cellSpacingKm, MAX_BRUSH_RINGS } from "./paint";
import {
  KERNELS,
  buildDistribution,
  kernelById,
  scoreDistribution,
  scoreFromParts,
  selfSimilarity,
  similarityToAnswer,
  type Distribution,
} from "./scoring";
import { greatCircleDistance, toXyz, type LatLon } from "./geo";
import { commonsImageUrl, commonsPageUrl, loadQuestions, shuffle, type Question } from "./questions";
import { THEME } from "./themes";

type Tool = "pan" | "paint" | "erase";
type Phase = "loading" | "paint" | "reveal" | "done";

interface RoundResult {
  question: Question;
  score: number;
  A: number;
  B: number;
}

const panel = document.getElementById("panel")!;
const cursorEl = document.getElementById("brush-cursor")!;
const brushRing = cursorEl.querySelector<HTMLElement>(".ring.brush")!;
const tolRing = cursorEl.querySelector<HTMLElement>(".ring.tolerance")!;
const mapEl = document.getElementById("map")!;

const gameMap = new GameMap("map");
const map = gameMap.map;

// ---- state -----------------------------------------------------------------

let questions: Question[] = [];
let index = 0;
let phase: Phase = "loading";
let tool: Tool = "paint";
let spaceHeld = false;
let brushPx = 40;
let strength = 1;
let floor = 0.05;
let layer = new PaintLayer(4);
let results: RoundResult[] = [];
let revealed: { dist: Distribution; B: number; result: RoundResult } | null = null;
let showLabels = false;
let showBorders = false;
let showDetail = false;
let showInlandWater = false;
let cheatLiveScore = false;
let kernelId = "single";
const activeKernel = () => kernelById(kernelId);

let painting = false;
let lastStampPoint: Point | null = null;
let lastClamped = false;
let renderQueued = false;
let blobTimer: number | undefined;

const question = () => questions[index]!;
const hasQuestion = () => index < questions.length;

// ---- rendering paint ------------------------------------------------------

function queueRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    gameMap.setPaint(layer.toGeoJSON());
  });
  window.clearTimeout(blobTimer);
  blobTimer = window.setTimeout(renderBlobs, 200);
}

function renderBlobs(): void {
  const el = panel.querySelector<HTMLElement>("#blobs");
  if (!el) return;
  const blobs = layer.blobs();
  const painted = layer.isEmpty ? 0 : 1 - floor;
  const effectiveFloor = layer.isEmpty ? 1 : floor;
  const rows: string[] = [];
  const shown = blobs.slice(0, 6);
  shown.forEach((b, i) => {
    const pct = b.fraction * painted * 100;
    rows.push(
      `<li><span>Blob ${i + 1} <span class="muted">(${b.cells} cells)</span></span><span class="bar"><i style="width:${pct}%"></i></span><span>${pct.toFixed(1)}%</span></li>`,
    );
  });
  if (blobs.length > shown.length) {
    const rest = blobs.slice(shown.length).reduce((s, b) => s + b.fraction, 0) * painted * 100;
    rows.push(
      `<li class="muted"><span>${blobs.length - shown.length} more blobs</span><span class="bar"><i style="width:${rest}%"></i></span><span>${rest.toFixed(1)}%</span></li>`,
    );
  }
  rows.push(
    `<li class="floor"><span>World floor</span><span class="bar"><i style="width:${effectiveFloor * 100}%"></i></span><span>${(effectiveFloor * 100).toFixed(1)}%</span></li>`,
  );
  el.innerHTML = rows.join("");
  const submit = panel.querySelector<HTMLButtonElement>("#submit");
  if (submit) submit.disabled = false;
  renderLiveScore();
}

/** Playtest cheat: score the current paint against the answer while painting. */
function renderLiveScore(): void {
  const card = panel.querySelector<HTMLElement>("#live-card");
  if (!card) return;
  card.hidden = !cheatLiveScore;
  if (phase !== "paint") return;
  const q = question();
  // Cheat mode also shows the real answer and its tolerance rings on the map.
  if (cheatLiveScore) gameMap.showReveal(q.answer, q.toleranceKm);
  else gameMap.clearReveal();
  if (!cheatLiveScore) return;
  const dist = buildDistribution(layer.toCells(), floor);
  const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, activeKernel());
  card.innerHTML = `<h2>Live score (cheat)</h2><p class="hint" style="margin:0 0 6px">Answer: ${q.label}, marked on the map.</p>
    <div class="score"><div class="big">${Math.round(score)}</div>
    <div class="parts"><span>A <b>${A.toFixed(3)}</b></span><span>B <b>${B.toFixed(3)}</b></span><span>2A−B <b>${(2 * A - B).toFixed(3)}</b></span></div></div>
    ${kernelComparison(dist, q)}`;
}

/** Scores for the current distribution under every kernel, active one marked. */
function kernelComparison(dist: Distribution, q: Question): string {
  const rows = KERNELS.map((k) => {
    const r = scoreDistribution(dist, q.answer, q.toleranceKm, k);
    const mark = k.id === kernelId ? " ◀" : "";
    return `<li><span>${k.label}${mark}</span><span>${Math.round(r.score)}</span></li>`;
  });
  return `<ul class="results compare">${rows.join("")}</ul>`;
}

// ---- brush geometry --------------------------------------------------------

function brushRadiusKm(lat: number): number {
  return (brushPx * gameMap.metersPerPixel(lat)) / 1000;
}

function updateCursor(point: Point, lngLat: LngLat): void {
  if (phase !== "paint" || tool === "pan" || spaceHeld || !hasQuestion()) {
    cursorEl.hidden = true;
    return;
  }
  cursorEl.hidden = false;
  cursorEl.style.transform = `translate(${point.x}px, ${point.y}px)`;
  cursorEl.classList.toggle("erase", tool === "erase");
  const mpp = gameMap.metersPerPixel(lngLat.lat);
  const tolPx = (question().toleranceKm * 1000) / mpp;
  brushRing.style.width = brushRing.style.height = `${brushPx * 2}px`;
  tolRing.style.width = tolRing.style.height = `${tolPx * 2}px`;
  const { clamped } = layer.ringsForRadius(brushRadiusKm(lngLat.lat));
  brushRing.classList.toggle("clamped", clamped);
  if (clamped !== lastClamped) {
    lastClamped = clamped;
    const warn = panel.querySelector<HTMLElement>("#brush-warn");
    if (warn) warn.hidden = !clamped;
  }
}

function stampAt(lngLat: LngLat): void {
  const sign = tool === "erase" ? -1 : 1;
  // Stamps overlap along a stroke, so scale each one down.
  layer.stamp({ lat: lngLat.lat, lon: lngLat.lng }, brushRadiusKm(lngLat.lat), sign * strength * 0.3);
}

function strokeTo(point: Point): void {
  if (!lastStampPoint) {
    stampAt(map.unproject(point));
    lastStampPoint = point;
    return;
  }
  const start: Point = lastStampPoint;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(2, brushPx / 4);
  if (dist < step) return;
  const n = Math.floor(dist / step);
  for (let i = 1; i <= n; i++) {
    const t = (i * step) / dist;
    const p: Point = new Point(start.x + dx * t, start.y + dy * t);
    stampAt(map.unproject(p));
    lastStampPoint = p;
  }
}

// ---- tools -----------------------------------------------------------------

function setTool(t: Tool): void {
  tool = t;
  applyInteraction();
  panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === t);
  });
}

function applyInteraction(): void {
  const canPaint = phase === "paint" && tool !== "pan" && !spaceHeld;
  if (canPaint) map.dragPan.disable();
  else map.dragPan.enable();
  mapEl.classList.toggle("tool-paint", canPaint && tool === "paint");
  mapEl.classList.toggle("tool-erase", canPaint && tool === "erase");
  if (!canPaint) cursorEl.hidden = true;
}

// ---- map events ------------------------------------------------------------

map.on("mousedown", (e: MapMouseEvent) => {
  if (phase !== "paint" || tool === "pan" || spaceHeld) return;
  if (e.originalEvent.button !== 0) return;
  painting = true;
  lastStampPoint = null;
  strokeTo(e.point);
  queueRender();
});

map.on("mousemove", (e: MapMouseEvent) => {
  updateCursor(e.point, e.lngLat);
  if (painting) {
    strokeTo(e.point);
    queueRender();
  }
  if (phase === "reveal") updateHoverScore(e.lngLat);
});

map.on("mouseout", () => {
  cursorEl.hidden = true;
});

window.addEventListener("mouseup", () => {
  painting = false;
  lastStampPoint = null;
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === "Space" && !spaceHeld) {
    spaceHeld = true;
    painting = false;
    applyInteraction();
    e.preventDefault();
    return;
  }
  if (phase === "paint") {
    if (e.key === "1") setTool("pan");
    if (e.key === "2") setTool("paint");
    if (e.key === "3") setTool("erase");
    if (e.key === "[") setBrushPx(brushPx / 1.25);
    if (e.key === "]") setBrushPx(brushPx * 1.25);
    if (e.key === "Enter" && !layer.isEmpty) submit();
  } else if (phase === "reveal" && e.key === "Enter") {
    next();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    applyInteraction();
  }
});

function setBrushPx(px: number): void {
  brushPx = Math.min(200, Math.max(6, Math.round(px)));
  const input = panel.querySelector<HTMLInputElement>("#brush");
  const out = panel.querySelector<HTMLOutputElement>("#brush-out");
  if (input) input.value = String(brushPx);
  if (out) out.value = `${brushPx} px`;
}

// ---- rounds ----------------------------------------------------------------

function startRound(): void {
  phase = "paint";
  revealed = null;
  const q = question();
  layer = new PaintLayer(resolutionForTolerance(q.toleranceKm));
  gameMap.setPaint(layer.toGeoJSON());
  gameMap.clearReveal();
  renderPanel();
  setTool("paint");
  renderBlobs();
}

function submit(): void {
  if (phase !== "paint") return;
  const q = question();
  const dist = buildDistribution(layer.toCells(), floor);
  const { score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, activeKernel());
  const result: RoundResult = { question: q, score, A, B };
  results.push(result);
  revealed = { dist, B, result };
  phase = "reveal";
  applyInteraction();
  gameMap.showReveal(q.answer, q.toleranceKm);
  gameMap.focusOn(q.answer, q.toleranceKm);
  renderPanel();
}

function next(): void {
  if (index + 1 >= questions.length) {
    phase = "done";
    applyInteraction();
    gameMap.clearReveal();
    renderPanel();
    return;
  }
  index++;
  startRound();
}

function restart(): void {
  results = [];
  index = 0;
  questions = shuffle(questions, Date.now());
  startRound();
}

function updateHoverScore(lngLat: LngLat): void {
  if (!revealed) return;
  const el = panel.querySelector<HTMLElement>("#hover-score");
  if (!el) return;
  const q = question();
  const here = { lat: lngLat.lat, lon: lngLat.lng };
  const A = similarityToAnswer(revealed.dist, toXyz(here), q.toleranceKm, activeKernel());
  const s = scoreFromParts(A, revealed.B);
  const d = greatCircleDistance(here, q.answer);
  el.innerHTML = `If the answer were here: <b>${Math.round(s)}</b><br><span class="muted">${fmtKm(d)} from the real answer (${(d / q.toleranceKm).toFixed(1)} tolerances)</span>`;
}

// ---- panel -----------------------------------------------------------------

function fmtKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`;
}

function total(): number {
  return results.reduce((s, r) => s + r.score, 0);
}

function renderPanel(): void {
  if (phase === "loading") return;
  const q = question();
  const header = `<h1>Hunch Map <small>Round ${Math.min(index + 1, questions.length)} / ${questions.length} · total ${Math.round(total()).toLocaleString()}</small></h1>`;

  if (phase === "done") {
    panel.innerHTML = `${header}
      <div class="card score"><div class="label">Final score</div><div class="big">${Math.round(total()).toLocaleString()}</div>
      <div class="label">out of ${(questions.length * 1000).toLocaleString()}</div></div>
      <div class="card"><h2>Rounds</h2><ul class="results">${results
        .map((r) => `<li><span>${r.question.label}</span><span>${Math.round(r.score)}</span></li>`)
        .join("")}</ul></div>
      <button class="primary" id="restart">Play again</button>`;
    panel.querySelector("#restart")!.addEventListener("click", restart);
    return;
  }

  const image = q.image
    ? `<img src="${commonsImageUrl(q.image)}" alt="" referrerpolicy="no-referrer"><div class="credit">Image: <a href="${commonsPageUrl(q.image)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`
    : "";
  const res = layer.res;
  const questionCard = `<div class="card question">
      <p class="prompt">${q.prompt}</p>${image}
      <div class="tolerance"><span class="swatch"></span><span>Tolerance <b>${fmtKm(q.toleranceKm)}</b> · cells ≈ ${fmtKm(cellSpacingKm(res))} (H3 res ${res})</span></div>
    </div>`;

  if (phase === "reveal" && revealed) {
    const r = revealed.result;
    panel.innerHTML = `${header}${questionCard}
      <div class="card score">
        <div class="label">${q.label}</div>
        <div class="big">${Math.round(r.score)}</div>
        <div class="parts"><span>A <b>${r.A.toFixed(3)}</b></span><span>B <b>${r.B.toFixed(3)}</b></span><span>2A−B <b>${(2 * r.A - r.B).toFixed(3)}</b></span></div>
        <div class="hover-score" id="hover-score">Move the mouse over the map to see the score for other answers.</div>
        ${kernelComparison(revealed.dist, q)}
      </div>
      <div class="card"><h2>Your distribution</h2><ul class="blobs" id="blobs"></ul></div>
      <div class="actions"><button class="primary" id="next">${index + 1 >= questions.length ? "Finish" : "Next question"} <kbd>Enter</kbd></button></div>
      ${optionsCard()}`;
    panel.querySelector("#next")!.addEventListener("click", next);
    bindOptions();
    renderBlobs();
    return;
  }

  panel.innerHTML = `${header}${questionCard}
    <div class="card">
      <h2>Paint your hunch</h2>
      <div class="tools">
        <button data-tool="pan">Pan <kbd>1</kbd></button>
        <button data-tool="paint">Paint <kbd>2</kbd></button>
        <button data-tool="erase">Erase <kbd>3</kbd></button>
      </div>
      <div class="row"><label for="brush">Brush size</label><input id="brush" type="range" min="6" max="200" step="1" value="${brushPx}"><output id="brush-out">${brushPx} px</output></div>
      <div class="row"><label for="strength">Strength</label><input id="strength" type="range" min="0.2" max="3" step="0.1" value="${strength}"><output id="strength-out">${strength.toFixed(1)}×</output></div>
      <div class="row"><label for="floor">World floor</label><input id="floor" type="range" min="0" max="0.5" step="0.01" value="${floor}"><output id="floor-out">${Math.round(floor * 100)}%</output></div>
      <p class="hint warn" id="brush-warn" hidden>Brush too large for this tolerance; capped at ${MAX_BRUSH_RINGS} cells radius. Use the world floor for broad uncertainty.</p>
      <p class="hint"><span class="legend solid"></span> Brush footprint &nbsp; <span class="legend dashed"></span> One tolerance (${fmtKm(q.toleranceKm)}): the distance at which credit halves.</p>
      <p class="hint">Hold <kbd>Space</kbd> to pan while painting. <kbd>[</kbd> <kbd>]</kbd> resize the brush. Scroll to zoom. Paint again over an area to weight it more.</p>
      <div class="actions"><button class="danger" id="clear">Clear</button><button class="primary" id="submit" disabled>Submit <kbd>Enter</kbd></button></div>
    </div>
    <div class="card" id="live-card" hidden></div>
    <div class="card"><h2>Your distribution</h2><ul class="blobs" id="blobs"></ul>
      <p class="hint">All paint is normalised to 100% together with the world floor, which spreads that share evenly over the whole planet.</p></div>
    ${optionsCard()}`;

  panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => setTool(b.dataset.tool as Tool)),
  );
  const brushIn = panel.querySelector<HTMLInputElement>("#brush")!;
  brushIn.addEventListener("input", () => setBrushPx(Number(brushIn.value)));
  const strengthIn = panel.querySelector<HTMLInputElement>("#strength")!;
  strengthIn.addEventListener("input", () => {
    strength = Number(strengthIn.value);
    panel.querySelector<HTMLOutputElement>("#strength-out")!.value = `${strength.toFixed(1)}×`;
  });
  const floorIn = panel.querySelector<HTMLInputElement>("#floor")!;
  floorIn.addEventListener("input", () => {
    floor = Number(floorIn.value);
    panel.querySelector<HTMLOutputElement>("#floor-out")!.value = `${Math.round(floor * 100)}%`;
    renderBlobs();
  });
  panel.querySelector("#clear")!.addEventListener("click", () => {
    layer.clear();
    queueRender();
  });
  panel.querySelector("#submit")!.addEventListener("click", submit);
  bindOptions();
}

function optionsCard(): string {
  return `<div class="card options"><h2>Difficulty</h2>
    <label><input type="checkbox" id="opt-labels" ${showLabels ? "checked" : ""}> Show place names</label>
    <label><input type="checkbox" id="opt-borders" ${showBorders ? "checked" : ""}> Show country borders</label>
    <label><input type="checkbox" id="opt-detail" ${showDetail ? "checked" : ""}> Show roads, buildings and urban areas</label>
    <label><input type="checkbox" id="opt-water" ${showInlandWater ? "checked" : ""}> Show rivers and lakes</label>
    <h2 style="margin-top:10px">Playtest</h2>
    <label><input type="checkbox" id="opt-cheat" ${cheatLiveScore ? "checked" : ""}> Show live score and the real answer while painting</label>
    <label>Scoring kernel <select id="opt-kernel" style="flex:1">${KERNELS.map((k) => `<option value="${k.id}" ${k.id === kernelId ? "selected" : ""}>${k.label}</option>`).join("")}</select></label>
  </div>`;
}

function bindOptions(): void {
  const labels = panel.querySelector<HTMLInputElement>("#opt-labels")!;
  labels.addEventListener("change", () => {
    showLabels = labels.checked;
    gameMap.setLabels(showLabels);
  });
  const borders = panel.querySelector<HTMLInputElement>("#opt-borders")!;
  borders.addEventListener("change", () => {
    showBorders = borders.checked;
    gameMap.setBorders(showBorders);
  });
  const detail = panel.querySelector<HTMLInputElement>("#opt-detail")!;
  detail.addEventListener("change", () => {
    showDetail = detail.checked;
    gameMap.setDetail(showDetail);
  });
  const water = panel.querySelector<HTMLInputElement>("#opt-water")!;
  water.addEventListener("change", () => {
    showInlandWater = water.checked;
    gameMap.setInlandWater(showInlandWater);
  });
  const cheat = panel.querySelector<HTMLInputElement>("#opt-cheat")!;
  cheat.addEventListener("change", () => {
    cheatLiveScore = cheat.checked;
    renderLiveScore();
  });
  const kernelSel = panel.querySelector<HTMLSelectElement>("#opt-kernel")!;
  kernelSel.addEventListener("change", () => {
    kernelId = kernelSel.value;
    if (phase === "reveal" && revealed) {
      // Re-score the submitted paint under the new kernel so the round record
      // and the reveal reflect the kernel being playtested.
      const q = question();
      const { score, A, B } = scoreDistribution(revealed.dist, q.answer, q.toleranceKm, activeKernel());
      revealed.result.score = score;
      revealed.result.A = A;
      revealed.result.B = B;
      revealed.B = B;
      renderPanel();
    } else {
      renderLiveScore();
    }
  });
}

// ---- boot ------------------------------------------------------------------

async function boot(): Promise<void> {
  panel.innerHTML = `<h1>Hunch Map</h1><p class="hint">Loading…</p>`;
  const [qs] = await Promise.all([loadQuestions(), gameMap.ready]);
  questions = shuffle(qs, 20260906);
  gameMap.applyTheme(THEME);
  gameMap.setLabels(showLabels);
  gameMap.setBorders(showBorders);
  gameMap.setDetail(showDetail);
  gameMap.setInlandWater(showInlandWater);
  startRound();
}

// Handy for playtest scripts and the browser console.
declare global {
  interface Window {
    hunch: { map: typeof map; gameMap: GameMap };
  }
}
window.hunch = { map, gameMap };

boot().catch((err) => {
  panel.innerHTML = `<h1>Hunch Map</h1><p class="warn">${String(err)}</p>`;
});
