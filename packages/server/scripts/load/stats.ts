export interface Summary {
  count: number
  p50: number
  p95: number
  max: number
}

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? Number.NaN

export const summarise = (values: readonly number[]): Summary => {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? Number.NaN
  }
}

export const formatSummary = ({ count, p50, p95, max }: Summary, unit: string): string =>
  count === 0 ? "none" : `p50 ${p50.toFixed(0)}${unit}, p95 ${p95.toFixed(0)}${unit}, max ${max.toFixed(0)}${unit}`

export const mebibytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`
