import { MapDetail } from "@whereabouts/shared/protocol"

/** The reveal's detail: everything but roads, beyond the guessing levels. */
export enum RevealDetail {
  REVEAL = "REVEAL"
}
export type ShownDetail = MapDetail | RevealDetail

export const DETAIL_RANK: Record<ShownDetail, number> = {
  [MapDetail.MINIMAL]: 0,
  [MapDetail.WATER]: 1,
  [MapDetail.PHYSICAL]: 2,
  [MapDetail.POLITICAL]: 3,
  [RevealDetail.REVEAL]: 4
}
