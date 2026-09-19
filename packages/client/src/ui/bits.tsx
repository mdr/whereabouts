import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { commonsImageUrl, commonsPageUrl, cellSpacingKm, type QuestionView } from "@whereabouts/shared";

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

export function QuestionCard({ q, res }: { q: QuestionView; res?: number }) {
  return (
    <div class="card question">
      <p class="prompt">{q.prompt}</p>
      {q.image && (
        <>
          <img src={commonsImageUrl(q.image)} alt="" referrerpolicy="no-referrer" />
          <div class="credit">
            Image:{" "}
            <a href={commonsPageUrl(q.image)} target="_blank" rel="noopener">
              Wikimedia Commons
            </a>
          </div>
        </>
      )}
      <div class="tolerance">
        <span class="swatch" />
        <span>
          Tolerance <b>{fmtKm(q.toleranceKm)}</b>
          {res !== undefined && (
            <>
              {" "}
              · cells ≈ {fmtKm(cellSpacingKm(res))} (H3 res {res})
            </>
          )}
        </span>
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
