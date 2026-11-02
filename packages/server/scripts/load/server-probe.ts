/**
 * Loaded into the server process with --import: samples its event-loop delay,
 * memory and CPU once a second, for the load test. Started by the load test,
 * it reports over IPC; on another machine, set PROBE_PORT and the load test
 * fetches the samples from there (--probe-url).
 */
import { createServer } from "node:http"
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
/** Ten minutes of samples, enough for any one round. */
const KEPT_SAMPLES = 600

const delay = monitorEventLoopDelay({ resolution: 10 })
delay.enable()
let lastCpu = process.cpuUsage()
let lastAt = performance.now()
const recent: ProbeSample[] = []

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
  recent.push(sample)
  if (recent.length > KEPT_SAMPLES) recent.shift()
  delay.reset()
  lastCpu = process.cpuUsage()
  lastAt = now
}, INTERVAL_MS).unref()

const port = process.env["PROBE_PORT"]
if (port) {
  // "::" so Fly's private network, which is IPv6, reaches it.
  createServer((_, response) => {
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify(recent))
  })
    .listen(Number(port), "::")
    .unref()
}
