import "./global.css"
import "./test-hooks"
import { render } from "preact"
import { App } from "./app"
import { installSound } from "./sound/sound"
import { reloadOnStaleBuild } from "./net/stale-build"
import { reportUncaughtErrors } from "./net/client-error/report-uncaught-errors"
import { trackKeyboardFocus } from "./keyboard/keys"
import { createAppTelemetry } from "./telemetry/app-telemetry"
import { logAppStarted, trackScreens } from "./telemetry/app-events"
import { trackSettings } from "./telemetry/track-settings"
import { TelemetryProvider } from "./telemetry/use-telemetry"
import { TRACKED_SETTINGS } from "./telemetry/tracked-settings"

reloadOnStaleBuild()
reportUncaughtErrors()
trackKeyboardFocus()
installSound()

const telemetry = createAppTelemetry()
logAppStarted(telemetry)
trackScreens(telemetry)
trackSettings(telemetry, TRACKED_SETTINGS)

render(
  <TelemetryProvider value={telemetry}>
    <App />
  </TelemetryProvider>,
  document.getElementById("app")!
)
