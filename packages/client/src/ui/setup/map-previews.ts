import { MapDetail } from "@whereabouts/shared/protocol/config"
import minimal from "../../assets/map-minimal.jpg"
import water from "../../assets/map-water.jpg"
import physical from "../../assets/map-physical.jpg"
import political from "../../assets/map-political.jpg"

/** The same frame at each level, from scripts/map-detail-previews.mjs. */
export const MAP_PREVIEWS: Record<MapDetail, string> = {
  [MapDetail.MINIMAL]: minimal,
  [MapDetail.WATER]: water,
  [MapDetail.PHYSICAL]: physical,
  [MapDetail.POLITICAL]: political
}
