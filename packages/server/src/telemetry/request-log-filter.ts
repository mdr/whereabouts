import type { LogLevel } from "./log-event.ts"

/**
 * How to log a finished request, or undefined to leave it out. Health checks
 * and files served fine are routine; what is worth a line is an API call, a
 * server error, and a missing bundle file (an old tab after a deploy).
 */
export const requestLogLevel = (path: string, statusCode: number): LogLevel | undefined => {
  if (statusCode >= 500) return "error"
  if (path === "/api/health") return undefined
  if (path.startsWith("/api/")) return "info"
  if (path.startsWith("/assets/") && statusCode === 404) return "info"
  return undefined
}
