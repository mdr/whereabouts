import type { ClientErrorReport } from "@whereabouts/shared/protocol/client-error"

/** The most reports one page load sends; a loop of failures cannot flood the server. */
export const MAX_REPORTS_PER_PAGE = 10

/** Lets a report through once per kind and message, and only so many in all. */
export class ReportGate {
  private readonly seen = new Set<string>()

  admit(report: ClientErrorReport): boolean {
    const key = `${report.kind}\n${report.message}`
    if (this.seen.has(key) || this.seen.size >= MAX_REPORTS_PER_PAGE) return false
    this.seen.add(key)
    return true
  }
}
