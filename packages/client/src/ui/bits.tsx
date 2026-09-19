import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
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
      <div class="tolerance" title="Credit halves at this distance from the true spot; shown as the dashed ring.">
        <span class="swatch" />
        <span>
          Tolerance <b>{fmtKm(q.toleranceKm)}</b>
        </span>
      </div>
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
      {large && (
        <div class="lightbox" onClick={() => setLarge(false)} title="Click or press Escape to shrink">
          <div class="lightbox-frame">
            <img src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
            {credit}
          </div>
        </div>
      )}
    </>
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
