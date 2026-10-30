import { useEffect } from "preact/hooks"
import { loadRegions, regionsFailed } from "../regions"
import { loadingOutlinesTestIds } from "./LoadingOutlinesTestIds"

/** Stands in for a screen that needs the outlines until they arrive, and offers another try if they do not. */
export function LoadingOutlines() {
  const load = () => void loadRegions().catch((err: unknown) => console.warn("could not load outlines", err))
  useEffect(load, [])
  return (
    <div class="hud">
      <div class="hud-center">
        {regionsFailed.value ? (
          <div class="card" data-testid={loadingOutlinesTestIds.failed}>
            <p>Couldn't load the outlines. Check your connection.</p>
            <button class="primary" onClick={load} data-testid={loadingOutlinesTestIds.retryButton}>
              Try again
            </button>
          </div>
        ) : (
          <p class="card" data-testid={loadingOutlinesTestIds.loading}>
            Loading outlines…
          </p>
        )}
      </div>
    </div>
  )
}
