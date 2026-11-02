/**
 * Loaded into the server process with --import: reports its event-loop delay,
 * memory and CPU to the load test over IPC once a second.
 */
import { monitorEventLoopDelay } from "node:perf_hooks"

export interface ProbeSample {
  at: number
  eventLoopMaxMs: number
  eventLoopP99Ms: number
  rss: number
  heapUsed: number
  arrayBuffers: number
  /** Share of one core used since the last sample. */
  cpu: number
}

const INTERVAL_MS = 1000

const delay = monitorEventLoopDelay({ resolution: 10 })
delay.enable()
let lastCpu = process.cpuUsage()
let lastAt = performance.now()

setInterval(() => {
  const cpu = process.cpuUsage(lastCpu)
  const now = performance.now()
  const memory = process.memoryUsage()
  const sample: ProbeSample = {
    at: Date.now(),
    eventLoopMaxMs: delay.max / 1e6,
    eventLoopP99Ms: delay.percentile(99) / 1e6,
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    arrayBuffers: memory.arrayBuffers,
    cpu: (cpu.user + cpu.system) / 1000 / (now - lastAt)
  }
  process.send?.(sample)
  delay.reset()
  lastCpu = process.cpuUsage()
  lastAt = now
}, INTERVAL_MS).unref()
