import { CLIENT_ERRORS_PATH, type ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { buildReport } from "./build-report"
import { ReportGate } from "./report-gate"

const gate = new ReportGate()

/** Tells the server something failed in this browser. Never throws and never waits; a failure to report is dropped. */
export const reportClientError = (kind: ClientErrorKind, error: unknown): void => {
  try {
    const report = buildReport(kind, error, {
      hash: location.hash,
      scripts: Array.from(document.scripts, (script) => script.src)
    })
    if (!gate.admit(report)) return
    fetch(CLIENT_ERRORS_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true
    }).catch(() => undefined)
  } catch {
    // Reporting must never be what breaks.
  }
}
