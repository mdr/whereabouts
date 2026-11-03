/** What a test can make fail to download, to check the player is told and can try again. */
export enum Download {
  MAP_STYLE = "MAP_STYLE",
  OUTLINES = "OUTLINES",
  LAND_MASK = "LAND_MASK",
  VR_CODE = "VR_CODE"
}

export const DOWNLOAD_URL: Record<Download, RegExp> = {
  [Download.MAP_STYLE]: /openfreemap\.org\/styles\//,
  [Download.OUTLINES]: /outlines\.json$/,
  [Download.LAND_MASK]: /land\.json$/,
  [Download.VR_CODE]: /\/src\/vr\/index\.ts/
}
