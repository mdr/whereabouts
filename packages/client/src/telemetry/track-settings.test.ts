import { describe, expect, it } from "vite-plus/test"
import { signal } from "@preact/signals"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { trackSettings } from "./track-settings"
import { testTelemetry } from "./test-telemetry"

describe("trackSettings", () => {
  it("tracks a change to a setting, but not the value it loaded with", () => {
    const telemetry = testTelemetry()
    const sound = signal(true)
    trackSettings(telemetry, { SOUND: sound })
    expect(telemetry.codes()).toEqual([])
    sound.value = false
    expect(telemetry.codes()).toEqual([ANALYTICS_CODES.settings.changed])
    expect(telemetry.lastFields(ANALYTICS_CODES.settings.changed)).toEqual({ setting: "SOUND", value: false })
  })
})
