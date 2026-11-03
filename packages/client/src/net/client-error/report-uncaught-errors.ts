import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "./report-client-error"

/** Browsers raise this for layout that settled late; it is not a fault. */
const HARMLESS = "ResizeObserver loop"

export const reportUncaughtErrors = (): void => {
  window.addEventListener("error", (event) => {
    if (event.message.includes(HARMLESS)) return
    reportClientError(ClientErrorKind.UNCAUGHT, event.error ?? event.message)
  })
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(ClientErrorKind.UNHANDLED_REJECTION, event.reason)
  })
}
