import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { commonsImageUrl, commonsPageUrl, type QuestionView } from "@whereabouts/shared";
import { Icon } from "./icons";

export function fmtKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`;
}

export function Card({ title, children, class: cls }: { title?: string; children: ComponentChildren; class?: string }) {
  return (
    <div class={`card ${cls ?? ""}`}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}

/**
 * The bar along the bottom of the map. It publishes its height as
 * `--toolbar-h` on the document so the map's own corner controls (the
 * attribution button) can sit above it on phones, where the bar spans the
 * full width.
 */
export function HudBottom({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () => root.style.setProperty("--toolbar-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--toolbar-h");
    };
  }, []);
  return (
    <div class="hud-bottom toolbar" ref={ref}>
      {children}
    </div>
  );
}

/**
 * One-line strip at the top of the HUD: title (a link home where allowed),
 * round counter, and anything the screen wants on the right (a countdown).
 */
export function HudHeader({
  home,
  round,
  total,
  right,
}: {
  home?: boolean;
  round: number;
  total: number | string;
  right?: ComponentChildren;
}) {
  return (
    <div class="hud-header">
      {home ? (
        <a href="#/" class="brand">
          Whereabouts
        </a>
      ) : (
        <span class="brand">Whereabouts</span>
      )}
      <span class="round">
        Round {round} / {total}
      </span>
      {right}
    </div>
  );
}

export function QuestionCard({
  q,
  children,
  credit,
}: {
  q: QuestionView;
  children?: ComponentChildren;
  /** Show the image credit link. Off while guessing: the Commons file name gives the answer away. */
  credit?: boolean;
}) {
  return (
    <div class="card question">
      <p class="prompt">{q.prompt}</p>
      {q.image && <QuestionImage image={q.image} credit={credit ?? false} />}
      {children}
    </div>
  );
}

/**
 * The question photo. Click it to enlarge over the map; click again or press
 * Escape to shrink back. The Wikimedia Commons credit sits behind a small
 * info icon linking to the file page.
 */
function QuestionImage({ image, credit: showCredit }: { image: string; credit: boolean }) {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLarge(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [large]);
  const credit = !showCredit ? null : (
    <a
      class="credit-icon"
      href={commonsPageUrl(image)}
      target="_blank"
      rel="noopener"
      title="Image from Wikimedia Commons"
      aria-label="Image credit: Wikimedia Commons"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="info" size={14} />
    </a>
  );
  return (
    <>
      <div class="thumb" title="Click to enlarge">
        <img src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" onClick={() => setLarge(true)} />
        {credit}
      </div>
      {large && <Lightbox image={image} credit={credit} onClose={() => setLarge(false)} />}
    </>
  );
}

const MAX_ZOOM = 6;
const CLICK_ZOOM = 2.5;

/**
 * The enlarged photo. Scroll or pinch to zoom about the pointer, drag to pan
 * once zoomed, click the picture to jump between fit and a closer look, and
 * click the backdrop, the close button or press Escape to leave. A larger
 * rendition is fetched than the thumbnail's so zooming has detail to show.
 */
function Lightbox({ image, credit, onClose }: { image: string; credit: ComponentChildren; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const dragged = useRef(false);

  /** Zoom by `factor` keeping the point (cx, cy), relative to the frame centre, fixed. */
  function zoomAt(factor: number, cx: number, cy: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
    if (next === zoom) return;
    const k = next / zoom;
    setPan(next === 1 ? { x: 0, y: 0 } : { x: pan.x * k + cx * (1 - k), y: pan.y * k + cy * (1 - k) });
    setZoom(next);
  }
  /** Client coordinates to an offset from the frame centre. */
  function fromCentre(clientX: number, clientY: number) {
    const r = frame.current?.getBoundingClientRect();
    if (!r) return { cx: 0, cy: 0 };
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) };
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { cx, cy } = fromCentre(e.clientX, e.clientY);
    zoomAt(Math.exp(-e.deltaY * 0.002), cx, cy);
  };
  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    if (pointers.current.size === 2) pinchDist.current = pinchDistance();
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchDist.current) {
      const dist = pinchDistance();
      const [a, b] = [...pointers.current.values()];
      const { cx, cy } = fromCentre((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      zoomAt(dist / pinchDist.current, cx, cy);
      pinchDist.current = dist;
      dragged.current = true;
    } else if (pointers.current.size === 1 && zoom > 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
      setPan({ x: pan.x + dx, y: pan.y + dy });
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };
  function pinchDistance() {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
  }
  const onImageClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (dragged.current) return; // the end of a drag or pinch, not a click
    if (zoom > 1) zoomAt(1 / zoom, 0, 0);
    else {
      const { cx, cy } = fromCentre(e.clientX, e.clientY);
      zoomAt(CLICK_ZOOM, cx, cy);
    }
  };

  return (
    <div
      class="lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      title="Scroll or pinch to zoom, drag to pan; click the backdrop or press Escape to close"
    >
      <button class="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div
        class={`lightbox-frame ${zoom > 1 ? "zoomed" : ""}`}
        ref={frame}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={commonsImageUrl(image, 1600)}
          alt=""
          referrerpolicy="no-referrer"
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          onClick={onImageClick}
        />
        {credit}
      </div>
    </div>
  );
}

/** Ticks once a second; returns whole seconds remaining, never negative. */
export function useCountdown(msRemaining: () => number): number {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil(msRemaining() / 1000));
}

export function Countdown({ msRemaining, warnAt = 10 }: { msRemaining: () => number; warnAt?: number }) {
  const s = useCountdown(msRemaining);
  return <div class={`countdown ${s <= warnAt ? "warn" : ""}`}>{s}</div>;
}

/** Score, A and B in the dev drawer. */
export function ScoreParts({ A, B }: { A: number; B: number }) {
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
