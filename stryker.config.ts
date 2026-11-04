import type { PartialStrykerOptions } from "@stryker-mutator/api/core"

export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  coverageAnalysis: "perTest",
  incremental: true,
  incrementalFile: "smoke-out/mutation/incremental.json",
  reporters: ["clear-text", "html", "json", "progress"],
  clearTextReporter: { logTests: false },
  htmlReporter: { fileName: "smoke-out/mutation/report.html" },
  jsonReporter: { fileName: "smoke-out/mutation/report.json" },
  // In a sandbox copy, imports between workspace packages would resolve to the unmutated originals.
  inPlace: true,
  tempDirName: "smoke-out/mutation/tmp"
} satisfies PartialStrykerOptions
