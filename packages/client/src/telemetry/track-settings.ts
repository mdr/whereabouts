import type { ReadonlySignal } from "@preact/signals"
import type { FieldValue } from "@whereabouts/shared/protocol/client-telemetry"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import type { Telemetry } from "./telemetry"

const fieldValue = (value: unknown): FieldValue =>
  typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? value : String(value)

/** Each change a player makes to this device's settings, from whichever control, but not their values on loading. */
export const trackSettings = (
  { analytics }: Pick<Telemetry, "analytics">,
  settings: Record<string, ReadonlySignal<unknown>>
): void => {
  for (const [setting, value] of Object.entries(settings)) {
    let loaded = false
    value.subscribe((now) => {
      if (loaded)
        analytics.track(ANALYTICS_CODES.settings.changed, "changed a setting", { setting, value: fieldValue(now) })
      loaded = true
    })
  }
}
