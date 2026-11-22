import { createContext } from "preact"
import { useContext } from "preact/hooks"
import type { Telemetry } from "./telemetry"

const TelemetryContext = createContext<Telemetry | undefined>(undefined)

export const TelemetryProvider = TelemetryContext.Provider

export const useTelemetry = (): Telemetry => {
  const telemetry = useContext(TelemetryContext)
  if (!telemetry) throw new Error("useTelemetry is only for screens inside the app")
  return telemetry
}
