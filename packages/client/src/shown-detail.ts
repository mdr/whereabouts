/**
 * What the map shows at each level of detail, for the page's map and the
 * headset's globe alike. Each level adds to the one before it.
 */
import { MapDetail } from "@whereabouts/shared/protocol"

/** The reveal's detail: everything but roads, beyond the guessing levels. */
export enum RevealDetail {
  REVEAL = "REVEAL"
}
export type ShownDetail = MapDetail | RevealDetail

const DETAIL_RANK: Record<ShownDetail, number> = {
  [MapDetail.MINIMAL]: 0,
  [MapDetail.WATER]: 1,
  [MapDetail.PHYSICAL]: 2,
  [MapDetail.POLITICAL]: 3,
  [RevealDetail.REVEAL]: 4
}

// An unknown level (a stale saved setting, say) counts as minimal.
// oxlint-disable-next-line typescript/no-unnecessary-condition -- saved settings are not checked against the type
const rank = (detail: ShownDetail): number => DETAIL_RANK[detail] ?? 0

/** Rivers and lakes. */
export const showsInlandWater = (detail: ShownDetail): boolean => rank(detail) >= 1
/** Relief, natural colour, ice and forest. */
export const showsTerrain = (detail: ShownDetail): boolean => rank(detail) >= 2
/** National borders; on the Political map they also guide the Fill tool. */
export const showsBorders = (detail: ShownDetail): boolean => rank(detail) >= 3
/** Place names, towns and state lines: hints while guessing, so only on the reveal. */
export const showsPlaces = (detail: ShownDetail): boolean => rank(detail) >= 4
