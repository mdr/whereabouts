import { useEffect } from "preact/hooks"
import { loadRegions, regionsFailed } from "../regions"
import { loadingOutlinesTestIds } from "./LoadingOutlinesTestIds"
import { Card } from "./Card"
import { Hud, HudCenter } from "./Hud"

/** Stands in for a screen that needs the outlines until they arrive, and offers another try if they do not. */
export function LoadingOutlines() {
  const load = () => void loadRegions().catch((err: unknown) => console.warn("could not load outlines", err))
  useEffect(load, [])
  return (
    <Hud>
      <HudCenter>
        {regionsFailed.value ? (
          <Card data-testid={loadingOutlinesTestIds.failed}>
            <p>Couldn't load the outlines. Check your connection.</p>
            <button class="primary" onClick={load} data-testid={loadingOutlinesTestIds.retryButton}>
              Try again
            </button>
          </Card>
        ) : (
          <Card as="p" data-testid={loadingOutlinesTestIds.loading}>
            Loading outlines…
          </Card>
        )}
      </HudCenter>
    </Hud>
  )
}
