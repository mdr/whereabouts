import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../../net/client-error/report-client-error"
import type { WebGLRenderer } from "three"
import type { BordersData } from "@whereabouts/shared/borders"
import type { LandMaskData } from "@whereabouts/shared/paint/land"
import landUrl from "@whereabouts/shared/land.json?url"
import bordersUrl from "@whereabouts/shared/borders.json?url"
import { THEME } from "../../map/themes"
import { fetchBuildJson } from "../../net/stale-build"
import type { Globe } from "./globe"
import { drawBorders, drawColour, drawLand } from "./globe-texture"

/** Fetch the land and borders and draw the globe's textures; the colour one finishes in the background. */
export const drawGlobe = async (globe: Globe, renderer: WebGLRenderer): Promise<void> => {
  const [land, borders] = await Promise.all([
    fetchBuildJson<LandMaskData>(landUrl),
    fetchBuildJson<BordersData>(bordersUrl)
  ])
  // The drawing holds the page up for a second: let it show the stage first.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
  const landOnly = drawLand(globe.landCanvas, land, THEME)
  globe.landDrawn(renderer)
  drawBorders(globe.bordersCanvas, borders, THEME)
  globe.bordersDrawn(renderer)
  // Not needed until the first answer, and it waits on the network.
  drawColour(globe.colourCanvas, globe.landCanvas, landOnly).then(
    () => globe.colourDrawn(renderer),
    (error: unknown) => {
      console.warn("could not colour the VR globe", error)
      reportClientError(ClientErrorKind.VR_LOAD, error)
    }
  )
}
