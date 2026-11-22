import type { ReadonlySignal } from "@preact/signals"
import {
  allFlags,
  cheatLiveScore,
  globeView,
  headsetPassthrough,
  soloKernelId,
  soloMapDetail,
  soloTypes,
  soundOn,
  startOnPan
} from "../settings/settings"

enum TrackedSetting {
  LIVE_SCORE = "LIVE_SCORE",
  PRACTICE_SCORING = "PRACTICE_SCORING",
  PRACTICE_TYPES = "PRACTICE_TYPES",
  PRACTICE_MAP_DETAIL = "PRACTICE_MAP_DETAIL",
  ALL_FLAGS = "ALL_FLAGS",
  HEADSET_PASSTHROUGH = "HEADSET_PASSTHROUGH",
  START_ON_PAN = "START_ON_PAN",
  GLOBE = "GLOBE",
  SOUND = "SOUND"
}

/** The device settings a player changes, by the name analytics gives each. */
export const TRACKED_SETTINGS: Record<TrackedSetting, ReadonlySignal<unknown>> = {
  [TrackedSetting.LIVE_SCORE]: cheatLiveScore,
  [TrackedSetting.PRACTICE_SCORING]: soloKernelId,
  [TrackedSetting.PRACTICE_TYPES]: soloTypes,
  [TrackedSetting.PRACTICE_MAP_DETAIL]: soloMapDetail,
  [TrackedSetting.ALL_FLAGS]: allFlags,
  [TrackedSetting.HEADSET_PASSTHROUGH]: headsetPassthrough,
  [TrackedSetting.START_ON_PAN]: startOnPan,
  [TrackedSetting.GLOBE]: globeView,
  [TrackedSetting.SOUND]: soundOn
}
